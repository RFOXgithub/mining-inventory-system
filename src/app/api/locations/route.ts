import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse } from "@/lib/domain-error";
import { createLocation } from "@/features/masters/locations-service";

export async function POST(request: Request) {
  const auth = await requirePermission("master.location.create", { scoped: true, request });
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try { return NextResponse.json({ data: await createLocation(db, auth.session, await request.json().catch(() => null), request) }, { status: 201 }); }
  catch (error) { return domainResponse(error); }
}
