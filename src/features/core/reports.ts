import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor, can } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { writeAudit } from "@/lib/audit";
import { operationHash, RunSnapshot } from "@/features/operations/service";
import { CommerceSnapshot } from "@/features/commerce/service";
import { CompletionInput } from "@/features/commerce/schema";
import { InvoiceSnapshot } from "@/features/finance/service";
import { aging, asOfEnd, localDay } from "@/features/finance/calculations";
import { projectInvoice, projectReceipt } from "@/features/finance/query";
import { fuelKpi } from "@/features/operations/calculations";
import { scopedPlants, worklist } from "./approvals";
import { categories, filterSchema, ReportFilter } from "./schema";
type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;
export const reportPermissions: Record<ReportFilter["category"], string> = { production: "production.read", consumption: "production.read", inventory: "inventory.read", fuel: "fuel.read", sales: "sales.read", po: "sales.read", delivery: "sales.read", invoice: "finance.read", payment: "finance.read", aging: "finance.read", closing: "period.read", approval: "approvals.read" };
export const reportTitles = { production: "Produksi terukur", consumption: "Konsumsi bahan aktual", inventory: "Ledger & saldo stok", fuel: "BBM & KPI plant", sales: "Sales ordered", po: "Commitment Customer PO", delivery: "Dispatch / completion / ritase", invoice: "Invoice issued & unbilled", payment: "Cash received / allocation / PPh", aging: "AR / aging as-of", closing: "Periode & closing", approval: "Approval & exception" };
export type ReportRow = { id: string; sourceId: string; reference: string; date: string; plantId: string; plant: string; event: string; status: string; customer: string; project: string; item: string; itemId: string; location: string; locationId: string; quantity: string | null; uom: string; amount: string | null; currency: string; detail: string; metadata: Record<string, string> };
export function reportTotals(rows: ReportRow[]) {
  const groups = new Map<string, { plantId: string; plant: string; event: string; uom: string; currency: string; quantity: Prisma.Decimal; amount: Prisma.Decimal; count: number }>();
  for (const row of rows) { const key = JSON.stringify([row.plantId, row.event, row.uom, row.currency]); if (!groups.has(key)) groups.set(key, { plantId: row.plantId, plant: row.plant, event: row.event, uom: row.uom, currency: row.currency, quantity: new D(0), amount: new D(0), count: 0 }); const g = groups.get(key)!; if (row.quantity !== null) g.quantity = g.quantity.plus(row.quantity); if (row.amount !== null) g.amount = g.amount.plus(row.amount); g.count++; }
  return [...groups.values()].map(g => ({ ...g, quantity: g.uom ? g.quantity.toString() : null, amount: g.currency ? g.amount.toString() : null }));
}
export function weeklyBand(day: string) { const d = Number(day.slice(8, 10)); return d <= 7 ? "M1" : d <= 14 ? "M2" : d <= 21 ? "M3" : "M4"; }
function fail(message: string, status = 403): never { throw new DomainError(status, message); }
function matches(row: ReportRow, f: ReportFilter) { return (!f.locationId || row.locationId === f.locationId) && (!f.itemId || row.itemId === f.itemId) && (!f.customer || row.customer.toLowerCase().includes(f.customer.toLowerCase())) && (!f.project || row.project.toLowerCase().includes(f.project.toLowerCase())) && (!f.status || row.status === f.status || row.event === f.status); }
export async function queryReport(tx: Tx, actor: AccessActor, f: ReportFilter, entry: "reports.read" | "dashboard.read" | "period.read") {
  const key = reportPermissions[f.category]; if (!can(actor, key, f.plantId)) fail("Domain laporan atau plant tidak diizinkan.");
  const plants = await scopedPlants(tx, actor, entry, f.plantId), ids = plants.map(p => p.id), start = new Date(`${f.from}T00:00:00+07:00`), end = asOfEnd(f.to), rows: ReportRow[] = [], kpis: { plantId: string; plant: string; output: string; liters: string; ratio: string | null; unit: string; exception: string | null }[] = [];
  const name = (id: string) => plants.find(p => p.id === id)?.name ?? "Plant ditugaskan";
  const make = (v: Partial<ReportRow> & Pick<ReportRow, "id" | "reference" | "date" | "plantId" | "event">): ReportRow => ({ sourceId: v.id, plant: name(v.plantId), status: "POSTED", customer: "", project: "", item: "", itemId: "", location: "", locationId: "", quantity: null, uom: "", amount: null, currency: "", detail: "", metadata: {}, ...v });
  const add = (v: Partial<ReportRow> & Pick<ReportRow, "id" | "reference" | "date" | "plantId" | "event">) => rows.push(make(v));
  const inRange = (date: string) => date >= f.from && date <= f.to;
  const stockCategories = ["production", "consumption", "inventory", "fuel"];
  if (stockCategories.includes(f.category)) {
    const ledger = await tx.stockLedgerEntry.findMany({ where: { location: { plantId: { in: ids } }, effectiveAt: { lt: end } }, include: { item: { select: { name: true } }, location: { select: { id: true, plantId: true, name: true, kind: true } }, uom: { select: { code: true } }, document: { include: { operationalRun: { select: { kind: true, snapshot: true } }, reversalOf: { include: { operationalRun: { select: { kind: true, snapshot: true } } } } } } }, orderBy: [{ effectiveAt: "asc" }, { sequence: "asc" }] });
    const balances = new Map<string, { row: ReportRow; sum: Prisma.Decimal }>(), output = new Map<string, Prisma.Decimal>(), usage = new Map<string, Prisma.Decimal>();
    for (const e of ledger) {
      const original = e.document.reversalOf ?? e.document, run = original.operationalRun, s = run?.snapshot as unknown as RunSnapshot | null, l = s?.lines[e.lineNo - 1], day = localDay(e.effectiveAt);
      const common = { id: e.id, sourceId: original.id, reference: e.document.number, date: day, plantId: e.location.plantId, item: e.item.name, itemId: e.itemId, location: e.location.name, locationId: e.locationId, quantity: e.quantity.toString(), uom: e.uom.code, metadata: { actor: e.actorId, source: original.number, line: String(e.lineNo), week: weeklyBand(day) } };
      if (f.category === "inventory" || f.category === "fuel" && e.uom.code === "L" && e.location.kind === "TANK") {
        if (inRange(day)) add({ ...common, event: "MOVEMENT", detail: e.document.kind });
        const key = `${e.itemId}:${e.locationId}:${e.uomId}`; if (!balances.has(key)) balances.set(key, { row: make({ ...common, id: `balance:${key}`, date: f.to, event: "BALANCE", reference: `${e.item.name} / ${e.location.name}` }), sum: new D(0) }); const b = balances.get(key)!; b.sum = b.sum.plus(e.quantity);
      }
      if (run && s && l && inRange(day)) {
        if (f.category === "production" && l.role === "OUTPUT" && ["SC", "BP", "AMP", "BLENDING"].includes(run.kind)) add({ ...common, event: `OUTPUT ${run.kind}`, detail: "Output terukur; reversal bertanggal mengurangi hasil efektif." });
        if (f.category === "consumption" && l.role === "INPUT" && !run.kind.startsWith("FUEL")) add({ ...common, event: `CONSUMPTION ${run.kind}`, quantity: e.quantity.negated().toString(), detail: "Konsumsi aktual; BBM AMP berasal dari usage tersendiri." });
        if (f.category === "fuel") {
          const plant = plants.find(p => p.id === e.location.plantId);
          if (l.role === "OUTPUT" && run.kind === plant?.kind) output.set(e.location.plantId, (output.get(e.location.plantId) ?? new D(0)).plus(e.quantity));
          if (run.kind === "FUEL_USAGE" && l.role === "INPUT") { if (s.eligibleProduction) usage.set(e.location.plantId, (usage.get(e.location.plantId) ?? new D(0)).minus(e.quantity)); add({ ...common, event: "FUEL_USAGE", quantity: e.quantity.negated().toString(), detail: s.eligibleProduction ? "Eligible KPI produksi" : "Non-produksi / excluded dengan bukti", metadata: { ...common.metadata, asset: String((s.asset as { name?: string } | null)?.name ?? ""), eligible: String(s.eligibleProduction) } }); }
        }
      }
    }
    for (const b of balances.values()) rows.push({ ...b.row, quantity: b.sum.toString() });
    if (f.category === "fuel") for (const p of plants) { const liters = (usage.get(p.id) ?? new D(0)).toString(), measured = (output.get(p.id) ?? new D(0)).toString(); kpis.push({ plantId: p.id, plant: p.name, liters, output: measured, ...fuelKpi(liters, measured), unit: p.kind === "AMP" ? "liter/ton" : "liter/m³" }); }
  } else if (["sales", "po", "delivery"].includes(f.category)) {
    const records = await tx.commerceRecord.findMany({ where: { plantId: { in: ids }, kind: f.category === "sales" ? "SO" : f.category === "po" ? "PO" : "DELIVERY", status: { in: f.category === "delivery" ? ["DISPATCHED", "COMPLETED"] : ["APPROVED"] }, effectiveAt: { lt: end } }, orderBy: [{ effectiveAt: "desc" }, { revision: "desc" }] });
    const fulfillment = f.category !== "sales" ? await tx.commerceFulfillment.findMany({ where: { delivery: { plantId: { in: ids } }, effectiveAt: { lt: end } } }) : [];
    const active = f.category === "po" ? records.filter((r, i) => records.findIndex(x => x.rootId === r.rootId) === i) : records;
    for (const r of active) {
      const s = r.snapshot as unknown as CommerceSnapshot, p = r.payload as { mode?: string; trips?: number; driver?: string }, day = localDay(r.effectiveAt), common = { reference: r.number, sourceId: r.id, date: day, plantId: r.plantId, customer: `${s.party.customerCode} ${s.party.customerName}`, project: `${s.party.projectCode} ${s.party.projectName}`, status: r.status };
      if (f.category === "delivery") {
        const c = r.completion as unknown as CompletionInput | null;
        for (const l of s.dispatchLines ?? []) { const physical = fulfillment.find(v => v.deliveryId === r.id && v.orderLineKey === l.orderLineKey); if (physical && inRange(localDay(physical.effectiveAt))) add({ ...common, id: physical.id, status: l.itemKind === "SERVICE" ? "COMPLETED" : "DISPATCHED", date: localDay(physical.effectiveAt), event: l.itemKind === "SERVICE" ? "SERVICE_DISPATCHED" : "DISPATCHED", item: l.itemName, itemId: l.itemId, locationId: l.locationId ?? "", quantity: physical.quantity.toString(), uom: l.uom, metadata: { actor: physical.actorId, mode: p.mode ?? "", driver: p.driver ?? "", vehicle: JSON.stringify(s.vehicle ?? null) } }); if (c && inRange(localDay(c.effectiveAt))) { const accepted = c.lines.find(v => v.orderLineKey === l.orderLineKey); add({ ...common, id: `${r.id}:complete:${l.orderLineKey}`, date: localDay(c.effectiveAt), event: "COMPLETED_ACCEPTED", status: "COMPLETED", item: l.itemName, itemId: l.itemId, locationId: l.locationId ?? "", quantity: accepted?.accepted ?? "0", uom: l.uom, metadata: { actor: r.posterId ?? "", dispatched: l.quantity, rejected: accepted?.rejected ?? "0", receiver: c.receiver, evidence: c.evidence } }); } }
        const tripDay = localDay(fulfillment.find(v => v.deliveryId === r.id)?.effectiveAt ?? r.effectiveAt); if (inRange(tripDay)) add({ ...common, date: tripDay, id: `${r.id}:trips`, event: p.mode === "SERVICE" ? "SERVICE_VISITS" : "TRIPS", quantity: String(p.trips), uom: p.mode === "SERVICE" ? "kunjungan" : "rit", amount: s.freightCharge ?? "0", currency: s.currency, detail: "Charge customer; biaya internal dipisah", metadata: { actor: r.posterId ?? "", internalFreight: s.internalFreight ?? "0", mode: p.mode ?? "" } });
      } else for (const l of s.lines) {
        const commonLine = { ...common, item: l.itemName, itemId: l.itemId, uom: l.uom, currency: s.currency };
        if (f.category === "sales" && inRange(day)) add({ ...commonLine, id: `${r.id}:${l.key}`, event: "ORDERED", quantity: l.quantity, amount: l.amount, metadata: { actor: r.approverId ?? r.verifierId ?? "", priceId: l.priceId }, detail: "Order approved; tidak dianggap cash/invoice." });
        if (f.category === "po") { const realized = fulfillment.filter(v => v.poRootId === r.rootId && v.poLineKey === l.key).reduce((n, v) => n.plus(v.quantity), new D(0)); for (const [event, quantity] of [["PO_COMMITTED", l.quantity], ["PO_REALIZED", realized.toString()], ["PO_REMAINING", new D(l.quantity).minus(realized).toString()]]) add({ ...commonLine, id: `${r.id}:${l.key}:${event}`, event, date: f.to, quantity, amount: null, currency: "", metadata: { actor: r.approverId ?? r.verifierId ?? "", revision: String(r.revision), rootId: r.rootId, lineKey: l.key } }); }
      }
    }
  } else if (["invoice", "payment", "aging"].includes(f.category)) {
    const [records, events] = await Promise.all([tx.financialRecord.findMany({ where: { plantId: { in: ids } } }), tx.financialEvent.findMany({ where: { source: { plantId: { in: ids } }, effectiveAt: { lt: end } }, orderBy: [{ effectiveAt: "asc" }, { sequence: "asc" }] })]);
    const record = new Map(records.map(r => [r.id, r]));
    if (f.category !== "aging") for (const e of events) {
      if (!inRange(localDay(e.effectiveAt)) || f.category === "invoice" && e.kind !== "INVOICE" || f.category === "payment" && e.kind === "INVOICE") continue;
      const source = record.get(e.recordId)!, invoice = e.invoiceId ? record.get(e.invoiceId) : undefined, snapshot = (invoice?.snapshot ?? source.snapshot) as unknown as InvoiceSnapshot;
      add({ id: e.id, sourceId: source.id, reference: source.number, date: localDay(e.effectiveAt), plantId: source.plantId, event: { INVOICE: "INVOICED", RECEIPT: "CASH_RECEIVED", ALLOCATION: "ALLOCATED", PPH: "PPH_VERIFIED" }[e.kind]!, status: e.reversalOfId ? "REVERSED" : e.kind === "INVOICE" ? "ISSUED" : "POSTED", customer: `${source.customerCode} ${snapshot?.party?.customerName ?? ""}`, project: `${source.projectCode ?? ""} ${snapshot?.party?.projectName ?? ""}`, amount: e.amount.toString(), currency: source.currency!, metadata: { actor: e.actorId, ...(e.kind === "INVOICE" ? { subtotal: snapshot.subtotal, taxBase: snapshot.taxBase, tax: snapshot.tax, taxTreatment: snapshot.taxTreatment, taxConfig: JSON.stringify(snapshot.taxConfig), termConfig: JSON.stringify(snapshot.termConfig) } : {}), invoice: invoice?.number ?? "", receipt: e.receiptId ? record.get(e.receiptId)?.number ?? "" : "", reversalOfId: e.reversalOfId ?? "", kind: e.kind } });
    }
    if (f.category === "aging") for (const r of records.filter(r => r.kind === "INVOICE")) { const b = projectInvoice(r.id, events); if (!new D(b.total).gt(0) || !new D(b.outstanding).gt(0)) continue; const s = r.snapshot as unknown as InvoiceSnapshot, band = aging(r.dueDate, f.to); add({ id: r.id, reference: r.number, date: f.to, plantId: r.plantId, event: band.bucket, status: b.paymentStatus, customer: `${r.customerCode} ${s.party.customerName}`, project: `${r.projectCode} ${s.party.projectName}`, amount: b.outstanding, currency: r.currency!, detail: r.dueDate ? `Due ${r.dueDate}; ${band.days} hari` : "Due N/A — exception", metadata: { actor: r.posterId ?? "", total: b.total, allocated: b.allocated, verifiedPph: b.pph, dueDate: r.dueDate ?? "N/A", days: String(band.days ?? "N/A") } }); }
    if (f.category === "payment") for (const r of records.filter(r => r.kind === "RECEIPT")) { const b = projectReceipt(r.id, events); if (new D(b.total).gt(0)) add({ id: `${r.id}:available`, sourceId: r.id, reference: r.number, date: f.to, plantId: r.plantId, event: "UNALLOCATED", customer: r.customerCode!, amount: b.unallocated, currency: r.currency!, metadata: { actor: r.posterId ?? "", receipt: b.total, allocation: b.allocated }, detail: "Saldo as-of; tidak dikurangkan lagi dari invoice." }); }
    if (f.category === "invoice") {
      const [deliveries, claims] = await Promise.all([tx.commerceRecord.findMany({ where: { plantId: { in: ids }, kind: "DELIVERY", status: "COMPLETED" } }), tx.financialInvoiceLine.findMany({ where: { invoice: { plantId: { in: ids } } } })]);
      const billed = new Set(records.filter(r => r.kind === "INVOICE" && new D(projectInvoice(r.id, events).total).gt(0)).map(r => r.id));
      for (const r of deliveries) { const s = r.snapshot as unknown as CommerceSnapshot, c = r.completion as unknown as CompletionInput; if (!s?.policy || !c || !inRange(localDay(c.effectiveAt))) continue; for (const l of s.dispatchLines ?? []) { const used = claims.filter(v => v.deliveryId === r.id && v.role === "ITEM" && v.sourceKey === l.orderLineKey && billed.has(v.invoiceId)).reduce((n, v) => n.plus(v.quantity), new D(0)), remaining = new D(c.lines.find(v => v.orderLineKey === l.orderLineKey)?.accepted ?? "0").minus(used); if (remaining.gt(0)) add({ id: `${r.id}:${l.orderLineKey}:unbilled`, sourceId: r.id, reference: r.number, date: localDay(c.effectiveAt), plantId: r.plantId, event: "UNBILLED_ACCEPTED", status: "COMPLETED", customer: `${s.party.customerCode} ${s.party.customerName}`, project: `${s.party.projectCode} ${s.party.projectName}`, item: l.itemName, itemId: l.itemId, locationId: l.locationId ?? "", quantity: remaining.toString(), uom: l.uom, metadata: { actor: r.posterId ?? "", accepted: c.lines.find(v => v.orderLineKey === l.orderLineKey)?.accepted ?? "0", billed: used.toString() } }); } const freight = new D(s.freightCharge ?? "0").minus(claims.filter(v => v.deliveryId === r.id && v.role === "FREIGHT" && billed.has(v.invoiceId)).reduce((n, v) => n.plus(v.amount), new D(0))); if (freight.gt(0)) add({ id: `${r.id}:freight:unbilled`, sourceId: r.id, reference: r.number, date: localDay(c.effectiveAt), plantId: r.plantId, event: "UNBILLED_FREIGHT", status: "COMPLETED", customer: `${s.party.customerCode} ${s.party.customerName}`, project: `${s.party.projectCode} ${s.party.projectName}`, amount: freight.toString(), currency: s.currency }); }
    }
  } else if (f.category === "closing") {
    const periods = await tx.stockPeriod.findMany({ where: { plantId: { in: ids }, month: { gte: f.from.slice(0, 7), lte: f.to.slice(0, 7) } } });
    for (const r of periods) add({ id: r.id, reference: `${r.month} ${name(r.plantId)}`, date: `${r.month}-01`, plantId: r.plantId, event: r.closed ? "CLOSED" : "OPEN", status: r.closed ? "CLOSED" : "OPEN", detail: r.reason ?? "", metadata: { requestedBy: r.requestedBy ?? "", financeBy: r.financeBy ?? "", approvedBy: r.approvedBy ?? "", version: String(r.version), pending: r.requestClose === null ? "" : r.requestClose ? "close" : "reopen" } });
  } else {
    const review = await worklist(tx, actor, f.plantId, true);
    for (const r of review.items) { const activity = r.history.filter(h => inRange(localDay(h.createdAt))); for (const [i, h] of activity.entries()) add({ id: `${r.id}:history:${i}`, sourceId: r.id, reference: r.number, date: localDay(h.createdAt), plantId: r.plantId, event: h.action, status: r.status, detail: r.reason ?? r.evidence ?? "", metadata: { domain: r.domain, makerId: r.makerId, actor: h.userId ?? "", before: JSON.stringify(h.previousValue), after: JSON.stringify(h.newValue) } }); }
  }
  const filtered = rows.filter(r => matches(r, f)).sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference) || a.id.localeCompare(b.id)), totals = reportTotals(filtered);
  const filters = { ...f }, definition = { source: "Immutable stock/commerce/financial sources; legacy archives excluded", dates: "Effective date WIB; balances/commitments/aging at end of to; approval recorded date", metrics: "Ordered, dispatched, completed accepted, invoiced, cash received are separate events. Quantity grouped per plant/event/UOM, money per currency.", weekly: "M1 1–7, M2 8–14, M3 15–21, M4 22–akhir bulan", fuel: "KPI per plant/periode; filter lokasi/material memfilter detail dan tidak mengubah denominator plant." };
  return { category: f.category, title: reportTitles[f.category], filters, plants, rows: filtered, totals, kpis, definition, snapshotHash: operationHash({ filters, rows: filtered, totals, kpis }) };
}
export function parseReportFilter(url: URL): ReportFilter {
  const today = localDay(new Date()), raw = Object.fromEntries([...url.searchParams.entries()].filter(([k, v]) => ["category", "from", "to", "plantId", "locationId", "itemId", "customer", "project", "status"].includes(k) && v));
  return filterSchema.parse({ from: `${today.slice(0, 7)}-01`, to: today, ...raw });
}
export async function officialReport(db: PrismaClient, actor: AccessActor, raw: unknown) {
  const f = filterSchema.parse(raw); if (!can(actor, "reports.read")) fail("Laporan tidak diizinkan.");
  return db.$transaction(tx => queryReport(tx, actor, f, "reports.read"), { isolationLevel: "RepeatableRead", timeout: 60000 });
}
export async function dashboardData(db: PrismaClient, actor: AccessActor, f: ReportFilter) {
  if (!can(actor, "dashboard.read")) fail("Dashboard tidak diizinkan.");
  return db.$transaction(async tx => {
    const available = categories.filter(c => can(actor, reportPermissions[c]));
    const selected = actor.roles.includes("DIREKTUR") ? ["production", "sales", "delivery", "invoice", "payment", "aging"] : actor.functions.includes("FINANCE") && !actor.functions.includes("PC") ? ["invoice", "payment", "aging", "closing"] : ["production", "fuel", "sales", "delivery", "closing", "approval"];
    const reports = await Promise.all(selected.filter(c => available.includes(c as ReportFilter["category"])).map(c => queryReport(tx, actor, { ...f, category: c as ReportFilter["category"] }, "dashboard.read")));
    const plants = reports[0]?.plants ?? await scopedPlants(tx, actor, "dashboard.read", f.plantId), locations = actor.roles.includes("HSE") ? await tx.plantLocation.findMany({ where: { plantId: { in: plants.map(p => p.id) }, active: true, verificationStatus: "VERIFIED" }, select: { name: true, kind: true, plantId: true } }) : [];
    return { plants, locations, filters: f, focus: actor.roles.includes("DIREKTUR") ? "Direktur" : actor.roles.includes("MANAGER") ? "Manager" : actor.roles.includes("HSE") ? "HSE" : actor.functions.join(" / "), reports, available, definition: reports[0]?.definition ?? null };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}
export const csvColumns = ["id", "sourceId", "plantId", "reference", "date", "plant", "event", "status", "customer", "project", "item", "location", "quantity", "uom", "amount", "currency", "detail", "metadata"] as const;
export function csvCell(value: unknown) { let text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); if (/^[\s]*[=+@-]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; }
export function reportCsv(report: Awaited<ReturnType<typeof officialReport>>) {
  const lines = [csvColumns.map(csvCell).join(","), ...report.rows.map(r => csvColumns.map(c => csvCell(r[c])).join(",")), ...report.totals.map(t => csvColumns.map(c => csvCell(({ reference: "TOTAL", plant: t.plant, event: t.event, quantity: t.quantity, uom: t.uom, amount: t.amount, currency: t.currency, metadata: { count: t.count } } as Record<string, unknown>)[c])).join(",")), ...report.kpis.map(k => csvColumns.map(c => csvCell(({ reference: "KPI PLANT", plant: k.plant, event: "FUEL_KPI", quantity: k.output, uom: k.unit === "liter/ton" ? "TON" : "M3", metadata: { liters: k.liters, ratio: k.ratio ?? "N/A", unit: k.unit, exception: k.exception ?? "" } } as Record<string, unknown>)[c])).join(","))]; return `\uFEFF${lines.join("\r\n")}\r\n`;
}
export async function exportReport(db: PrismaClient, actor: AccessActor, f: ReportFilter, expected?: string, request?: Request) {
  if (!can(actor, "reports.export", f.plantId)) fail("Export tidak diizinkan."); const report = await officialReport(db, actor, f);
  if (expected && expected !== report.snapshotHash) fail("Data berubah sejak layar dimuat. Refresh laporan sebelum export.", 409);
  const csv = reportCsv(report); await writeAudit(db, { userId: actor.userId, module: "REPORT", action: "EXPORT_CSV", newValue: { filters: f, snapshotHash: report.snapshotHash, rows: report.rows.length, totals: report.totals }, request }); return { report, csv };
}
