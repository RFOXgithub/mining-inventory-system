import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse } from "@/lib/domain-error";
import { operationData } from "./query";
import { actRun, saveRun, createConfig, verifyConfig } from "./service";

const json = (data: unknown, status = 200) => NextResponse.json(JSON.parse(JSON.stringify(data)), { status });
async function auth(request?: Request) {
  const first = await requirePermission("production.read", { scoped: true, request });
  return first.ok || first.status !== 403 ? first : requirePermission("fuel.read", { scoped: true, request });
}
export async function GET(request: Request) {
  const a = await auth(); if (!a.ok) return json({ message: a.message }, a.status);
  try { return json(await operationData(db, a.session, new URL(request.url))); } catch (error) { return domainResponse(error); }
}
export async function POST(request: Request) {
  const a = await auth(request); if (!a.ok) return json({ message: a.message }, a.status);
  try { return json({ data: await saveRun(db, a.session, await request.json().catch(() => null), undefined, request) }, 201); } catch (error) { return domainResponse(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const a = await auth(request); if (!a.ok) return json({ message: a.message }, a.status);
  try { return json({ data: await saveRun(db, a.session, await request.json().catch(() => null), (await context.params).id, request) }); } catch (error) { return domainResponse(error); }
}
export async function actionPOST(request: Request, context: { params: Promise<{ id: string }> }) {
  const a = await auth(request); if (!a.ok) return json({ message: a.message }, a.status);
  try { return json({ data: await actRun(db, a.session, (await context.params).id, await request.json().catch(() => null), request) }); } catch (error) { return domainResponse(error); }
}
export async function configPOST(request: Request) {
  const a = await auth(request); if (!a.ok) return json({ message: a.message }, a.status);
  try { return json({ data: await createConfig(db, a.session, await request.json().catch(() => null), request) }, 201); } catch (error) { return domainResponse(error); }
}
export async function configActionPOST(request: Request, context: { params: Promise<{ id: string }> }) {
  const a = await auth(request); if (!a.ok) return json({ message: a.message }, a.status);
  try { return json({ data: await verifyConfig(db, a.session, (await context.params).id, await request.json().catch(() => null), request) }); } catch (error) { return domainResponse(error); }
}
