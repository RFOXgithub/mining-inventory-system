import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { writeAudit } from "@/lib/audit";
import { assertAction, assertPlants, assertVerifier } from "./service";
import { deactivateSchema, idSchema, locationEditSchema, locationSchema, plantEditSchema, plantSchema, verifySchema } from "./schema";

const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));

async function assertStockpile(tx: Prisma.TransactionClient, actor: AccessActor, stockpileId: string | null, kind: string) {
  if (!stockpileId) return;
  if (!actor.allPlants) throw new DomainError(403, "Mapping stockpile legacy memerlukan cakupan semua plant.");
  if (!["STOCKPILE", "WAREHOUSE"].includes(kind)) throw new DomainError(422, "Stockpile hanya dapat ditautkan ke stockpile/gudang.");
  const stockpile = await tx.stockpile.findUnique({ where: { id: stockpileId } });
  if (!stockpile || stockpile.status === "INACTIVE") throw new DomainError(422, "Stockpile tidak ditemukan atau nonaktif.");
}

export async function createPlant(client: PrismaClient, actor: AccessActor, raw: unknown, request?: Request) {
  const input = plantSchema.parse(raw);
  assertAction(actor, "master.location.create");
  if (!actor.allPlants) throw new DomainError(403, "Membuat plant baru memerlukan cakupan semua plant.");
  return client.$transaction(async tx => {
    const row = await tx.plant.create({ data: { ...input, createdBy: actor.userId } });
    await writeAudit(tx, { userId: actor.userId, module: "MASTER_PLANT", action: "CREATE", recordId: row.id, newValue: json(row), request });
    return row;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
}

export async function createLocation(client: PrismaClient, actor: AccessActor, raw: unknown, request?: Request) {
  const input = locationSchema.parse(raw);
  assertAction(actor, "master.location.create", [input.plantId]);
  return client.$transaction(async tx => {
    await assertPlants(tx, [input.plantId]);
    await assertStockpile(tx, actor, input.stockpileId, input.kind);
    const row = await tx.plantLocation.create({ data: { ...input, createdBy: actor.userId } });
    await writeAudit(tx, { userId: actor.userId, module: "MASTER_LOCATION", action: "CREATE", recordId: row.id, newValue: json(row), request });
    return row;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
}

export async function changeLocation(client: PrismaClient, actor: AccessActor, resource: "plant" | "location", id: string, raw: unknown, request?: Request) {
  idSchema.parse(id);
  const action = (raw as { action?: string } | null)?.action;
  const input = action === "verify" ? verifySchema.parse(raw) : action === "deactivate" ? deactivateSchema.parse(raw) : resource === "plant" ? plantEditSchema.parse(raw) : locationEditSchema.parse(raw);
  const permission = `master.location.${action === "verify" ? "verify" : action === "deactivate" ? "deactivate" : "update"}`;
  return client.$transaction(async tx => {
    const row = resource === "plant" ? await tx.plant.findUnique({ where: { id } }) : await tx.plantLocation.findUnique({ where: { id } });
    if (!row) throw new DomainError(404, "Plant/lokasi tidak ditemukan.");
    const plantId = "plantId" in row ? row.plantId : row.id;
    assertAction(actor, permission, [plantId]);
    if (row.version !== input.version) throw new DomainError(409, "Plant/lokasi telah berubah. Muat ulang.");
    let patch: Record<string, unknown>;
    if ("action" in input && input.action === "verify") {
      assertVerifier(actor, permission, row, [plantId]);
      if (!row.active) throw new DomainError(409, "Master nonaktif tidak dapat diverifikasi.");
      if (resource === "location") {
        const plant = await tx.plant.findUnique({ where: { id: plantId } });
        if (!plant?.active || plant.verificationStatus !== "VERIFIED") throw new DomainError(422, "Plant induk harus aktif dan terverifikasi.");
      }
      patch = { verificationStatus: "VERIFIED", evidence: input.evidence, verifiedBy: actor.userId, verifiedAt: new Date() };
    } else if ("action" in input) {
      if (resource === "location") {
        const balances = await tx.stockLedgerEntry.groupBy({ by: ["itemId"], where: { locationId: id }, _sum: { quantity: true } });
        if (balances.some(b => b._sum.quantity && !b._sum.quantity.isZero()) || await tx.stockDocumentLine.count({ where: { OR: [{ locationId: id }, { destinationId: id }], document: { status: "SUBMITTED" } } })) throw new DomainError(409, "Lokasi masih memiliki saldo atau dokumen inventory menunggu tindakan.");
      }
      if (resource === "plant" && (await tx.plantLocation.count({ where: { plantId, active: true } }) || await tx.catalogItemPlant.count({ where: { plantId, item: { active: true } } }))) throw new DomainError(409, "Nonaktifkan/pindahkan lokasi dan master material aktif lebih dahulu.");
      patch = { active: false, updatedBy: actor.userId };
    } else {
      if ("stockpileId" in input) {
        if ("plantId" in row && (input.kind !== row.kind || input.stockpileId !== row.stockpileId) && await tx.stockDocumentLine.count({ where: { OR: [{ locationId: id }, { destinationId: id }] } })) throw new DomainError(409, "Jenis/mapping lokasi dengan histori inventory tidak dapat diganti.");
        if ("stockpileId" in row && row.stockpileId && row.stockpileId !== input.stockpileId) throw new DomainError(409, "Mapping stockpile yang sudah tersimpan tidak dapat diganti langsung.");
        await assertStockpile(tx, actor, input.stockpileId, input.kind);
      } else if (resource === "plant" && input.kind !== row.kind && (await tx.plantLocation.count({ where: { plantId } }) || await tx.catalogItemPlant.count({ where: { plantId } }))) throw new DomainError(409, "Jenis plant yang memiliki referensi tidak dapat diganti langsung.");
      const { version: _version, reason: _reason, ...fields } = input;
      patch = { ...fields, verificationStatus: "UNVERIFIED", evidence: null, verifiedBy: null, verifiedAt: null, updatedBy: actor.userId };
    }
    const result = resource === "plant"
      ? await tx.plant.updateMany({ where: { id, version: input.version }, data: { ...patch, version: { increment: 1 } } })
      : await tx.plantLocation.updateMany({ where: { id, version: input.version }, data: { ...patch, version: { increment: 1 } } });
    if (!result.count) throw new DomainError(409, "Master telah berubah. Muat ulang.");
    const updated = resource === "plant" ? await tx.plant.findUniqueOrThrow({ where: { id } }) : await tx.plantLocation.findUniqueOrThrow({ where: { id } });
    await writeAudit(tx, { userId: actor.userId, module: resource === "plant" ? "MASTER_PLANT" : "MASTER_LOCATION", action: action?.toUpperCase() ?? "UPDATE", recordId: id, previousValue: json(row), newValue: json({ record: updated, reason: "reason" in input ? input.reason : "evidence" in input ? input.evidence : null }), request });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
}
