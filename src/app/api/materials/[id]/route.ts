import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse } from "@/lib/domain-error";
import { serialize } from "@/lib/api";
import { changeMaterial } from "@/features/masters/service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const raw = await request.json().catch(() => null), action = raw?.action;
  const auth = await requirePermission(`master.material.${action === "verify" ? "verify" : action === "deactivate" ? "deactivate" : "update"}`, { scoped: true, request });
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try { return NextResponse.json(serialize({ data: await changeMaterial(db, auth.session, (await params).id, raw, request) })); }
  catch (error) { return domainResponse(error); }
}
