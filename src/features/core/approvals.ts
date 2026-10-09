import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor, can } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { actStockDocument, actStockPeriod } from "@/features/inventory/ledger-service";
import { actRun, operationHash, verifyConfig } from "@/features/operations/service";
import { actCommerceConfig, actCommerceRecord } from "@/features/commerce/service";
import { actFinancialConfig, actFinancialRecord } from "@/features/finance/service";
import { reviewSchema, ReviewInput } from "./schema";
type Tx = Prisma.TransactionClient;
export type Review = { domain: ReviewInput["domain"]; id: string; number: string; kind: string; plantId: string; status: string; version: number; makerId: string; reason: string | null; evidence: string | null; before: unknown; after: unknown; actions: string[]; reviewHash: string; history: { action: string; userId: string | null; createdAt: Date; previousValue: unknown; newValue: unknown }[] };
const permission = (actor: AccessActor, p: string, plantId: string) => can(actor, p, plantId);
export async function scopedPlants(tx: Tx, actor: AccessActor, permission: string, plantId?: string) {
  if (!can(actor, permission) || plantId && !can(actor, permission, plantId)) throw new DomainError(403, "Akses/action atau plant tidak diizinkan.");
  return tx.plant.findMany({ where: { ...(actor.allPlants ? {} : { id: { in: actor.plantIds } }), ...(plantId ? { id: plantId } : {}) }, orderBy: { code: "asc" } });
}
export async function worklist(tx: Tx, actor: AccessActor, plantId?: string, all = false) {
  const plants = await scopedPlants(tx, actor, "approvals.read", plantId), ids = plants.map(p => p.id), items: Review[] = [], locations = await tx.plantLocation.findMany({ where: actor.allPlants ? {} : { plantId: { in: actor.plantIds } }, select: { id: true } });
  const add = (item: Omit<Review, "reviewHash" | "history">) => items.push({ ...item, reviewHash: operationHash(item), history: [] });
  if (can(actor, "inventory.read")) {
    const rows = await tx.stockDocument.findMany({ where: { ...(all ? {} : { status: "SUBMITTED" }), operationalRun: null, commerceRecord: null, lines: { some: { location: { plantId: { in: ids } } }, every: { locationId: { in: locations.map(l => l.id) }, OR: [{ destinationId: null }, { destinationId: { in: locations.map(l => l.id) } }] } } }, include: { lines: { include: { location: { select: { plantId: true } } } }, reversalOf: { include: { lines: true } } } });
    for (const r of rows) {
      const scope = r.lines[0].location.plantId, migration = ["OPENING", "LEGACY_IMPORT"].includes(r.kind), needsManager = ["OPENING", "LEGACY_IMPORT", "OPNAME", "ADJUSTMENT", "INTERNAL_ISSUE", "REVERSAL"].includes(r.kind), actions: string[] = [];
      if (r.status === "SUBMITTED" && actor.userId !== r.makerId) {
        if (migration && !r.financeBy && permission(actor, "inventory.migration.verify", scope)) actions.push("finance");
        if (needsManager && permission(actor, "inventory.approve", scope)) { if (!migration || !!r.financeBy && r.financeBy !== actor.userId) actions.push("approve"); actions.push("reject"); }
      }
      add({ domain: "INVENTORY", id: r.id, number: r.number, kind: r.kind, plantId: scope, status: r.status, version: r.version, makerId: r.makerId, reason: r.reason, evidence: r.evidence, before: r.reversalOf ?? r.lines.map(l => ({ item: l.itemName, locationId: l.locationId, bookQuantity: l.bookQuantity?.toString() ?? null })), after: r.lines, actions });
    }
  }
  const opKinds = [...(can(actor, "production.read") ? ["SC", "BP", "AMP", "BLENDING"] : []), ...(can(actor, "fuel.read") ? ["FUEL_RECEIPT", "FUEL_USAGE", "FUEL_TRANSFER"] : [])];
  if (opKinds.length) {
    const rows = await tx.operationalRun.findMany({ where: { plantId: { in: ids }, kind: { in: opKinds }, ...(all ? {} : { status: "SUBMITTED" }), ...(actor.allPlants ? {} : { OR: [{ kind: { not: "FUEL_TRANSFER" } }, ...locations.map(l => ({ payload: { path: ["fuel", "destinationId"], equals: l.id } }))] }) } });
    for (const r of rows) { const p = r.payload as { reason: string; evidence: string }, prefix = r.kind.startsWith("FUEL") ? "fuel" : "production", peer = actor.userId !== r.makerId && actor.userId !== r.submitterId; add({ domain: "OPERATIONS", id: r.id, number: r.number, kind: r.kind, plantId: r.plantId, status: r.status, version: r.version, makerId: r.makerId, reason: p.reason, evidence: p.evidence, before: r.snapshot, after: r.payload, actions: r.status === "SUBMITTED" && peer && permission(actor, `${prefix}.verify`, r.plantId) ? ["verify", "reject"] : [] }); }
    const configs = await tx.operationalConfig.findMany({ where: { plantId: { in: ids }, kind: { in: [...(can(actor, "production.read") ? ["PRODUCT", "MIX"] : []), ...(can(actor, "fuel.read") ? ["FUEL", "ASSET"] : [])] } }, orderBy: { revision: "desc" } });
    for (const r of configs.filter(c => all || c.verificationStatus === "UNVERIFIED")) { const previous = configs.find(c => c.code === r.code && c.kind === r.kind && c.plantId === r.plantId && c.revision === r.revision - 1); add({ domain: "OP_CONFIG", id: r.id, number: `${r.code} v${r.revision}`, kind: r.kind, plantId: r.plantId, status: r.verificationStatus, version: r.revision, makerId: r.makerId, reason: null, evidence: r.evidence, before: previous?.payload ?? null, after: r.payload, actions: r.verificationStatus === "UNVERIFIED" && actor.userId !== r.makerId && permission(actor, ["FUEL", "ASSET"].includes(r.kind) ? "fuel.config.verify" : "production.config.verify", r.plantId) ? ["verify"] : [] }); }
  }
  if (can(actor, "sales.read")) {
    const rows = await tx.commerceRecord.findMany({ where: { plantId: { in: ids }, ...(all ? {} : { status: { in: ["SUBMITTED", "VERIFIED"] } }) }, include: { previous: { select: { snapshot: true } } } });
    for (const r of rows) { const p = r.payload as { reason: string; evidence: string }, key = r.kind === "DELIVERY" ? "delivery.verify" : "sales.verify", peer = actor.userId !== r.makerId && actor.userId !== r.submitterId; add({ domain: "COMMERCE", id: r.id, number: r.number, kind: r.kind, plantId: r.plantId, status: r.status, version: r.version, makerId: r.makerId, reason: p.reason, evidence: p.evidence, before: r.previous?.snapshot ?? null, after: r.snapshot ?? r.payload, actions: !peer ? [] : r.status === "SUBMITTED" && permission(actor, key, r.plantId) ? ["verify", "reject"] : r.status === "VERIFIED" && r.kind !== "DELIVERY" && permission(actor, "sales.approve", r.plantId) ? ["approve", "reject"] : [] }); }
    const configs = await tx.commerceConfig.findMany({ where: { plantId: { in: ids } }, orderBy: { revision: "desc" } });
    for (const r of configs.filter(c => all || c.verificationStatus === "UNVERIFIED")) {
      const previous = configs.find(c => c.code === r.code && c.kind === r.kind && c.plantId === r.plantId && c.revision === r.revision - 1), actions: string[] = [];
      if (r.verificationStatus === "UNVERIFIED") {
        if (r.kind === "EVENT_POLICY" && !r.pcBy && r.financeBy !== actor.userId && permission(actor, "sales.config.create", r.plantId)) actions.push("attest-pc");
        if (r.kind === "EVENT_POLICY" && !r.financeBy && r.pcBy !== actor.userId && r.makerId !== actor.userId && permission(actor, "sales.policy.attest", r.plantId)) actions.push("attest-finance");
        if (actor.userId !== r.makerId && actor.userId !== r.pcBy && actor.userId !== r.financeBy && permission(actor, "sales.config.verify", r.plantId) && (r.kind !== "EVENT_POLICY" || !!r.pcBy && !!r.financeBy)) actions.push("verify");
      }
      add({ domain: "COM_CONFIG", id: r.id, number: `${r.code} v${r.revision}`, kind: r.kind, plantId: r.plantId, status: r.verificationStatus, version: r.revision, makerId: r.makerId, reason: null, evidence: r.evidence, before: previous?.payload ?? null, after: { payload: r.payload, pcBy: r.pcBy, financeBy: r.financeBy }, actions });
    }
  }
  if (can(actor, "finance.read")) {
    const rows = await tx.financialRecord.findMany({ where: { plantId: { in: ids }, ...(all ? {} : { status: "SUBMITTED", kind: { in: ["PPH", "CORRECTION"] } }) }, include: { target: { select: { snapshot: true, status: true, makerId: true, posterId: true, verifierId: true } } } });
    for (const r of rows) { const p = r.payload as { reason: string; evidence: string }, peer = actor.userId !== r.makerId && actor.userId !== r.submitterId, key = r.kind === "PPH" ? "finance.pph.verify" : "finance.correction.approve"; add({ domain: "FINANCE", id: r.id, number: r.number, kind: r.kind, plantId: r.plantId, status: r.status, version: r.version, makerId: r.makerId, reason: p.reason, evidence: p.evidence, before: r.target?.snapshot ?? null, after: r.snapshot, actions: r.status === "SUBMITTED" && peer && permission(actor, key, r.plantId) && !(r.kind === "CORRECTION" && [r.target?.makerId, r.target?.posterId, r.target?.verifierId].includes(actor.userId)) ? [r.kind === "PPH" ? "verify" : "approve", "reject"] : [] }); }
    const configs = await tx.financialConfig.findMany({ where: { plantId: { in: ids } }, orderBy: { revision: "desc" } });
    for (const r of configs.filter(c => all || c.verificationStatus === "UNVERIFIED")) { const previous = configs.find(c => c.code === r.code && c.kind === r.kind && c.plantId === r.plantId && c.revision === r.revision - 1); add({ domain: "FIN_CONFIG", id: r.id, number: `${r.code} v${r.revision}`, kind: r.kind, plantId: r.plantId, status: r.verificationStatus, version: r.revision, makerId: r.makerId, reason: null, evidence: r.evidence, before: previous?.payload ?? null, after: { payload: r.payload, financeBy: r.financeBy }, actions: r.verificationStatus !== "UNVERIFIED" || actor.userId === r.makerId ? [] : !r.financeBy && permission(actor, "finance.config.attest", r.plantId) ? ["finance"] : r.financeBy && r.financeBy !== actor.userId && permission(actor, "finance.config.verify", r.plantId) ? ["verify"] : [] }); }
  }
  const modules: Record<string, string> = { INVENTORY: "INVENTORY", OPERATIONS: "OPERATIONS", COMMERCE: "COMMERCE", FINANCE: "FINANCE", OP_CONFIG: "OPERATIONS_CONFIG", COM_CONFIG: "COMMERCE_CONFIG", FIN_CONFIG: "FINANCE_CONFIG" };
  const history = items.length ? await tx.auditLog.findMany({ where: { OR: items.map(i => ({ recordId: i.id, module: modules[i.domain] })) }, select: { recordId: true, module: true, action: true, userId: true, createdAt: true, previousValue: true, newValue: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) : [];
  for (const item of items) { item.history = history.filter(h => h.recordId === item.id && h.module === modules[item.domain]); item.before ??= item.history.find(h => h.previousValue)?.previousValue ?? null; }
  return { plants, items: items.sort((a, b) => a.number.localeCompare(b.number)) };
}
export async function approvalData(db: PrismaClient, actor: AccessActor, plantId?: string, all = false) { return db.$transaction(tx => worklist(tx, actor, plantId, all), { isolationLevel: "RepeatableRead", timeout: 60000 }); }
export async function reviewAction(db: PrismaClient, actor: AccessActor, raw: unknown, request?: Request) {
  const p = reviewSchema.parse(raw), current = (await approvalData(db, actor, undefined, true)).items.find(i => i.domain === p.domain && i.id === p.id);
  if (!current) throw new DomainError(404, "Sumber di luar worklist/cakupan.");
  if (current.reviewHash !== p.reviewHash || current.version !== p.version) throw new DomainError(409, "Sumber berubah sejak review. Muat ulang before/after.");
  if (!current.actions.includes(p.action)) throw new DomainError(403, "Keputusan ini tidak diizinkan untuk akun/status sumber.");
  const action = { action: p.action, version: p.version, reason: p.reason };
  if (p.domain === "INVENTORY") return actStockDocument(db, actor, p.id, action, request);
  if (p.domain === "OPERATIONS") return actRun(db, actor, p.id, action, request);
  if (p.domain === "COMMERCE") return actCommerceRecord(db, actor, p.id, action, request);
  if (p.domain === "FINANCE") return actFinancialRecord(db, actor, p.id, action, request);
  if (p.domain === "OP_CONFIG") return verifyConfig(db, actor, p.id, { evidence: p.reason }, request);
  if (p.domain === "COM_CONFIG") return actCommerceConfig(db, actor, p.id, { action: p.action, evidence: p.reason }, request);
  return actFinancialConfig(db, actor, p.id, { action: p.action, evidence: p.reason }, request);
}
export { actStockPeriod };
