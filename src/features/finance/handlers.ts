import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse } from "@/lib/domain-error";
import { financeData } from "./query";
import { actFinancialConfig, actFinancialRecord, createFinancialConfig, saveFinancialRecord } from "./service";
const response = (v: unknown, status = 200) => NextResponse.json(JSON.parse(JSON.stringify(v)), { status });
export async function GET(request: Request) {
  const a = await requirePermission("finance.read", { scoped: true }); if (!a.ok) return response({ message: a.message }, a.status);
  try { return response(await financeData(db, a.session, new URL(request.url))); } catch (e) { return domainResponse(e); }
}
type Context = { params: Promise<{ id: string }> };
async function mutation(request: Request, work: (actor: import("@/lib/access").AccessActor, body: unknown) => Promise<unknown>, status = 200) {
  const a = await requirePermission("finance.read", { scoped: true, request }); if (!a.ok) return response({ message: a.message }, a.status);
  try { return response({ data: await work(a.session, await request.json().catch(() => null)) }, status); } catch (e) { return domainResponse(e); }
}
export const POST = (r: Request) => mutation(r, (a, b) => saveFinancialRecord(db, a, b, undefined, r), 201);
export const PATCH = (r: Request, c: Context) => mutation(r, async (a, b) => saveFinancialRecord(db, a, b, (await c.params).id, r));
export const actionPOST = (r: Request, c: Context) => mutation(r, async (a, b) => actFinancialRecord(db, a, (await c.params).id, b, r));
export const configPOST = (r: Request) => mutation(r, (a, b) => createFinancialConfig(db, a, b, r), 201);
export const configActionPOST = (r: Request, c: Context) => mutation(r, async (a, b) => actFinancialConfig(db, a, (await c.params).id, b, r));
