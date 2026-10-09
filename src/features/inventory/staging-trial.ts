import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AccessActor } from "@/lib/access";
import { assertStockAction } from "./ledger-service";
import { DomainError } from "@/lib/domain-error";
const id = z.string().uuid(), q = z.string().regex(/^\d{1,18}(\.\d{1,6})?$/), sha = z.string().regex(/^[a-f0-9]{64}$/);
export const trialSchema = z.object({
  environment: z.literal("STAGING"), batchId: id, cutoff: z.string().datetime({ offset: true }), ownerId: id,
  sources: z.array(z.object({ id: z.string().min(1).max(80), file: z.string().min(1).max(300), sha256: sha, workbookVersion: z.string().min(1).max(100) }).strict()).min(1).max(100),
  mappings: z.array(z.object({ key: z.string().min(1).max(150), plantId: id, itemId: id, locationId: id, uomId: id, verifiedBy: id, evidence: z.string().min(5).max(1000) }).strict()).min(1).max(10000),
  rows: z.array(z.object({ sourceId: z.string().min(1).max(80), sheet: z.string().min(1).max(100), row: z.number().int().positive(), cells: z.record(z.string().max(1000)), mappingKey: z.string().min(1).max(150), domain: z.enum(["INVENTORY", "FUEL"]), quantity: q, mode: z.enum(["NEW_OPENING", "EXISTING_BRIDGE"]) }).strict()).min(1).max(50000),
}).strict();
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
function stableUuid(s: string) { const h = hash(s); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; }
export async function trialMigration(db: PrismaClient, actor: AccessActor, raw: unknown, files: Map<string, Uint8Array>) {
  const input = trialSchema.parse(raw); assertStockAction(actor, "inventory.migrate");
  const at = new Date(input.cutoff); if (at > new Date()) throw new DomainError(422, "Cut-off harus aktual.");
  const exceptions: { code: string; lineage: string; ownerId: string; critical: boolean; detail: string }[] = [], issue = (code: string, lineage: string, detail: string) => exceptions.push({ code, lineage, detail, ownerId: input.ownerId, critical: true });
  const sourceIds = new Set<string>(), sourceHashes = new Set<string>(), verifiedSources = new Set<string>();
  for (const source of input.sources) {
    const bytes = files.get(source.id), checksum = bytes && createHash("sha256").update(bytes).digest("hex");
    if (sourceIds.has(source.id) || sourceHashes.has(source.sha256)) issue("DUPLICATE_SOURCE", source.id, "Sumber/checksum muncul lebih dari sekali.");
    else if (checksum !== source.sha256) issue("SOURCE_CHECKSUM", source.id, "File asli tidak tersedia atau checksum berbeda.");
    else verifiedSources.add(source.id);
    sourceIds.add(source.id); sourceHashes.add(source.sha256);
  }
  const lineage = new Set<string>(), mapKeys = new Set<string>(); for (const m of input.mappings) { if (mapKeys.has(m.key)) issue("DUPLICATE_MAPPING", m.key, "Mapping key harus unik."); mapKeys.add(m.key); }
  const rows: { lineage: string; sourceSha256: string; rawCells: Record<string, string>; mapping: z.infer<typeof trialSchema>["mappings"][number]; domain: string; mode: string; sourceQuantity: string; ledgerQuantity: string; delta: string; uom: string; requestKey: string }[] = [];
  const proposals: { requestKey: string; kind: "OPENING"; effectiveAt: string; evidence: string; reason: string; sourceName: string; checksum: string; lines: { itemId: string; locationId: string; quantity: string }[] }[] = [];
  await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const balanceKeys = new Set<string>();
    for (const r of input.rows) {
      const ref = `${r.sourceId}/${r.sheet}/${r.row}`, mapping = input.mappings.find(m => m.key === r.mappingKey);
      if (lineage.has(ref)) { issue("DUPLICATE_LINEAGE", ref, "Baris sumber muncul dua kali."); continue; } lineage.add(ref);
      if (!verifiedSources.has(r.sourceId)) { issue("UNVERIFIED_SOURCE", ref, "Sumber asli/checksum belum valid."); continue; }
      if (!mapping) { issue("UNRESOLVED_MAPPING", ref, "Alias/material/lokasi belum memiliki mapping verified."); continue; }
      assertStockAction(actor, "inventory.migrate", mapping.plantId);
      const [item, location, verifier] = await Promise.all([tx.catalogItem.findUnique({ where: { id: mapping.itemId }, include: { primaryUom: true, plants: true } }), tx.plantLocation.findUnique({ where: { id: mapping.locationId }, include: { plant: true } }), tx.user.findUnique({ where: { id: mapping.verifiedBy }, include: { roles: { include: { role: true } }, plantScopes: true } })]);
      const verifierActor = verifier && { userId: verifier.id, roles: verifier.roles.map(r => r.role.code), functions: verifier.functions, permissions: verifier.actionPermissions, plantIds: verifier.plantScopes.map(s => s.plantId), allPlants: verifier.allPlants };
      if (!verifier?.active || verifier.status !== "ACTIVE" || !verifierActor || verifier.id === actor.userId) { issue("MAPPING_VERIFIER", ref, "Verifier mapping harus akun aktif terpisah."); continue; }
      try { assertStockAction(verifierActor, "master.material.verify", mapping.plantId); } catch { issue("MAPPING_VERIFIER", ref, "Verifier mapping tidak memiliki izin/plant Manager."); continue; }
      if (!item?.active || item.verificationStatus !== "VERIFIED" || item.kind === "SERVICE" || !item.primaryUom.active || item.primaryUom.verificationStatus !== "VERIFIED" || item.primaryUomId !== mapping.uomId || !item.plants.some(p => p.plantId === mapping.plantId) || !location?.active || location.plantId !== mapping.plantId || location.verificationStatus !== "VERIFIED" || !location.plant.active || location.plant.verificationStatus !== "VERIFIED") { issue("UNVERIFIED_MASTER", ref, "Master, UOM utama, plant dan lokasi harus aktif/verified. Tidak ada konversi alias otomatis."); continue; }
      if (r.domain === "FUEL" && (item.primaryUom.code !== "L" || location.kind !== "TANK" || !await tx.operationalConfig.count({ where: { plantId: mapping.plantId, kind: "FUEL", verificationStatus: "VERIFIED", effectiveFrom: { lte: at }, payload: { path: ["itemId"], equals: item.id } } }))) { issue("FUEL_POLICY", ref, "BBM memerlukan liter/tangki/policy verified."); continue; }
      const key = `${mapping.itemId}:${mapping.locationId}`; if (balanceKeys.has(key)) { issue("DUPLICATE_BALANCE", ref, "Satu saldo material/lokasi hanya boleh memiliki satu source cut-off. Agregasi harus direkonsiliasi sebelum trial."); continue; } balanceKeys.add(key);
      const pair = { itemId: item.id, locationId: location.id }, movement = await tx.stockLedgerEntry.aggregate({ where: { ...pair, effectiveAt: { lte: at } }, _sum: { quantity: true } }), allEvents = await tx.stockLedgerEntry.count({ where: pair }), opening = await tx.stockOpeningClaim.findUnique({ where: { locationId_itemId: pair } });
      const legacy = location.stockpileId && (item.legacyMaterialId || item.legacyProductId) ? await tx.inventoryTransaction.count({ where: { stockpileId: location.stockpileId, ...(item.legacyMaterialId ? { materialId: item.legacyMaterialId } : { productId: item.legacyProductId! }) } }) : 0;
      const existing = new Prisma.Decimal(movement._sum.quantity ?? 0), source = new Prisma.Decimal(r.quantity), delta = source.minus(existing), requestKey = stableUuid(`${input.batchId}:${key}:${input.cutoff}`);
      rows.push({ lineage: ref, sourceSha256: input.sources.find(s => s.id === r.sourceId)!.sha256, rawCells: r.cells, mapping, domain: r.domain, mode: r.mode, sourceQuantity: source.toString(), ledgerQuantity: existing.toString(), delta: delta.toString(), uom: item.primaryUom.code, requestKey });
      if (r.mode === "NEW_OPENING") {
        if (allEvents || opening || legacy) issue("DOUBLE_OPENING", ref, "Ledger/opening/legacy sudah ada. Gunakan reconciliation bridge; opening Excel tambahan diblokir.");
        else if (!source.gt(0)) issue("ZERO_OPENING", ref, "Tidak perlu opening untuk saldo nol.");
        else proposals.push({ requestKey, kind: "OPENING", effectiveAt: input.cutoff, sourceName: `${r.sourceId}/${r.sheet}/${r.row}`, checksum: input.sources.find(s => s.id === r.sourceId)!.sha256, evidence: `${input.batchId} / ${ref} / ${input.sources.find(s => s.id === r.sourceId)!.sha256}`, reason: "Staging proposal; memerlukan PC, Finance, Manager berbeda akun dan cut-over sign-off", lines: [{ itemId: item.id, locationId: location.id, quantity: source.toString() }] });
      } else if (!delta.isZero()) issue("RECONCILIATION_DELTA", ref, "Saldo Excel berbeda dari ledger pada cut-off. Selidiki movement/duplikasi; jangan mengganti saldo atau membuat opening kedua.");
    }
  }, { isolationLevel: "RepeatableRead", timeout: 120000 });
  const totals = new Map<string, { uom: string; source: Prisma.Decimal; existing: Prisma.Decimal; delta: Prisma.Decimal; rows: number }>();
  for (const r of rows) { const key = `${r.mapping.plantId}:${r.domain}:${r.uom}`, t = totals.get(key) ?? { uom: r.uom, source: new Prisma.Decimal(0), existing: new Prisma.Decimal(0), delta: new Prisma.Decimal(0), rows: 0 }; t.source = t.source.plus(r.sourceQuantity); t.existing = t.existing.plus(r.ledgerQuantity); t.delta = t.delta.plus(r.delta); t.rows++; totals.set(key, t); }
  return { environment: "STAGING", batchId: input.batchId, cutoff: input.cutoff, sourceHash: hash(input), sourceCount: input.sources.length, inputCount: input.rows.length, reconciledCount: rows.length, exceptions, readyForReview: exceptions.length === 0, promotionAuthorized: false, signoffRequired: ["ADMIN_PC", "ADMIN_FINANCE_DIFFERENT_ACCOUNT", "MANAGER", "CUT_OVER_OWNER"], rows, totals: [...totals].map(([key, t]) => ({ key, ...t, source: t.source.toString(), existing: t.existing.toString(), delta: t.delta.toString() })), proposals: exceptions.length ? [] : proposals };
}
