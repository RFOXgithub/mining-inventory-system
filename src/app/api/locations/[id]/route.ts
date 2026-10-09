import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse } from "@/lib/domain-error";
import { changeLocation } from "@/features/masters/locations-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const raw = await request.json().catch(() => null), action = raw?.action;
  const auth = await requirePermission(`master.location.${action === "verify" ? "verify" : action === "deactivate" ? "deactivate" : "update"}`, { scoped: true, request });
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try { return NextResponse.json({ data: await changeLocation(db, auth.session, "location", (await params).id, raw, request) }); }
  catch (error) { return domainResponse(error); }
}
