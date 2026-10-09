import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse } from "@/lib/domain-error";
import { approvalData, reviewAction, actStockPeriod } from "./approvals";
import { closingData } from "./closing";
import { dashboardData, exportReport, officialReport, parseReportFilter } from "./reports";
const response = (v: unknown) => NextResponse.json(JSON.parse(JSON.stringify(v, (_k, v) => typeof v === "bigint" ? v.toString() : v)));
async function read(request: Request, permission: string, work: (actor: import("@/lib/access").AccessActor, url: URL) => Promise<unknown>) {
  const a = await requirePermission(permission, { scoped: true }); if (!a.ok) return NextResponse.json({ message: a.message }, { status: a.status });
  try { return response(await work(a.session, new URL(request.url))); } catch (e) { return domainResponse(e); }
}
export const reportGET = (r: Request) => read(r, "reports.read", (a, u) => officialReport(db, a, parseReportFilter(u)));
export const dashboardGET = (r: Request) => read(r, "dashboard.read", (a, u) => dashboardData(db, a, parseReportFilter(u)));
export const approvalGET = (r: Request) => read(r, "approvals.read", (a, u) => approvalData(db, a, u.searchParams.get("plantId") || undefined, u.searchParams.get("history") === "1"));
export const closingGET = (r: Request) => read(r, "period.read", (a, u) => closingData(db, a, u.searchParams.get("plantId") || undefined, u.searchParams.get("month") ?? new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7)));
async function mutate(r: Request, permission: string, work: (actor: import("@/lib/access").AccessActor, input: unknown) => Promise<unknown>) {
  const a = await requirePermission(permission, { scoped: true, request: r }); if (!a.ok) return NextResponse.json({ message: a.message }, { status: a.status });
  try { return response({ data: await work(a.session, await r.json().catch(() => null)) }); } catch (e) { return domainResponse(e); }
}
export const approvalPOST = (r: Request) => mutate(r, "approvals.read", (a, b) => reviewAction(db, a, b, r));
export const closingPOST = (r: Request) => mutate(r, "period.read", (a, b) => actStockPeriod(db, a, b, r));
export async function exportGET(r: Request) {
  const a = await requirePermission("reports.export", { scoped: true }); if (!a.ok) return NextResponse.json({ message: a.message }, { status: a.status });
  try { const u = new URL(r.url), { report, csv } = await exportReport(db, a.session, parseReportFilter(u), u.searchParams.get("snapshot") ?? undefined, r); return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="quarryflow-${report.category}-${report.filters.from}-${report.filters.to}.csv"`, "Cache-Control": "private, no-store", "X-Report-Snapshot": report.snapshotHash } }); } catch (e) { return domainResponse(e); }
}
