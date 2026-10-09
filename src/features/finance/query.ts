import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor, can } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { CommerceSnapshot } from "@/features/commerce/service";
import { CompletionInput } from "@/features/commerce/schema";
import { aging, asOfEnd, localDay, settlement } from "./calculations";
import { InvoiceSnapshot } from "./service";
const D = Prisma.Decimal;
type Event = { kind: string; invoiceId: string | null; receiptId: string | null; amount: Prisma.Decimal };
export function projectInvoice(id: string, events: Event[]) {
  const own = events.filter(e => e.invoiceId === id), sum = (kind: string) => own.filter(e => e.kind === kind).reduce((n, e) => n.plus(e.amount), new D(0)).toString();
  const total = sum("INVOICE"), allocated = sum("ALLOCATION"), pph = sum("PPH"); return { total, allocated, pph, ...settlement(total, allocated, pph) };
}
export function projectReceipt(id: string, events: Event[]) {
  const own = events.filter(e => e.receiptId === id), total = own.filter(e => e.kind === "RECEIPT").reduce((n, e) => n.plus(e.amount), new D(0)), allocated = own.filter(e => e.kind === "ALLOCATION").reduce((n, e) => n.plus(e.amount), new D(0));
  return { total: total.toString(), allocated: allocated.toString(), unallocated: total.minus(allocated).toString() };
}
export async function financeData(db: PrismaClient, actor: AccessActor, url: URL) {
  return db.$transaction(tx => financialSnapshot(tx, actor, url), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });
}
async function financialSnapshot(db: Prisma.TransactionClient, actor: AccessActor, url: URL) {
  if (!can(actor, "finance.read")) throw new DomainError(403, "Akses tidak diizinkan.");
  const plantId = url.searchParams.get("plantId"), asOf = url.searchParams.get("asOf") ?? localDay(new Date()), cutoff = asOfEnd(asOf);
  if (plantId && !can(actor, "finance.read", plantId)) throw new DomainError(403, "Plant di luar cakupan.");
  const plants = await db.plant.findMany({ where: { ...(actor.allPlants ? {} : { id: { in: actor.plantIds } }), ...(plantId ? { id: plantId } : {}) }, orderBy: { code: "asc" } }), ids = plants.map(p => p.id);
  const [records, configs, parties, events, deliveries, claims] = await Promise.all([
    db.financialRecord.findMany({ where: { plantId: { in: ids } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }),
    db.financialConfig.findMany({ where: { plantId: { in: ids } }, orderBy: [{ code: "asc" }, { revision: "desc" }] }),
    db.commerceConfig.findMany({ where: { plantId: { in: ids }, kind: "PARTY", verificationStatus: "VERIFIED" }, orderBy: [{ code: "asc" }, { revision: "desc" }] }),
    db.financialEvent.findMany({ where: { source: { plantId: { in: ids } }, effectiveAt: { lt: cutoff } }, orderBy: [{ effectiveAt: "asc" }, { sequence: "asc" }] }),
    db.commerceRecord.findMany({ where: { plantId: { in: ids }, kind: "DELIVERY", status: "COMPLETED" }, include: { stockDocument: { select: { status: true } } }, orderBy: { effectiveAt: "desc" } }),
    db.financialInvoiceLine.findMany({ where: { invoice: { plantId: { in: ids }, status: "ISSUED" } } }),
  ]);
  const invoices = records.filter(r => r.kind === "INVOICE").map(r => {
    const s = r.snapshot as unknown as InvoiceSnapshot, b = projectInvoice(r.id, events);
    return { id: r.id, plantId: r.plantId, number: r.number, customerCode: r.customerCode, projectCode: r.projectCode, currency: r.currency, dueDate: r.dueDate, effectiveAt: r.effectiveAt, status: r.status, ...b, customer: s?.party.customerName, project: s?.party.projectName, ...aging(r.dueDate, asOf), events: events.filter(e => e.invoiceId === r.id).map(e => ({ ...e, sequence: e.sequence.toString() })) };
  }).filter(r => new D(r.total).gt(0)).sort((a, b) => Number(new D(b.outstanding).gt(0)) - Number(new D(a.outstanding).gt(0)) || (b.days ?? -Infinity) - (a.days ?? -Infinity) || a.number.localeCompare(b.number));
  const receipts = records.filter(r => r.kind === "RECEIPT").map(r => ({ id: r.id, plantId: r.plantId, number: r.number, customerCode: r.customerCode, currency: r.currency, status: r.status, effectiveAt: r.effectiveAt, ...projectReceipt(r.id, events), events: events.filter(e => e.receiptId === r.id).map(e => ({ ...e, sequence: e.sequence.toString() })) })).filter(r => new D(r.total).gt(0));
  const sources = deliveries.flatMap(row => {
    const s = row.snapshot as unknown as CommerceSnapshot | null, c = row.completion as unknown as CompletionInput | null;
    if (!s?.policy || !s.dispatchLines?.length || !c?.evidence || !c.receiver || s.dispatchLines.some(l => l.itemKind !== "SERVICE") && row.stockDocument?.status !== "POSTED") return [];
    const lines = s.dispatchLines.map(l => { const accepted = c.lines.find(x => x.orderLineKey === l.orderLineKey)?.accepted ?? "0", billed = claims.filter(x => x.deliveryId === row.id && x.role === "ITEM" && x.sourceKey === l.orderLineKey).reduce((n, x) => n.plus(x.quantity), new D(0)); return { sourceKey: l.orderLineKey, label: l.itemName, uom: l.uom, unitPrice: l.unitPrice, accepted, billed: billed.toString(), remaining: new D(accepted).minus(billed).toString() }; });
    const freight = new D(s.freightCharge ?? "0").minus(claims.filter(x => x.deliveryId === row.id && x.role === "FREIGHT").reduce((n, x) => n.plus(x.amount), new D(0))).toString();
    return [{ id: row.id, number: row.number, plantId: row.plantId, party: s.party, payment: s.payment, currency: s.currency, taxTreatment: s.taxTreatment, completionDate: localDay(c.effectiveAt), billingMonth: localDay(c.effectiveAt).slice(0, 7), lines, freightRemaining: freight }];
  });
  const comparisons = new Map<string, { customerCode: string; currency: string; invoice: Prisma.Decimal; allocation: Prisma.Decimal; pph: Prisma.Decimal; outstanding: Prisma.Decimal; receipt: Prisma.Decimal; unallocated: Prisma.Decimal }>();
  const group = (customerCode: string, currency: string) => { const key = `${customerCode}:${currency}`; if (!comparisons.has(key)) comparisons.set(key, { customerCode, currency, invoice: new D(0), allocation: new D(0), pph: new D(0), outstanding: new D(0), receipt: new D(0), unallocated: new D(0) }); return comparisons.get(key)!; };
  for (const r of invoices) { const g = group(r.customerCode!, r.currency!); g.invoice = g.invoice.plus(r.total); g.allocation = g.allocation.plus(r.allocated); g.pph = g.pph.plus(r.pph); g.outstanding = g.outstanding.plus(r.outstanding); }
  for (const r of receipts) { const g = group(r.customerCode!, r.currency!); g.receipt = g.receipt.plus(r.total); g.unallocated = g.unallocated.plus(r.unallocated); }
  const reconciliation = [...comparisons.values()].map(g => ({ ...g, invoiceDifference: g.invoice.minus(g.allocation).minus(g.pph).minus(g.outstanding).toString(), receiptDifference: g.receipt.minus(g.allocation).minus(g.unallocated).toString() }));
  const exceptions = [...invoices.filter(r => new D(r.outstanding).gt(0) && !r.dueDate).map(r => ({ kind: "MISSING_DUE_DATE", id: r.id, number: r.number, detail: "Due date belum tersedia; tampil terpisah dari overdue." })), ...receipts.filter(r => new D(r.unallocated).gt(0)).map(r => ({ kind: "UNALLOCATED_FUNDS", id: r.id, number: r.number, detail: `${r.unallocated} ${r.currency} belum dialokasikan.` })), ...sources.filter(r => r.completionDate <= asOf && (r.lines.some(l => new D(l.remaining).gt(0)) || new D(r.freightRemaining).gt(0))).map(r => ({ kind: "UNBILLED_CURRENT", id: r.id, number: r.number, detail: "Sumber masih memiliki quantity/freight belum ditagih saat ini." }))];
  return { plants, asOf, records, configs, parties, invoices, receipts, sources, reconciliation, exceptions };
}
