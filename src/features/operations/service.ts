import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor, can } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { writeAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { atomic, references, periodOpen, ensureLegacyAdopted, appendStockMoves, Move } from "@/features/inventory/ledger-service";
import { ConfigInput, RunInput, configSchema, configVerifySchema, runSchema, saveRunSchema, runActionSchema } from "./schema";
import { exactStockQuantity, standardFactor } from "./calculations";

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
export const operationHash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const hash = operationHash;
function fail(message: string, status = 409): never { throw new DomainError(status, message); }
const permission = (kind: string, action: string) => `${kind.startsWith("FUEL_") ? "fuel" : "production"}.${action}`;
function allow(actor: AccessActor, key: string, plantId: string) { if (!can(actor, key, plantId)) fail("Action atau cakupan plant tidak diizinkan.", 403); }
async function plant(tx: Tx, plantId: string) {
  const row = await tx.plant.findUnique({ where: { id: plantId } });
  if (!row?.active || row.verificationStatus !== "VERIFIED") fail("Plant harus aktif/terverifikasi.", 422);
  return row;
}
async function item(tx: Tx, plantId: string, id: string) {
  const row = await tx.catalogItem.findUnique({ where: { id }, include: { primaryUom: true, plants: true } });
  if (!row?.active || row.verificationStatus !== "VERIFIED" || row.kind === "SERVICE" || !row.primaryUom.active || row.primaryUom.verificationStatus !== "VERIFIED" || row.primaryUom.dimension === "UNKNOWN" || !row.plants.some(p => p.plantId === plantId)) fail("Material/UOM harus verified dan sesuai plant.", 422);
  return row;
}
async function converted(tx: Tx, plantId: string, date: Date, line: { itemId: string; uomId: string; quantity: string; conversionId?: string }) {
  const material = await item(tx, plantId, line.itemId), uom = await tx.uom.findUnique({ where: { id: line.uomId } });
  if (!uom?.active || uom.verificationStatus !== "VERIFIED" || uom.dimension === "UNKNOWN") fail("UOM transaksi belum verified.", 422);
  let factor = standardFactor(uom.code, material.primaryUom.code), conversion: { id: string; version: number; evidence: string | null } | null = null;
  if (line.conversionId) {
    const row = await tx.uomConversion.findUnique({ where: { id: line.conversionId } });
    if (!row || row.itemId !== material.id || row.fromUomId !== uom.id || row.toUomId !== material.primaryUomId || row.verificationStatus !== "VERIFIED" || row.effectiveFrom > date) fail("Konversi/density version tidak sah untuk tanggal/material ini.", 422);
    factor = row.factor.toString(); conversion = { id: row.id, version: row.version, evidence: row.evidence };
  }
  if (!factor) fail("Konversi belum verified. Density atau kapasitas kemasan tidak boleh ditebak.", 422);
  let stockQuantity: string;
  try { stockQuantity = exactStockQuantity(line.quantity, factor).toString(); } catch (error) { fail((error as Error).message, 422); }
  return { ...line, stockQuantity, factor, conversion, stockUomId: material.primaryUomId, stockUom: material.primaryUom.code, transactionUom: uom.code, itemName: material.name };
}
async function checkedConfig(tx: Tx, id: string, kind: string, plantId: string, date: Date) {
  const row = await tx.operationalConfig.findUnique({ where: { id } });
  if (!row || row.kind !== kind || row.plantId !== plantId || row.verificationStatus !== "VERIFIED" || row.effectiveFrom > date) fail("Konfigurasi/version belum verified atau tidak berlaku.", 422);
  const current = await tx.operationalConfig.findFirst({ where: { plantId, kind, code: row.code, verificationStatus: "VERIFIED", effectiveFrom: { lte: date } }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }] });
  if (current?.id !== id) fail("Version telah digantikan. Pilih version verified yang berlaku pada tanggal transaksi.", 422);
  return { ...row, payload: configSchema.shape.payload.parse(row.payload) };
}
async function validateConfig(tx: Tx, input: ConfigInput) {
  const owner = await plant(tx, input.plantId), p = input.payload, date = new Date(input.effectiveFrom);
  if (p.kind === "PRODUCT") {
    const material = await item(tx, owner.id, p.itemId);
    if (material.kind !== "PRODUCT" || p.process !== "BLENDING" && owner.kind !== p.process) fail("Klasifikasi output tidak sesuai produk/jenis plant.", 422);
    const prior = await tx.operationalConfig.findMany({ where: { kind: "PRODUCT", verificationStatus: "VERIFIED" } });
    if (prior.some(c => { const old = c.payload as { itemId: string; process: string }; return old.itemId === p.itemId && old.process !== p.process; })) fail("Produk sudah memiliki proses lain; output blending tidak boleh dicatat sebagai output SC.");
  }
  if (p.kind === "FUEL") { if ((await item(tx, owner.id, p.itemId)).primaryUom.code !== "L") fail("BBM harus memakai UOM stok L (liter).", 422); }
  if (p.kind === "MIX") {
    if (p.process !== "BLENDING" && owner.kind !== p.process) fail("Mix design tidak sesuai jenis plant.", 422);
    await item(tx, owner.id, p.outputItemId);
    const outputUom = await tx.uom.findUnique({ where: { id: p.outputUomId } });
    if (!outputUom?.active || outputUom.verificationStatus !== "VERIFIED" || !["M3", "TON"].includes(outputUom.code) || p.process === "AMP" && outputUom.code !== "TON" || ["SC", "BP"].includes(p.process) && outputUom.code !== "M3") fail("UOM pembanding mix design tidak sesuai output terukur.", 422);
    if (new Set(p.components.map(c => c.itemId)).size !== p.components.length) fail("Komponen mix design tidak boleh duplikat.", 422);
    for (const c of p.components) { if (c.itemId === p.outputItemId) fail("Bahan dan hasil mix design tidak boleh sama.", 422); await converted(tx, owner.id, date, c); }
  }
}
export async function createConfig(client: PrismaClient, actor: AccessActor, raw: unknown, request?: Request) {
  const input = configSchema.parse(raw), key = `${["FUEL", "ASSET"].includes(input.payload.kind) ? "fuel" : "production"}.config.create`;
  allow(actor, key, input.plantId);
  return atomic(client, async tx => {
    const old = await tx.operationalConfig.findUnique({ where: { requestKey: input.requestKey } });
    if (old) { if (old.makerId !== actor.userId || old.payloadHash !== hash(input)) fail("Request key sudah digunakan untuk payload lain."); return old; }
    await validateConfig(tx, input);
    const id = randomUUID();
    const priorAsset = input.payload.kind === "ASSET" ? await tx.operationalConfig.findFirst({ where: { plantId: input.plantId, kind: "ASSET", code: input.code }, orderBy: { createdAt: "asc" } }) : null;
    if (priorAsset && (priorAsset.payload as { identity: string }).identity !== (input.payload as { identity: string }).identity) fail("Identitas alat berbeda. Gunakan kode alat lain; versi hanya mengubah aturan alat yang sama.", 422);
    const row = await tx.operationalConfig.create({ data: { id, assetRootId: input.payload.kind === "ASSET" ? priorAsset?.assetRootId ?? id : undefined, requestKey: input.requestKey, payloadHash: hash(input), plantId: input.plantId, kind: input.payload.kind, code: input.code, revision: input.revision, effectiveFrom: new Date(input.effectiveFrom), payload: input.payload, evidence: input.evidence, makerId: actor.userId } });
    await writeAudit(tx, { userId: actor.userId, module: "OPERATIONS_CONFIG", action: "CREATE_VERSION", recordId: row.id, newValue: input, request }); return row;
  });
}
export async function verifyConfig(client: PrismaClient, actor: AccessActor, id: string, raw: unknown, request?: Request) {
  const input = configVerifySchema.parse(raw);
  return atomic(client, async tx => {
    const row = await tx.operationalConfig.findUnique({ where: { id } }); if (!row) fail("Konfigurasi tidak ditemukan.", 404);
    allow(actor, `${["FUEL", "ASSET"].includes(row.kind) ? "fuel" : "production"}.config.verify`, row.plantId);
    if (row.makerId === actor.userId) fail("Maker tidak boleh memverifikasi konfigurasi sendiri.", 403);
    if (row.verificationStatus === "VERIFIED") return row;
    await validateConfig(tx, { ...row, effectiveFrom: row.effectiveFrom.toISOString(), payload: configSchema.shape.payload.parse(row.payload) });
    const result = await tx.operationalConfig.update({ where: { id }, data: { verificationStatus: "VERIFIED", verifiedBy: actor.userId, verifiedAt: new Date(), verificationEvidence: input.evidence } });
    await writeAudit(tx, { userId: actor.userId, module: "OPERATIONS_CONFIG", action: "VERIFY", recordId: id, newValue: input, request }); return result;
  });
}
export type NormalizedLine = Awaited<ReturnType<typeof converted>> & { locationId: string; role: "INPUT" | "OUTPUT" };
export type RunSnapshot = { lines: NormalizedLine[]; outputQuantity: string; outputUom: string | null; fuelLiters: string; eligibleProduction: boolean; asset: Prisma.InputJsonObject | null; policies: { id: string; hash: string }[]; reconciliation: { inputTon: string | null; outputTon: string | null; varianceTon: string | null }; comparison: { itemId: string; itemName: string; expected: string; actual: string; variance: string; uom: string }[] };
async function normalize(tx: Tx, actor: AccessActor, input: RunInput, action: string): Promise<RunSnapshot> {
  const key = permission(input.kind, action); allow(actor, key, input.plantId);
  const owner = await plant(tx, input.plantId), date = new Date(input.effectiveAt);
  if (date > new Date()) fail("Tanggal efektif tidak boleh di masa depan.", 422);
  await periodOpen(tx, owner.id, date);
  if (!input.kind.startsWith("FUEL_") && input.kind !== "BLENDING" && owner.kind !== input.kind) fail("Jenis produksi tidak sesuai plant.", 422);
  const snapshot: RunSnapshot = { lines: [], outputQuantity: "0", outputUom: null, fuelLiters: "0", eligibleProduction: false, asset: null, policies: [], reconciliation: { inputTon: null, outputTon: null, varianceTon: null }, comparison: [] };
  const policy = (c: { id: string; payloadHash: string }) => snapshot.policies.push({ id: c.id, hash: c.payloadHash });
  async function line(raw: RunInput["inputs"][number], role: "INPUT" | "OUTPUT", tank = false) {
    const ref = await references(tx, actor, key, raw.itemId, raw.locationId);
    if (role === "OUTPUT" && !tank && ref.item.kind !== "PRODUCT") fail("Hasil produksi harus berupa produk verified.", 422);
    if ((!tank || input.kind !== "FUEL_TRANSFER") && ref.location.plantId !== owner.id) fail("Lokasi harus berada pada plant transaksi.", 422);
    if (tank && ref.location.kind !== "TANK") fail("BBM harus memakai lokasi tangki terverifikasi.", 422);
    await periodOpen(tx, ref.location.plantId, date); await ensureLegacyAdopted(tx, raw.itemId, raw.locationId);
    const opening = await tx.stockOpeningClaim.findUnique({ where: { locationId_itemId: { locationId: raw.locationId, itemId: raw.itemId } }, include: { document: true } });
    if (opening && date <= opening.document.effectiveAt) fail("Transaksi mendahului cut-off opening/adopsi.");
    const result = { ...await converted(tx, ref.location.plantId, date, raw), locationId: raw.locationId, role }; snapshot.lines.push(result); return result;
  }
  if (input.fuel) {
    const f = input.fuel, c = await checkedConfig(tx, f.policyId, "FUEL", owner.id, date); policy(c);
    if (c.payload.kind !== "FUEL") fail("Konfigurasi BBM tidak sesuai.");
    const material = await item(tx, owner.id, c.payload.itemId); if (material.primaryUom.code !== "L") fail("Stok BBM harus liter.", 422);
    const source = await tx.plantLocation.findUnique({ where: { id: f.tankId } }); if (source?.plantId !== owner.id) fail("Tangki sumber tidak sesuai plant.", 422);
    await line({ itemId: material.id, locationId: f.tankId, uomId: material.primaryUomId, quantity: f.liters }, input.kind === "FUEL_RECEIPT" ? "OUTPUT" : "INPUT", true);
    if (input.kind === "FUEL_TRANSFER") await line({ itemId: material.id, locationId: f.destinationId!, uomId: material.primaryUomId, quantity: f.liters }, "OUTPUT", true);
    if (input.kind === "FUEL_USAGE") {
      const asset = await checkedConfig(tx, f.assetId!, "ASSET", owner.id, date); policy(asset);
      if (asset.payload.kind !== "ASSET") fail("Alat tidak sesuai."); snapshot.asset = { id: asset.assetRootId!, versionId: asset.id, ...asset.payload, evidence: asset.verificationEvidence };
      snapshot.fuelLiters = f.liters; snapshot.eligibleProduction = f.purpose === "PRODUCTION" && asset.payload.eligibleProduction;
    }
    return snapshot;
  }
  const fuelPolicies = await tx.operationalConfig.findMany({ where: { kind: "FUEL", verificationStatus: "VERIFIED" } });
  for (const raw of input.inputs) {
    if (fuelPolicies.some(c => (c.payload as { itemId: string }).itemId === raw.itemId)) fail("BBM memakai usage terpisah; produksi tidak boleh memotong BBM kedua kali.", 422);
    if (input.outputs.some(o => o.itemId === raw.itemId)) fail("Bahan dan hasil tidak boleh memakai material yang sama.", 422);
    await line(raw, "INPUT");
  }
  for (const raw of input.outputs) {
    const result = await line(raw, "OUTPUT"), wanted = input.kind === "AMP" ? "TON" : input.kind === "BLENDING" ? result.transactionUom : "M3";
    if (result.transactionUom !== wanted || input.kind === "BLENDING" && !["TON", "M3"].includes(wanted)) fail("Output SC/BP harus terukur m³, AMP ton; blending m³/ton sesuai mix.", 422);
    snapshot.outputUom = wanted; snapshot.outputQuantity = new D(snapshot.outputQuantity).plus(raw.quantity).toString();
    const candidates = await tx.operationalConfig.findMany({ where: { plantId: owner.id, kind: "PRODUCT", verificationStatus: "VERIFIED", effectiveFrom: { lte: date } }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }, { id: "asc" }] });
    const p = candidates.find(c => (c.payload as { itemId: string }).itemId === raw.itemId);
    if (!p || (p.payload as { process: string }).process !== input.kind) fail("Klasifikasi output belum verified untuk proses ini. Blending tidak boleh menjadi output SC.", 422); policy(p);
  }
  if (input.mixVersionId) {
    const c = await checkedConfig(tx, input.mixVersionId, "MIX", owner.id, date); policy(c);
    if (c.payload.kind !== "MIX" || c.payload.process !== input.kind || input.outputs.length !== 1 || c.payload.outputItemId !== input.outputs[0].itemId || c.payload.outputUomId !== input.outputs[0].uomId) fail("Mix version tidak cocok dengan proses/hasil/UOM batch.", 422);
    for (const component of c.payload.components) {
      const convertedComponent = await converted(tx, owner.id, date, component), expected = new D(convertedComponent.stockQuantity).mul(snapshot.outputQuantity);
      const actual = snapshot.lines.filter(l => l.role === "INPUT" && l.itemId === component.itemId).reduce((n, l) => n.plus(l.stockQuantity), new D(0));
      snapshot.comparison.push({ itemId: component.itemId, itemName: convertedComponent.itemName, expected: expected.toString(), actual: actual.toString(), variance: actual.minus(expected).toString(), uom: convertedComponent.stockUom });
    }
    for (const itemId of new Set(snapshot.lines.filter(l => l.role === "INPUT" && !snapshot.comparison.some(c => c.itemId === l.itemId)).map(l => l.itemId))) {
      const rows = snapshot.lines.filter(l => l.role === "INPUT" && l.itemId === itemId), total = rows.reduce((n, l) => n.plus(l.stockQuantity), new D(0)).toString();
      snapshot.comparison.push({ itemId, itemName: rows[0].itemName, expected: "0", actual: total, variance: total, uom: rows[0].stockUom });
    }
  }
  if (input.kind === "AMP") {
    const inputs = snapshot.lines.filter(l => l.role === "INPUT"), known = inputs.every(l => standardFactor(l.transactionUom, "TON") || standardFactor(l.stockUom, "TON"));
    const total = known ? inputs.reduce((n, l) => { const original = standardFactor(l.transactionUom, "TON"); return n.plus(new D(original ? l.quantity : l.stockQuantity).mul(original ?? standardFactor(l.stockUom, "TON")!)); }, new D(0)) : null;
    snapshot.reconciliation = { inputTon: total?.toString() ?? null, outputTon: snapshot.outputQuantity, varianceTon: total?.minus(snapshot.outputQuantity).toString() ?? null };
  }
  if (input.fuelUsageId) {
    const usage = await tx.operationalRun.findUnique({ where: { id: input.fuelUsageId }, include: { stockDocument: true } });
    if (!usage || usage.kind !== "FUEL_USAGE" || usage.plantId !== owner.id || usage.status !== "POSTED" || usage.stockDocument?.status !== "POSTED" || new Date(usage.effectiveAt.getTime() + 7 * 3600000).toISOString().slice(0, 10) !== new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10) || (usage.payload as RunInput).fuel?.purpose !== "PRODUCTION") fail("Referensi BBM AMP harus usage produksi posted pada plant/hari yang sama.", 422);
  }
  return snapshot;
}
export async function saveRun(client: PrismaClient, actor: AccessActor, raw: unknown, id?: string, request?: Request, sync?: { deviceId: string; clientUpdatedAt: string }) {
  const { payload: input, version } = saveRunSchema.parse(raw), digest = hash(input); allow(actor, permission(input.kind, "create"), input.plantId);
  return atomic(client, async tx => {
    await plant(tx, input.plantId); await periodOpen(tx, input.plantId, new Date(input.effectiveAt));
    if (new Date(input.effectiveAt) > new Date()) fail("Tanggal efektif di masa depan.", 422);
    for (const l of [...input.inputs, ...input.outputs]) { const ref = await references(tx, actor, permission(input.kind, "create"), l.itemId, l.locationId); if (ref.location.plantId !== input.plantId) fail("Lokasi di luar plant draft.", 422); if (sync) await converted(tx, input.plantId, new Date(input.effectiveAt), l); }
    if (input.mixVersionId) await checkedConfig(tx, input.mixVersionId, "MIX", input.plantId, new Date(input.effectiveAt));
    if (input.fuelUsageId) { const fuel = await tx.operationalRun.findUnique({ where: { id: input.fuelUsageId } }); if (!fuel || fuel.plantId !== input.plantId) fail("Usage di luar plant draft.", 422); }
    if (input.fuel) {
      const config = await checkedConfig(tx, input.fuel.policyId, "FUEL", input.plantId, new Date(input.effectiveAt));
      if (config.payload.kind !== "FUEL") fail("Konfigurasi BBM tidak sesuai.");
      for (const locationId of [input.fuel.tankId, ...(input.fuel.destinationId ? [input.fuel.destinationId] : [])]) {
        const ref = await references(tx, actor, permission(input.kind, "create"), config.payload.itemId, locationId);
        if (ref.location.kind !== "TANK" || locationId === input.fuel.tankId && ref.location.plantId !== input.plantId) fail("Tangki tidak sesuai plant/jenis.", 422);
        if (sync) await periodOpen(tx, ref.location.plantId, new Date(input.effectiveAt));
      }
      if (input.fuel.assetId) await checkedConfig(tx, input.fuel.assetId, "ASSET", input.plantId, new Date(input.effectiveAt));
    }
    const old = id ? await tx.operationalRun.findUnique({ where: { id } }) : await tx.operationalRun.findUnique({ where: { requestKey: input.requestKey } });
    if (old) {
      allow(actor, permission(old.kind, "create"), old.plantId);
      if (old.makerId !== actor.userId || old.requestKey !== input.requestKey || old.plantId !== input.plantId || old.kind !== input.kind) fail("Draft bukan milik maker/plant/jenis ini.", 403);
      if (sync && old.status !== "DRAFT") fail("Conflict: sumber sudah diajukan/verified/posted. Draft offline tidak boleh menimpa sumber final.");
      if (old.payloadHash === digest) return old;
      if (!id || old.status !== "DRAFT" || old.version !== version) fail("Draft berubah atau bukan draft. Muat ulang.");
      const row = await tx.operationalRun.update({ where: { id }, data: { payload: input, payloadHash: digest, effectiveAt: new Date(input.effectiveAt), mixVersionId: input.mixVersionId ?? null, fuelUsageId: input.fuelUsageId ?? null, version: { increment: 1 } } });
      await writeAudit(tx, { userId: actor.userId, module: "OPERATIONS", action: sync ? "SYNC_EDIT_DRAFT" : "EDIT_DRAFT", recordId: row.id, previousValue: old.payload as Prisma.InputJsonValue, newValue: sync ? { payload: input, ...sync } : input, request }); return row;
    }
    if (id || version !== 0) fail("Draft tidak ditemukan.", 404);
    if (new Date(input.effectiveAt) > new Date()) fail("Tanggal efektif di masa depan.", 422);
    const row = await tx.operationalRun.create({ data: { number: await nextDocumentNumber(tx, "OPERATION"), requestKey: input.requestKey, payloadHash: digest, kind: input.kind, plantId: input.plantId, effectiveAt: new Date(input.effectiveAt), payload: input, makerId: actor.userId, mixVersionId: input.mixVersionId, fuelUsageId: input.fuelUsageId } });
    await writeAudit(tx, { userId: actor.userId, module: "OPERATIONS", action: sync ? "SYNC_DRAFT" : "DRAFT", recordId: row.id, newValue: sync ? { payload: input, ...sync } : input, request }); return row;
  });
}
export async function actRun(client: PrismaClient, actor: AccessActor, id: string, raw: unknown, request?: Request) {
  const input = runActionSchema.parse(raw);
  return atomic(client, async tx => {
    const row = await tx.operationalRun.findUnique({ where: { id } }); if (!row) fail("Transaksi tidak ditemukan.", 404);
    const actionPermission = permission(row.kind, input.action === "submit" ? "create" : input.action === "reject" ? "verify" : input.action);
    allow(actor, actionPermission, row.plantId);
    const payload = runSchema.parse(row.payload);
    const locationIds = [...new Set([...payload.inputs, ...payload.outputs].map(l => l.locationId).concat(payload.fuel ? [payload.fuel.tankId, ...(payload.fuel.destinationId ? [payload.fuel.destinationId] : [])] : []))];
    const locations = await tx.plantLocation.findMany({ where: { id: { in: locationIds } }, select: { plantId: true } });
    if (locations.length !== locationIds.length) fail("Lokasi sumber tidak ditemukan.", 404);
    for (const l of locations) allow(actor, actionPermission, l.plantId);
    if (input.action === "submit" && row.makerId !== actor.userId || ["verify", "reject"].includes(input.action) && (row.submitterId === actor.userId || row.makerId === actor.userId)) fail("Maker/submitter tidak boleh memverifikasi sendiri.", 403);
    const target = { submit: "SUBMITTED", verify: "VERIFIED", post: "POSTED", reject: "REJECTED" }[input.action];
    if (row.status === target) return row;
    if (row.version !== input.version) fail("Versi transaksi berubah. Muat ulang.");
    if (input.action === "reject" ? !["DRAFT", "SUBMITTED", "VERIFIED"].includes(row.status) : row.status !== ({ submit: "DRAFT", verify: "SUBMITTED", post: "VERIFIED" } as Record<string, string>)[input.action]) fail("Status transaksi tidak sesuai tindakan.");
    const snapshot = input.action === "reject" ? null : await normalize(tx, actor, payload, input.action === "submit" ? "create" : input.action);
    if (input.action === "post") {
      if (!row.verifierId || row.verifierId === row.submitterId || row.verifierId === row.makerId) fail("Verifikasi Admin PC berbeda akun wajib sebelum posting.", 403);
      if (hash(snapshot) !== hash(row.snapshot)) fail("Master/konversi berubah setelah verifikasi; ajukan sumber baru.");
      const doc = await tx.stockDocument.create({ data: { number: await nextDocumentNumber(tx, "STOCK_DOCUMENT"), requestKey: row.requestKey, payloadHash: row.payloadHash, kind: row.kind === "BLENDING" ? "BLENDING" : row.kind === "FUEL_USAGE" ? "FUEL_USAGE" : row.kind === "FUEL_TRANSFER" ? "TRANSFER" : row.kind === "FUEL_RECEIPT" ? "RECEIPT" : "PRODUCTION", effectiveAt: row.effectiveAt, reason: payload.reason, evidence: payload.evidence, makerId: row.makerId, sourceName: row.number, sourceSnapshot: { runId: row.id, ...snapshot! }, lines: { create: snapshot!.lines.map((l, index) => ({ lineNo: index + 1, itemId: l.itemId, locationId: l.locationId, quantity: new D(l.stockQuantity).mul(l.role === "INPUT" ? -1 : 1), itemName: l.itemName, uomCode: l.stockUom })) } } });
      const moves: Move[] = snapshot!.lines.map((l, index) => ({ itemId: l.itemId, locationId: l.locationId, uomId: l.stockUomId, quantity: new D(l.stockQuantity).mul(l.role === "INPUT" ? -1 : 1), lineNo: index + 1, effectiveAt: row.effectiveAt, sourceRef: row.number })).filter(l => !l.quantity.isZero());
      await appendStockMoves(tx, actor, doc.id, moves);
      if (row.fuelUsageId) {
        const usage = await tx.operationalRun.findUniqueOrThrow({ where: { id: row.fuelUsageId } });
        await tx.stockDependency.create({ data: { sourceId: usage.stockDocumentId!, dependentId: doc.id } });
      }
      await tx.stockDocument.update({ where: { id: doc.id }, data: { status: "POSTED", approvedBy: actor.userId, approvedAt: new Date(), version: { increment: 1 } } });
      const result = await tx.operationalRun.update({ where: { id }, data: { status: "POSTED", stockDocumentId: doc.id, posterId: actor.userId, version: { increment: 1 }, decisionEvidence: input.reason } });
      await writeAudit(tx, { userId: actor.userId, module: "OPERATIONS", action: "POST", recordId: id, newValue: { stockDocumentId: doc.id, snapshot, evidence: input.reason }, request }); return result;
    }
    const result = await tx.operationalRun.update({ where: { id }, data: { status: target as "SUBMITTED" | "VERIFIED" | "REJECTED", submitterId: input.action === "submit" ? actor.userId : undefined, verifierId: input.action === "verify" ? actor.userId : undefined, snapshot: input.action === "verify" ? snapshot as unknown as Prisma.InputJsonValue : undefined, decisionEvidence: input.reason, version: { increment: 1 } } });
    await writeAudit(tx, { userId: actor.userId, module: "OPERATIONS", action: input.action.toUpperCase(), recordId: id, previousValue: { status: row.status }, newValue: { status: target, evidence: input.reason, snapshot }, request }); return result;
  });
}
