import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse } from "@/lib/domain-error";
import { createStockDocument, actStockDocument, actStockPeriod } from "./ledger-service";
import { inventoryData, inventoryDocuments } from "./ledger-query";

const json = (data: unknown, status = 200) => NextResponse.json(JSON.parse(JSON.stringify(data)), { status });
export async function balancesGET(request: Request) {
  const auth = await requirePermission("inventory.read", { scoped: true });
  if (!auth.ok) return json({ message: auth.message }, auth.status);
  try { return json(await inventoryData(db, auth.session, new URL(request.url))); } catch (error) { return domainResponse(error); }
}
export function documentsGET(kind?: string) { return async (request: Request) => {
  const auth = await requirePermission("inventory.read", { scoped: true });
  if (!auth.ok) return json({ message: auth.message }, auth.status);
  const url = new URL(request.url); if (kind) url.searchParams.set("kind", kind);
  try { return json(await inventoryDocuments(db, auth.session, url)); } catch (error) { return domainResponse(error); }
}; }
export function documentPOST(kind?: string) { return async (request: Request) => {
  const auth = await requirePermission("inventory.read", { scoped: true, request });
  if (!auth.ok) return json({ message: auth.message }, auth.status);
  try {
    const raw = await request.json().catch(() => null);
    if (kind && raw?.kind && raw.kind !== kind) return json({ message: "Jenis dokumen tidak sesuai endpoint." }, 422);
    return json({ data: await createStockDocument(db, auth.session, kind ? { ...raw, kind } : raw, request) }, 201);
  } catch (error) { return domainResponse(error); }
}; }
export function actionPOST(action?: string) { return async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const auth = await requirePermission("inventory.read", { scoped: true, request });
  if (!auth.ok) return json({ message: auth.message }, auth.status);
  try {
    const { id } = await context.params, raw = await request.json().catch(() => null);
    if (action && raw?.action && raw.action !== action) return json({ message: "Action tidak sesuai endpoint." }, 422);
    return json({ data: await actStockDocument(db, auth.session, id, action ? { ...raw, action } : raw, request) });
  } catch (error) { return domainResponse(error); }
}; }
export async function periodPOST(request: Request) {
  const auth = await requirePermission("inventory.read", { scoped: true, request });
  if (!auth.ok) return json({ message: auth.message }, auth.status);
  try { return json({ data: await actStockPeriod(db, auth.session, await request.json().catch(() => null), request) }); } catch (error) { return domainResponse(error); }
}
