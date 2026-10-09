import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse } from "@/lib/domain-error";
import { syncDraft } from "@/features/operations/sync";
export async function POST(request: Request) {
  let a = await requirePermission("production.read", { scoped: true, request }); if (!a.ok && a.status === 403) a = await requirePermission("fuel.read", { scoped: true, request }); if (!a.ok) return NextResponse.json({ message: a.message }, { status: a.status });
  try { return NextResponse.json({ data: await syncDraft(db, a.session, await request.json().catch(() => null), request) }); } catch (e) { return domainResponse(e); }
}
