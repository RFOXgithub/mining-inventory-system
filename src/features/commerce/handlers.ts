import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse } from "@/lib/domain-error";
import { commerceData } from "./query";
import { actCommerceConfig, actCommerceRecord, createCommerceConfig, saveCommerceRecord } from "./service";
const response = (value: unknown, status = 200) => NextResponse.json(JSON.parse(JSON.stringify(value)), { status });
export async function GET(request: Request) {
  const a = await requirePermission("sales.read", { scoped: true }); if (!a.ok) return response({ message: a.message }, a.status);
  try { return response(await commerceData(db, a.session, new URL(request.url))); } catch (error) { return domainResponse(error); }
}
type Context = { params: Promise<{ id: string }> };
async function mutation(request: Request, operation: (actor: import("@/lib/access").AccessActor, body: unknown) => Promise<unknown>, status = 200) {
  const a = await requirePermission("sales.read", { scoped: true, request }); if (!a.ok) return response({ message: a.message }, a.status);
  try { return response({ data: await operation(a.session, await request.json().catch(() => null)) }, status); } catch (error) { return domainResponse(error); }
}
export const POST = (request: Request) => mutation(request, (actor, body) => saveCommerceRecord(db, actor, body, undefined, request), 201);
export const PATCH = (request: Request, context: Context) => mutation(request, async (actor, body) => saveCommerceRecord(db, actor, body, (await context.params).id, request));
export const actionPOST = (request: Request, context: Context) => mutation(request, async (actor, body) => actCommerceRecord(db, actor, (await context.params).id, body, request));
export const configPOST = (request: Request) => mutation(request, (actor, body) => createCommerceConfig(db, actor, body, request), 201);
export const configActionPOST = (request: Request, context: Context) => mutation(request, async (actor, body) => actCommerceConfig(db, actor, (await context.params).id, body, request));
