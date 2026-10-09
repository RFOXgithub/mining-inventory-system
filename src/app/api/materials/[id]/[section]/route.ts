import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse } from "@/lib/domain-error";
import { serialize } from "@/lib/api";
import { changeMaterialChild } from "@/features/masters/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; section: string }> }) {
  const raw = await request.json().catch(() => null);
  const auth = await requirePermission(`master.material.${raw?.action === "verify" ? "verify" : "update"}`, { scoped: true, request });
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try { const { id, section } = await params; return NextResponse.json(JSON.parse(JSON.stringify({ data: await changeMaterialChild(db, auth.session, id, section, raw, request) })), { status: 201 }); }
  catch (error) { return domainResponse(error); }
}
