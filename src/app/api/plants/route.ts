import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { plantFilter } from "@/lib/access";
import { domainResponse } from "@/lib/domain-error";
import { createPlant } from "@/features/masters/locations-service";

export async function GET() {
  const auth = await requirePermission("master.location.read", { scoped: true });
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try { return NextResponse.json({ data: await db.plant.findMany({ where: plantFilter(auth.session), include: { locations: { orderBy: { name: "asc" } } }, orderBy: { name: "asc" } }), stockpiles: auth.session.allPlants ? await db.stockpile.findMany({ where: { locationMaster: null, status: { not: "INACTIVE" } }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }) : [] }); }
  catch (error) { return domainResponse(error); }
}

export async function POST(request: Request) {
  const auth = await requirePermission("master.location.create", { scoped: true, request });
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try { return NextResponse.json({ data: await createPlant(db, auth.session, await request.json().catch(() => null), request) }, { status: 201 }); }
  catch (error) { return domainResponse(error); }
}
