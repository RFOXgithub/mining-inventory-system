import { createHash } from "node:crypto";
import { Prisma, PrismaClient, StockDocumentKind } from "@prisma/client";
import { AccessActor, can } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { writeAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { stockDocumentSchema, stockActionSchema, periodActionSchema } from "./ledger-schema";

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;
D.set({ precision: 48 });
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const migrationKinds: StockDocumentKind[] = ["OPENING", "LEGACY_IMPORT"];
const approvalKinds: StockDocumentKind[] = ["OPENING", "LEGACY_IMPORT", "OPNAME", "ADJUSTMENT", "INTERNAL_ISSUE", "REVERSAL"];
function fail(message: string, status = 409): never { throw new DomainError(status, message); }
export function assertStockAction(actor: AccessActor, permission: string, plantId?: string) {
  if (!can(actor, permission, plantId)) fail("Action atau cakupan plant tidak diizinkan.", 403);
}
export function jakartaMonth(date: Date) {
  return new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 7);
}
// One transaction lock serializes all stock writers and period changes. Serializable
// retry refreshes snapshots obtained before a competing writer released the lock.
export async function atomic<T>(client: PrismaClient, work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await client.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(718204, 1)::text`;
      return work(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15000, timeout: 60000 }); }
    catch (error) { if (!["P2034", "P2002"].includes((error as { code?: string }).code ?? "") || attempt >= 8) throw error; await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1))); }
  }
}
export async function references(tx: Tx, actor: AccessActor, permission: string, itemId: string, locationId: string) {
  const location = await tx.plantLocation.findUnique({ where: { id: locationId }, include: { plant: true, stockpile: true } });
  if (!location) fail("Lokasi tidak ditemukan.", 404);
  assertStockAction(actor, permission, location.plantId);
  const item = await tx.catalogItem.findUnique({ where: { id: itemId }, include: { primaryUom: true, plants: true } });
  if (!item) fail("Material tidak ditemukan.", 404);
  if (!location.active || !location.plant.active || location.verificationStatus !== "VERIFIED" || location.plant.verificationStatus !== "VERIFIED" || !item.active || item.verificationStatus !== "VERIFIED" || item.kind === "SERVICE" || !item.primaryUom.active || item.primaryUom.verificationStatus !== "VERIFIED" || item.primaryUom.dimension === "UNKNOWN" || !item.plants.some(p => p.plantId === location.plantId)) fail("Material, UOM, plant dan lokasi harus aktif/terverifikasi serta sesuai mapping.", 422);
  if (location.stockpile && ((location.stockpile.productId && location.stockpile.productId !== item.legacyProductId) || (location.stockpile.materialId && location.stockpile.materialId !== item.legacyMaterialId))) fail("Material tidak cocok dengan stockpile sumber.", 422);
  if (item.primaryUom.code === "L" && location.kind !== "TANK" && await tx.operationalConfig.count({ where: { kind: "FUEL", verificationStatus: "VERIFIED", payload: { path: ["itemId"], equals: item.id } } })) fail("BBM terverifikasi harus berada pada lokasi tangki.", 422);
  return { item, location };
}
export async function periodOpen(tx: Tx, plantId: string, effectiveAt: Date) {
  const period = await tx.stockPeriod.findUnique({ where: { plantId_month: { plantId, month: jakartaMonth(effectiveAt) } } });
  if (period?.closed) fail("Periode tertutup. Reopen harus disetujui sebelum posting atau reversal.");
}
export async function periodReadiness(tx: Tx, plantId: string, month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1) - 7 * 3600000), end = new Date(Date.UTC(year, monthNumber, 1) - 7 * 3600000);
  const rows = await tx.stockLedgerEntry.findMany({ where: { location: { plantId }, effectiveAt: { lt: end } }, select: { id: true, quantity: true, itemId: true, locationId: true, uomId: true, effectiveAt: true, sequence: true }, orderBy: [{ effectiveAt: "asc" }, { sequence: "asc" }] });
  const pending = await tx.stockDocument.findMany({ where: { status: "SUBMITTED", effectiveAt: { gte: start, lt: end }, lines: { some: { OR: [{ location: { plantId } }, { destination: { plantId } }] } } }, select: { id: true, number: true, kind: true, status: true, version: true }, orderBy: { id: "asc" } });
  const destinations = await tx.plantLocation.findMany({ where: { plantId, kind: "TANK" }, select: { id: true } });
  const operations = await tx.operationalRun.findMany({ where: { OR: [{ plantId }, { kind: "FUEL_TRANSFER", OR: destinations.map(l => ({ payload: { path: ["fuel", "destinationId"], equals: l.id } })) }], effectiveAt: { gte: start, lt: end }, status: { in: ["DRAFT", "SUBMITTED", "VERIFIED"] } }, select: { id: true, number: true, kind: true, status: true, version: true }, orderBy: { id: "asc" } });
  const deliveries = await tx.commerceRecord.findMany({ where: { plantId, kind: "DELIVERY", effectiveAt: { lt: end }, status: { in: ["DRAFT", "SUBMITTED", "VERIFIED", "APPROVED", "DISPATCHED"] } }, select: { id: true, number: true, kind: true, version: true, status: true }, orderBy: { id: "asc" } });
  const financePending = await tx.financialRecord.findMany({ where: { plantId, effectiveAt: { gte: start, lt: end }, status: { in: ["DRAFT", "SUBMITTED"] } }, select: { id: true, number: true, kind: true, version: true, status: true }, orderBy: { id: "asc" } });
  const financeEvents = await tx.financialEvent.findMany({ where: { source: { plantId }, effectiveAt: { lt: end } }, select: { id: true, amount: true, kind: true }, orderBy: { id: "asc" } });
  const depreciation = await tx.assetDepreciation.findMany({ where: { plantId, month, status: { not: "POSTED" } }, select: { id: true, month: true, status: true, version: true }, orderBy: { id: "asc" } });
  const depreciationCorrections = await tx.depreciationCorrection.findMany({ where: { plantId, effectiveAt: { gte: start, lt: end }, status: { in: ["DRAFT", "SUBMITTED"] } }, select: { id: true, status: true, version: true }, orderBy: { id: "asc" } });
  const depreciationEvents = await tx.depreciationEvent.findMany({ where: { plantId, effectiveAt: { lt: end } }, select: { id: true, amount: true }, orderBy: { id: "asc" } });
  const groups = [{ domain: "DEPRECIATION_CORRECTION", rows: depreciationCorrections.map(r => ({ ...r, number: r.id, kind: "DEPRECIATION_CORRECTION" })) }, { domain: "DEPRECIATION", rows: depreciation.map(r => ({ ...r, number: r.month, kind: "DEPRECIATION" })) }, { domain: "INVENTORY", rows: pending }, { domain: "OPERATIONS", rows: operations }, { domain: "DELIVERY", rows: deliveries }, { domain: "FINANCE", rows: financePending }];
  const balances = new Map<string, Prisma.Decimal>(), negative = new Set<string>();
  for (const row of rows) { const key = `${row.itemId}:${row.locationId}:${row.uomId}`, balance = (balances.get(key) ?? new D(0)).plus(row.quantity); balances.set(key, balance); if (balance.lt(0)) negative.add(key); }
  const negativeBlockers = [...negative].map(id => ({ id, number: id, kind: "NEGATIVE_STOCK_TIMELINE", status: "EXCEPTION", version: 0, domain: "STOCK_INVARIANT" }));
  return { hash: digest([rows.map(r => [r.id, r.quantity.toString()]), pending, operations, deliveries, financePending, depreciation, depreciationCorrections, depreciationEvents.map(e => [e.id, e.amount.toString()]), financeEvents.map(e => [e.id, e.kind, e.amount.toString()])]), pending: pending.length + operations.length + deliveries.length + financePending.length + depreciation.length + depreciationCorrections.length + negative.size, blockers: [...groups.flatMap(g => g.rows.map(r => ({ ...r, domain: g.domain }))), ...negativeBlockers], checks: [...groups.map(g => ({ domain: g.domain, pending: g.rows.length, ready: g.rows.length === 0 })), { domain: "STOCK_INVARIANT", pending: negative.size, ready: negative.size === 0 }] };
}
const reconciliation = periodReadiness;
export async function events(tx: Tx, itemId: string, locationId: string, cutoff?: Date) {
  return tx.stockLedgerEntry.findMany({ where: { itemId, locationId, ...(cutoff ? { effectiveAt: { lte: cutoff } } : {}) }, orderBy: [{ effectiveAt: "asc" }, { sequence: "asc" }] });
}
const sum = (rows: { quantity: Prisma.Decimal }[]) => rows.reduce((total, row) => total.plus(row.quantity), new D(0));
async function legacyRows(tx: Tx, itemId: string, locationId: string) {
  const item = await tx.catalogItem.findUniqueOrThrow({ where: { id: itemId } });
  const location = await tx.plantLocation.findUniqueOrThrow({ where: { id: locationId }, include: { stockpile: true } });
  if (!location.stockpileId || (!item.legacyProductId && !item.legacyMaterialId)) return [];
  if (location.stockpile?.unit.toUpperCase() !== (await tx.uom.findUniqueOrThrow({ where: { id: item.primaryUomId } })).code.toUpperCase()) fail("UOM legacy berbeda. Rekonsiliasi sumber sebelum migration.", 422);
  return tx.inventoryTransaction.findMany({ where: { stockpileId: location.stockpileId, ...(item.legacyProductId ? { productId: item.legacyProductId } : { materialId: item.legacyMaterialId }) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}
export async function ensureLegacyAdopted(tx: Tx, itemId: string, locationId: string) {
  const old = await legacyRows(tx, itemId, locationId);
  if (!old.length) return;
  const count = await tx.stockLedgerEntry.count({ where: { itemId, locationId, legacyId: { in: old.map(r => r.id) } } });
  if (count !== old.filter(e => !e.quantity.isZero()).length) fail("Saldo legacy belum direkonsiliasi dan diadopsi. Opening tambahan diblokir.");
}
export type Move = { itemId: string; locationId: string; quantity: Prisma.Decimal; effectiveAt: Date; lineNo: number; uomId: string; legacyId?: string; sourceRef?: string };
export function timelineBalance(rows: { quantity: Prisma.Decimal; effectiveAt: Date; sequence?: bigint }[], added: { quantity: Prisma.Decimal; effectiveAt: Date }[]) {
  const lastSequence = rows.reduce((last, row) => row.sequence && row.sequence > last ? row.sequence : last, BigInt(0));
  const timeline = [...rows.map((r, i) => ({ quantity: r.quantity, effectiveAt: r.effectiveAt, sequence: r.sequence ?? BigInt(i) })), ...added.map((r, i) => ({ ...r, sequence: lastSequence + BigInt(rows.length + i + 1) }))].sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime() || (a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0));
  let balance = new D(0);
  for (const row of timeline) { balance = balance.plus(row.quantity); if (balance.isNegative()) fail("Posting ditolak: stok akan negatif pada tanggal efektif atau movement berikutnya."); }
  return balance;
}

export async function createStockDocument(client: PrismaClient, actor: AccessActor, raw: unknown, request?: Request) {
  const input = stockDocumentSchema.parse(raw), hash = digest(input), date = new Date(input.effectiveAt);
  if (date > new Date()) fail("Tanggal efektif tidak boleh berada di masa depan.", 422);
  const permission = migrationKinds.includes(input.kind) ? "inventory.migrate" : "inventory.adjust";
  assertStockAction(actor, permission);
  return atomic(client, async tx => {
    const previous = await tx.stockDocument.findUnique({ where: { requestKey: input.requestKey }, include: { lines: true } });
    if (previous) {
      if (previous.makerId !== actor.userId || previous.payloadHash !== hash) fail("Request key sudah digunakan untuk payload atau maker lain.");
      for (const line of previous.lines) {
        const location = await tx.plantLocation.findUniqueOrThrow({ where: { id: line.locationId } });
        assertStockAction(actor, permission, location.plantId);
        if (line.destinationId) assertStockAction(actor, permission, (await tx.plantLocation.findUniqueOrThrow({ where: { id: line.destinationId } })).plantId);
      }
      return previous;
    }
    let rawLines = input.lines;
    if (input.kind === "REVERSAL") {
      const source = await tx.stockDocument.findUnique({ where: { id: input.reversalOfId }, include: { lines: true } });
      if (!source || source.status !== "POSTED" || source.kind === "REVERSAL" || migrationKinds.includes(source.kind)) fail("Sumber harus POSTED, bukan reversal atau migration. Koreksi migration memakai adjustment beralasan.");
      if (source.kind === "DELIVERY") fail("Reversal delivery memerlukan kebijakan retur fisik dan dependency billing yang disahkan; stock-in/remaining tidak dipulihkan otomatis.", 422);
      if (date < source.effectiveAt) fail("Tanggal reversal tidak boleh mendahului sumber.", 422);
      rawLines = source.lines.map(row => ({ itemId: row.itemId, locationId: row.locationId, destinationId: row.destinationId ?? undefined, quantity: row.quantity.toString() }));
    }
    const lines: Prisma.StockDocumentLineCreateWithoutDocumentInput[] = [];
    const legacySnapshot: { lineNo: number; id: string; quantity: string; effectiveAt: string; sourceRef: string }[] = [];
    for (const [index, line] of rawLines.entries()) {
      const { item, location } = await references(tx, actor, permission, line.itemId, line.locationId);
      if (input.kind === "INTERNAL_ISSUE" && item.primaryUom.code === "L" && await tx.operationalConfig.count({ where: { kind: "FUEL", verificationStatus: "VERIFIED", payload: { path: ["itemId"], equals: item.id } } })) fail("Pemakaian BBM harus memakai workflow usage; jangan memposting CSR kedua.", 422);
      await periodOpen(tx, location.plantId, date);
      if (line.destinationId) { const target = await references(tx, actor, permission, line.itemId, line.destinationId); await periodOpen(tx, target.location.plantId, date); }
      let book: Prisma.Decimal | undefined, snapshotHash: string | undefined;
      if (input.kind === "OPNAME") {
        await ensureLegacyAdopted(tx, item.id, location.id);
        const snapshot = await events(tx, item.id, location.id, date); book = sum(snapshot); snapshotHash = digest(snapshot.map(e => [e.id, e.quantity.toString(), e.effectiveAt.toISOString()]));
      }
      if (input.kind === "LEGACY_IMPORT") {
        const old = await legacyRows(tx, item.id, location.id);
        if (!old.length || old.some(e => e.createdAt > date) || await tx.stockLedgerEntry.count({ where: { itemId: item.id, locationId: location.id } })) fail("Adopsi membutuhkan seluruh histori legacy sampai cut-off pada pasangan yang belum diposting.");
        const quantity = sum(old.map(e => ({ quantity: e.direction === "IN" ? e.quantity : e.quantity.negated() })));
        if (!quantity.equals(line.quantity)) fail("Saldo rekonsiliasi tidak sesuai histori legacy.");
        for (const e of old) legacySnapshot.push({ lineNo: index + 1, id: e.id, quantity: (e.direction === "IN" ? e.quantity : e.quantity.negated()).toString(), effectiveAt: e.createdAt.toISOString(), sourceRef: `${e.referenceType}:${e.referenceId}:${e.number}` });
      }
      lines.push({ lineNo: index + 1, item: { connect: { id: item.id } }, location: { connect: { id: location.id } }, destination: line.destinationId ? { connect: { id: line.destinationId } } : undefined, quantity: new D(line.quantity), bookQuantity: book, snapshotHash, itemName: item.name, uomCode: item.primaryUom.code });
    }
    const row = await tx.stockDocument.create({ data: { number: await nextDocumentNumber(tx, "STOCK_DOCUMENT"), kind: input.kind, requestKey: input.requestKey, payloadHash: hash, effectiveAt: date, reason: input.reason, evidence: input.evidence, sourceName: input.sourceName, checksum: input.checksum?.toLowerCase(), makerId: actor.userId, reversalOfId: input.reversalOfId, sourceSnapshot: input.kind === "LEGACY_IMPORT" ? legacySnapshot : input.kind === "RECEIPT" ? { sourceType: input.sourceType! } : undefined, lines: { create: lines } }, include: { lines: true } });
    await writeAudit(tx, { userId: actor.userId, module: "INVENTORY", action: "SUBMIT", recordId: row.id, newValue: { kind: row.kind, number: row.number, payloadHash: hash, evidence: row.evidence }, request });
    return row;
  });
}

export async function actStockDocument(client: PrismaClient, actor: AccessActor, id: string, raw: unknown, request?: Request) {
  const input = stockActionSchema.parse(raw);
  return atomic(client, async tx => {
    const doc = await tx.stockDocument.findUnique({ where: { id }, include: { lines: true, operationalRun: true, commerceRecord: true } });
    if (!doc) fail("Dokumen tidak ditemukan.", 404);
    if (doc.operationalRun) fail("Posting sumber produksi/BBM hanya melalui workflow sumber.", 422);
    if (doc.commerceRecord || doc.kind === "DELIVERY") fail("Posting delivery hanya melalui workflow sumber DO.", 422);
    const approval = approvalKinds.includes(doc.kind);
    const permission = input.action === "finance" ? "inventory.migration.verify" : input.action === "approve" || input.action === "reject" ? "inventory.approve" : "inventory.adjust";
    assertStockAction(actor, permission);
    for (const line of doc.lines) {
      await references(tx, actor, permission, line.itemId, line.locationId);
      if (line.destinationId) await references(tx, actor, permission, line.itemId, line.destinationId);
    }
    if (input.action !== "post" && actor.userId === doc.makerId) fail("Maker tidak boleh memverifikasi atau menyetujui dokumen sendiri.", 403);
    if (input.action === "finance" && !migrationKinds.includes(doc.kind)) fail("Verifikasi Finance hanya untuk migration.", 422);
    if (input.action === "post" && approval || input.action === "approve" && !approval) fail("Action tidak sesuai jenis dokumen.", 422);
    if ((input.action === "post" || input.action === "approve") && doc.status === "POSTED") return doc;
    if (input.action === "finance" && doc.financeBy === actor.userId && doc.status === "SUBMITTED") return doc;
    if (input.version !== undefined && doc.version !== input.version) fail("Version dokumen berubah. Muat ulang sebelum keputusan.");
    if (doc.status !== "SUBMITTED") fail("Dokumen tidak menunggu tindakan ini.");
    if (input.action === "finance") {
      if (doc.financeBy) fail("Migration telah diverifikasi akun Finance lain.");
      const result = await tx.stockDocument.update({ where: { id }, data: { financeBy: actor.userId, financeEvidence: input.reason, version: { increment: 1 } } });
      await writeAudit(tx, { userId: actor.userId, module: "INVENTORY", action: "MIGRATION_FINANCE_VERIFY", recordId: id, newValue: { evidence: input.reason }, request });
      return result;
    }
    if (input.action === "reject") {
      const result = await tx.stockDocument.update({ where: { id }, data: { status: "REJECTED", approvedBy: actor.userId, approvedAt: new Date(), version: { increment: 1 } } });
      await writeAudit(tx, { userId: actor.userId, module: "INVENTORY", action: "REJECT", recordId: id, newValue: { reason: input.reason }, request });
      return result;
    }
    if (migrationKinds.includes(doc.kind) && (!doc.financeBy || doc.financeBy === actor.userId)) fail("Migration memerlukan PC, Finance dan Manager berbeda akun.", 403);
    let originalEntries: Awaited<ReturnType<typeof events>> = [];
    if (doc.kind === "REVERSAL") {
      const source = await tx.stockDocument.findUniqueOrThrow({ where: { id: doc.reversalOfId! } });
      if (source.status !== "POSTED") fail("Sumber telah berubah atau dibalik.");
      const dependent = await tx.stockDependency.findMany({ where: { sourceId: source.id } });
      if (await tx.stockDocument.count({ where: { id: { in: dependent.map(d => d.dependentId) }, status: "POSTED" } })) fail("Sumber memiliki turunan posted. Balik turunan dahulu.");
      originalEntries = await tx.stockLedgerEntry.findMany({ where: { documentId: source.id } });
    }
    const moves: Move[] = [];
    for (const line of doc.lines) {
      const { item, location } = await references(tx, actor, permission, line.itemId, line.locationId);
      await periodOpen(tx, location.plantId, doc.effectiveAt);
      if (line.destinationId) { const dest = await references(tx, actor, permission, item.id, line.destinationId); await periodOpen(tx, dest.location.plantId, doc.effectiveAt); }
      const pair = { itemId: item.id, locationId: location.id };
      if (doc.kind === "OPENING" || doc.kind === "LEGACY_IMPORT") {
        if (await tx.stockOpeningClaim.findUnique({ where: { locationId_itemId: pair } }) || await tx.stockLedgerEntry.count({ where: pair })) fail("Opening/adopsi hanya sekali dan sebelum movement lainnya.");
        if (doc.kind === "OPENING" && (await legacyRows(tx, item.id, location.id)).length) fail("Opening tidak boleh menduplikasi histori legacy. Gunakan adopsi rekonsiliasi.");
        await tx.stockOpeningClaim.create({ data: { ...pair, documentId: id } });
      } else {
        await ensureLegacyAdopted(tx, item.id, location.id);
        const claim = await tx.stockOpeningClaim.findUnique({ where: { locationId_itemId: pair }, include: { document: true } });
        if (claim && doc.effectiveAt <= claim.document.effectiveAt) fail("Movement tidak boleh mendahului atau menyamai cut-off opening/adopsi.");
      }
      const base = { ...pair, uomId: item.primaryUomId, effectiveAt: doc.effectiveAt, lineNo: line.lineNo };
      if (doc.kind === "REVERSAL") {
        for (const entry of originalEntries.filter(e => e.lineNo === line.lineNo)) {
          const ref = await references(tx, actor, permission, entry.itemId, entry.locationId);
          await periodOpen(tx, ref.location.plantId, entry.effectiveAt);
          await periodOpen(tx, ref.location.plantId, doc.effectiveAt);
          if (entry.quantity.isPositive() && await tx.stockLedgerEntry.count({ where: { itemId: entry.itemId, locationId: entry.locationId, quantity: { lt: 0 }, effectiveAt: { gte: entry.effectiveAt }, documentId: { not: entry.documentId }, document: { status: "POSTED", kind: { not: "REVERSAL" } } } })) fail("Ada konsumsi/turunan setelah sumber. Selesaikan reversal turunan dahulu.");
          moves.push({ ...base, locationId: entry.locationId, quantity: entry.quantity.negated() });
        }
      } else if (doc.kind === "LEGACY_IMPORT") {
        const snapshot = doc.sourceSnapshot as unknown as { lineNo: number; id: string; quantity: string; effectiveAt: string; sourceRef: string }[];
        for (const e of snapshot.filter(e => e.lineNo === line.lineNo)) {
          const effectiveAt = new Date(e.effectiveAt); await periodOpen(tx, location.plantId, effectiveAt);
          if (!new D(e.quantity).isZero()) moves.push({ ...base, quantity: new D(e.quantity), effectiveAt, legacyId: e.id, sourceRef: e.sourceRef });
        }
      } else {
        let qty = line.quantity;
        if (doc.kind === "OPNAME") {
          const snapshot = await events(tx, item.id, location.id, doc.effectiveAt);
          if (line.snapshotHash !== digest(snapshot.map(e => [e.id, e.quantity.toString(), e.effectiveAt.toISOString()]))) fail("Snapshot cut-off berubah karena posting backdate. Buat opname baru dari buku terbaru.");
          qty = qty.minus(line.bookQuantity!);
        }
        if (doc.kind === "TRANSFER" || doc.kind === "INTERNAL_ISSUE") qty = qty.negated();
        if (!qty.isZero()) moves.push({ ...base, quantity: qty });
        if (doc.kind === "TRANSFER") moves.push({ ...base, locationId: line.destinationId!, quantity: line.quantity });
      }
    }
    await appendStockMoves(tx, actor, id, moves, doc.reversalOfId);
    if (doc.reversalOfId) {
      await tx.stockDocument.update({ where: { id: doc.reversalOfId }, data: { status: "REVERSED", version: { increment: 1 } } });
      await tx.operationalRun.updateMany({ where: { stockDocumentId: doc.reversalOfId, status: "POSTED" }, data: { status: "REVERSED", version: { increment: 1 } } });
    }
    const result = await tx.stockDocument.update({ where: { id }, data: { status: "POSTED", approvedBy: actor.userId, approvedAt: new Date(), version: { increment: 1 } } });
    await writeAudit(tx, { userId: actor.userId, module: "INVENTORY", action: doc.kind === "REVERSAL" ? "REVERSE" : "POST", recordId: id, previousValue: { status: doc.status }, newValue: { status: "POSTED", kind: doc.kind, reason: input.reason, entries: moves.map(m => ({ itemId: m.itemId, locationId: m.locationId, quantity: m.quantity.toString(), effectiveAt: m.effectiveAt.toISOString() })) }, request });
    return result;
  });
}

export async function actStockPeriod(client: PrismaClient, actor: AccessActor, raw: unknown, request?: Request) {
  const input = periodActionSchema.parse(raw);
  const permission = input.action.startsWith("request-") ? "inventory.period.request" : input.action === "finance" ? "inventory.period.reconcile" : "inventory.period.approve";
  assertStockAction(actor, permission, input.plantId);
  return atomic(client, async tx => {
    const plant = await tx.plant.findUnique({ where: { id: input.plantId } });
    if (!plant?.active || plant.verificationStatus !== "VERIFIED") fail("Plant belum aktif/verified.", 422);
    const where = { plantId_month: { plantId: input.plantId, month: input.month } };
    const old = await tx.stockPeriod.findUnique({ where });
    if ((old?.version ?? 0) !== input.version) fail("Versi periode berubah. Muat ulang.");
    let data: Prisma.StockPeriodUpdateInput;
    if (input.action.startsWith("request-")) {
      if (old?.requestedBy) fail("Permintaan periode masih menunggu keputusan.");
      const requestClose = input.action === "request-close";
      if ((old?.closed ?? false) === requestClose) fail("Periode sudah berada pada status tersebut.");
      data = { requestedBy: actor.userId, requestClose, reason: input.reason, financeBy: null, evidence: null, reconciliationHash: null };
    } else {
      if (!old?.requestedBy) fail("Belum ada permintaan periode.");
      if (actor.userId === old.requestedBy) fail("Maker tidak boleh merekonsiliasi/approve permintaan sendiri.", 403);
      if (input.action === "finance") data = { financeBy: actor.userId, evidence: input.reason, reconciliationHash: (await reconciliation(tx, input.plantId, input.month)).hash };
      else if (input.action === "reject") data = { requestedBy: null, requestClose: null, financeBy: null, approvedBy: actor.userId };
      else {
        if (!old.financeBy || old.financeBy === actor.userId) fail("PC, Finance dan Manager harus berbeda akun.", 403);
        const checked = await reconciliation(tx, input.plantId, input.month);
        if (old.requestClose && checked.pending) fail("Masih ada dokumen inventory/operasional/delivery/finance menunggu keputusan atau completion sampai akhir periode ini.");
        if (old.reconciliationHash !== checked.hash) fail("Ledger berubah setelah rekonsiliasi Finance. Verifikasi Finance kembali.");
        data = { closed: old.requestClose!, requestedBy: null, requestClose: null, approvedBy: actor.userId };
      }
    }
    const row = old ? await tx.stockPeriod.update({ where, data: { ...data, version: { increment: 1 } } }) : await tx.stockPeriod.create({ data: { plantId: input.plantId, month: input.month, requestedBy: actor.userId, requestClose: true, reason: input.reason } });
    await writeAudit(tx, { userId: actor.userId, module: "INVENTORY_PERIOD", action: input.action.toUpperCase(), recordId: row.id, previousValue: old ? { closed: old.closed, version: old.version, requestedBy: old.requestedBy, financeBy: old.financeBy, reconciliationHash: old.reconciliationHash } : undefined, newValue: { closed: row.closed, reason: input.reason, version: row.version, requestedBy: row.requestedBy, requestClose: row.requestClose, financeBy: row.financeBy, reconciliationHash: row.reconciliationHash }, request });
    return row;
  });
}

export async function appendStockMoves(tx: Tx, actor: AccessActor, id: string, moves: Move[], reversalOfId?: string | null) {
    const pairs = new Set(moves.map(m => `${m.locationId}:${m.itemId}`));
    for (const key of pairs) {
      const [locationId, itemId] = key.split(":"), added = moves.filter(m => m.locationId === locationId && m.itemId === itemId);
      const existing = await events(tx, itemId, locationId);
      timelineBalance(existing, added);
      // Reversal inverses its own source; it does not consume another batch.
      for (const move of added.filter(m => m.quantity.isNegative() && !reversalOfId)) {
        const sources = existing.filter(e => e.quantity.isPositive() && e.effectiveAt <= move.effectiveAt && e.documentId !== reversalOfId);
        for (const sourceId of new Set(sources.map(e => e.documentId))) await tx.stockDependency.upsert({ where: { sourceId_dependentId: { sourceId, dependentId: id } }, create: { sourceId, dependentId: id }, update: {} });
      }
    }
    if (moves.length) await tx.stockLedgerEntry.createMany({ data: moves.map((move, index) => ({ ...move, documentId: id, eventKey: `${id}:${index}`, actorId: actor.userId })) });
}
