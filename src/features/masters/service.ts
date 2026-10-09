import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor, can, canApprove } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { writeAudit } from "@/lib/audit";
import { aliasSchema, childVerifySchema, conversionSchema, deactivateSchema, idSchema, materialEditSchema, materialSchema, normalizeAlias, verifySchema } from "./schema";

const include = { primaryUom: true, plants: true, aliases: true, conversions: { include: { fromUom: true, toUom: true }, orderBy: { version: "desc" as const } } };
type Tx = Prisma.TransactionClient;
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));

export function assertAction(actor: AccessActor, permission: string, plantIds: string[] = []) {
  if (!can(actor, permission) || plantIds.some(id => !can(actor, permission, id))) throw new DomainError(403, "Action atau cakupan plant tidak diizinkan.");
}

export function assertVerifier(actor: AccessActor, permission: string, row: { createdBy: string | null; updatedBy?: string | null }, plantIds: string[]) {
  assertAction(actor, permission, plantIds);
  if (!canApprove(actor, permission, row.createdBy ?? "") || row.updatedBy === actor.userId) throw new DomainError(403, "Maker tidak boleh memverifikasi data sendiri.");
}

export async function assertPlants(tx: Tx, ids: string[]) {
  if (await tx.plant.count({ where: { id: { in: ids }, active: true } }) !== ids.length) throw new DomainError(422, "Plant tidak ditemukan atau nonaktif.");
}

async function itemForWrite(tx: Tx, actor: AccessActor, id: string, permission: string) {
  const item = await tx.catalogItem.findUnique({ where: { id: idSchema.parse(id) }, include });
  if (!item) throw new DomainError(404, "Material tidak ditemukan.");
  if (!actor.allPlants && !item.plants.length) throw new DomainError(403, "Material legacy belum dipetakan ke plant.");
  assertAction(actor, permission, item.plants.map(p => p.plantId));
  return item;
}

