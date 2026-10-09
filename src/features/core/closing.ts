import { PrismaClient } from "@prisma/client";
import { AccessActor, can } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { periodReadiness } from "@/features/inventory/ledger-service";
import { scopedPlants } from "./approvals";
import { queryReport, reportPermissions } from "./reports";
export async function closingData(db: PrismaClient, actor: AccessActor, plantId: string | undefined, month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new DomainError(422, "Periode tidak sah.");
  return db.$transaction(async tx => {
    const permission = (actor: AccessActor, p: string, plantId: string) => can(actor, p, plantId);
    const plants = await scopedPlants(tx, actor, "period.read", plantId), periods = [];
    for (const plant of plants) { const row = await tx.stockPeriod.findUnique({ where: { plantId_month: { plantId: plant.id, month } } }), ready = await periodReadiness(tx, plant.id, month); const history = row ? await tx.auditLog.findMany({ where: { module: "INVENTORY_PERIOD", recordId: row.id }, select: { userId: true, createdAt: true, action: true, previousValue: true, newValue: true }, orderBy: { createdAt: "asc" } }) : []; const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
      const reviewReports = [];
      for (const category of ["inventory", "production", "consumption", "fuel", "delivery", "invoice", "payment", "aging"] as const) if (can(actor, reportPermissions[category], plant.id)) {
        const report = await queryReport(tx, actor, { category, plantId: plant.id, from: `${month}-01`, to: lastDay }, "period.read");
        reviewReports.push({ category, title: report.title, sources: report.rows.length, totals: report.totals, kpis: report.kpis, exceptions: report.rows.filter(r => r.event.startsWith("UNBILLED") || r.event === "UNALLOCATED" || r.detail.includes("exception")).map(r => ({ reference: r.reference, event: r.event, quantity: r.quantity, uom: r.uom, amount: r.amount, currency: r.currency })) });
      }
      periods.push({ plant, month, row, readiness: ready, history, reviewReports, actions: !row?.requestedBy ? permission(actor, "inventory.period.request", plant.id) ? [row?.closed ? "request-reopen" : "request-close"] : [] : row.requestedBy === actor.userId ? [] : [...(permission(actor, "inventory.period.reconcile", plant.id) ? ["finance"] : []), ...(permission(actor, "inventory.period.approve", plant.id) ? ["reject", ...(row.financeBy && row.financeBy !== actor.userId && (!row.requestClose || !ready.pending) && row.reconciliationHash === ready.hash ? ["approve"] : [])] : [])] }); }
    return { plants, month, periods };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}