export async function createMaterial(client: PrismaClient, actor: AccessActor, raw: unknown, request?: Request) {
  const data = materialSchema.parse(raw);
  assertAction(actor, "master.material.create", data.plantIds);
  return client.$transaction(async tx => {
    await assertPlants(tx, data.plantIds);
    const uom = await tx.uom.findUnique({ where: { id: data.primaryUomId } });
    if (!uom?.active) throw new DomainError(422, "UOM tidak aktif atau tidak ditemukan.");
    const { plantIds, ...fields } = data;
    const item = await tx.catalogItem.create({ data: { ...fields, createdBy: actor.userId, plants: { create: plantIds.map(plantId => ({ plantId })) } }, include });
    await writeAudit(tx, { userId: actor.userId, module: "MASTER_MATERIAL", action: "CREATE", recordId: item.id, newValue: json(item), request });
    return item;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
}

export async function changeMaterial(client: PrismaClient, actor: AccessActor, id: string, raw: unknown, request?: Request) {
  const action = (raw as { action?: string } | null)?.action;
  const data = action === "verify" ? verifySchema.parse(raw) : action === "deactivate" ? deactivateSchema.parse(raw) : materialEditSchema.parse(raw);
  const permission = `master.material.${action === "verify" ? "verify" : action === "deactivate" ? "deactivate" : "update"}`;
  return client.$transaction(async tx => {
    const item = await itemForWrite(tx, actor, id, permission);
    if (item.version !== data.version) throw new DomainError(409, "Material telah berubah. Muat ulang.");
    let patch: Prisma.CatalogItemUncheckedUpdateManyInput;
    if ("action" in data && data.action === "verify") {
      assertVerifier(actor, permission, item, item.plants.map(p => p.plantId));
      if (!item.active || item.primaryUom.verificationStatus !== "VERIFIED" || !item.primaryUom.active || !item.plants.length) throw new DomainError(422, "Material aktif memerlukan UOM terverifikasi dan mapping plant.");
      if (await tx.plant.count({ where: { id: { in: item.plants.map(p => p.plantId) }, active: true, verificationStatus: "VERIFIED" } }) !== item.plants.length) throw new DomainError(422, "Seluruh plant material harus aktif dan terverifikasi.");
      patch = { verificationStatus: "VERIFIED", evidence: data.evidence, verifiedBy: actor.userId, verifiedAt: new Date() };
    } else if ("action" in data) {
      const balances = await tx.stockLedgerEntry.groupBy({ by: ["locationId"], where: { itemId: id }, _sum: { quantity: true } });
      if (await tx.commerceRecord.count({ where: { status: { in: ["DRAFT", "SUBMITTED", "VERIFIED", "APPROVED", "DISPATCHED"] }, payload: { path: ["lines"], array_contains: [{ itemId: id }] } } })) throw new DomainError(409, "Material masih dirujuk transaksi komersial aktif.");
      if (balances.some(b => b._sum.quantity && !b._sum.quantity.isZero()) || await tx.stockDocumentLine.count({ where: { itemId: id, document: { status: "SUBMITTED" } } })) throw new DomainError(409, "Material masih memiliki saldo atau dokumen inventory menunggu tindakan.");
      patch = { active: false, updatedBy: actor.userId };
    } else {
      assertAction(actor, permission, data.plantIds);
      await assertPlants(tx, data.plantIds);
      const referenced = await tx.stockDocumentLine.findMany({ where: { itemId: id }, select: { location: { select: { plantId: true } }, destination: { select: { plantId: true } } } });
      const commercial = await tx.commerceConfig.findMany({ where: { kind: "PRICE", payload: { path: ["itemId"], equals: id } }, select: { plantId: true } });
      if (commercial.some(c => !data.plantIds.includes(c.plantId))) throw new DomainError(409, "Plant dengan version harga material tidak dapat dicabut.");
      if (referenced.some(line => !data.plantIds.includes(line.location.plantId) || line.destination && !data.plantIds.includes(line.destination.plantId))) throw new DomainError(409, "Plant yang memiliki histori inventory material tidak dapat dicabut.");
      const uom = await tx.uom.findUnique({ where: { id: data.primaryUomId } });
      if (!uom?.active) throw new DomainError(422, "UOM tidak aktif atau tidak ditemukan.");
      // Existing history refers to these snapshots; change them through versions
      // in a later posting package, never by silently changing a referenced unit.
      if (item.legacyProductId || item.legacyMaterialId || item.conversions.length || commercial.length || await tx.stockDocumentLine.count({ where: { itemId: id } })) {
        if (data.primaryUomId !== item.primaryUomId || data.kind !== item.kind) throw new DomainError(409, "Jenis/UOM yang memiliki sumber atau konversi tidak dapat diganti langsung.");
      }
      patch = { code: data.code, name: data.name, kind: data.kind, category: data.category, specification: data.specification, primaryUomId: data.primaryUomId,
        verificationStatus: "UNVERIFIED", evidence: null, verifiedAt: null, verifiedBy: null, updatedBy: actor.userId };
      await tx.catalogItemPlant.deleteMany({ where: { itemId: id } });
      await tx.catalogItemPlant.createMany({ data: data.plantIds.map(plantId => ({ itemId: id, plantId })) });
    }
    const result = await tx.catalogItem.updateMany({ where: { id, version: data.version }, data: { ...patch, version: { increment: 1 } } });
    if (!result.count) throw new DomainError(409, "Material telah berubah. Muat ulang.");
    const updated = await tx.catalogItem.findUniqueOrThrow({ where: { id }, include });
    await writeAudit(tx, { userId: actor.userId, module: "MASTER_MATERIAL", action: action?.toUpperCase() ?? "UPDATE", recordId: id, previousValue: json(item), newValue: json({ record: updated, reason: "reason" in data ? data.reason : "evidence" in data ? data.evidence : null }), request });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
}

export async function changeMaterialChild(client: PrismaClient, actor: AccessActor, itemId: string, section: string, raw: unknown, request?: Request) {
  if (section !== "aliases" && section !== "conversions") throw new DomainError(404, "Bagian material tidak ditemukan.");
  const verifying = (raw as { action?: string } | null)?.action === "verify";
  const data = verifying ? childVerifySchema.parse(raw) : section === "aliases" ? aliasSchema.parse(raw) : conversionSchema.parse(raw);
  const permission = `master.material.${verifying ? "verify" : "update"}`;
  return client.$transaction(async tx => {
    const item = await itemForWrite(tx, actor, itemId, permission);
    if (!item.active) throw new DomainError(409, "Material nonaktif tidak dapat diubah.");
    let row: unknown;
    if ("action" in data) {
      const child = section === "aliases" ? await tx.itemAlias.findUnique({ where: { id: data.id } }) : await tx.uomConversion.findUnique({ where: { id: data.id }, include: { fromUom: true, toUom: true } });
      if (!child || child.itemId !== itemId) throw new DomainError(404, "Referensi material tidak ditemukan.");
      assertVerifier(actor, permission, child, item.plants.map(p => p.plantId));
      if (child.verificationStatus === "VERIFIED") throw new DomainError(409, "Referensi sudah terverifikasi.");
      if ("fromUom" in child && (!child.fromUom.active || !child.toUom.active || child.fromUom.verificationStatus !== "VERIFIED" || child.toUom.verificationStatus !== "VERIFIED")) throw new DomainError(422, "Kedua UOM harus aktif dan terverifikasi.");
      const verification = { verificationStatus: "VERIFIED" as const, evidence: data.evidence, verifiedBy: actor.userId, verifiedAt: new Date() };
      row = section === "aliases" ? await tx.itemAlias.update({ where: { id: data.id }, data: verification }) : await tx.uomConversion.update({ where: { id: data.id }, data: verification });
    } else if ("name" in data) {
      if (normalizeAlias(data.name) === normalizeAlias(item.name)) throw new DomainError(422, "Alias tidak boleh sama dengan nama resmi.");
      row = await tx.itemAlias.create({ data: { itemId, name: data.name, normalizedName: normalizeAlias(data.name), createdBy: actor.userId } });
    } else {
      const units = await tx.uom.findMany({ where: { id: { in: [data.fromUomId, data.toUomId] }, active: true } });
      if (units.length !== 2) throw new DomainError(422, "UOM asal/tujuan tidak aktif atau tidak ditemukan.");
      const from = units.find(u => u.id === data.fromUomId)!, to = units.find(u => u.id === data.toUomId)!;
      const standard: Record<string, string> = { KG: "1", TON: "1000", L: "0.001", M3: "1", PCS: "1" };
      if (from.dimension === to.dimension && standard[from.code] && standard[to.code] && !new Prisma.Decimal(data.factor).equals(new Prisma.Decimal(standard[from.code]).div(standard[to.code]))) throw new DomainError(422, "Faktor bertentangan dengan definisi satuan metrik. Density memakai konversi antar-dimensi.");
      const previous = await tx.uomConversion.findFirst({ where: { itemId, fromUomId: data.fromUomId, toUomId: data.toUomId }, orderBy: { version: "desc" } });
      if (previous && new Date(data.effectiveFrom) <= previous.effectiveFrom) throw new DomainError(409, "Versi baru harus mulai setelah versi sebelumnya.");
      row = await tx.uomConversion.create({ data: { ...data, effectiveFrom: new Date(data.effectiveFrom), itemId, version: (previous?.version ?? 0) + 1, createdBy: actor.userId } });
    }
    await writeAudit(tx, { userId: actor.userId, module: "MASTER_MATERIAL", action: `${verifying ? "VERIFY" : "CREATE"}_${section.toUpperCase()}`, recordId: itemId, newValue: json(row), request });
    return row;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
}

export const materialInclude = include;
