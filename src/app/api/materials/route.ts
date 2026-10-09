import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse } from "@/lib/domain-error";
import { pageParams, serialize } from "@/lib/api";
import { createMaterial, materialInclude } from "@/features/masters/service";

export async function GET(request: Request) {
  const auth = await requirePermission("master.material.read", { scoped: true });
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const { u, page, pageSize, skip } = pageParams(request), q = (u.searchParams.get("q") ?? "").slice(0, 100);
    const where = { ...(auth.session.allPlants ? {} : { plants: { some: { plantId: { in: auth.session.plantIds } } } }), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }, { aliases: { some: { name: { contains: q, mode: "insensitive" as const } } } }] } : {}) };
    const [data, total, plants, uoms] = await Promise.all([db.catalogItem.findMany({ where, include: materialInclude, orderBy: { name: "asc" }, skip, take: pageSize }), db.catalogItem.count({ where }), db.plant.findMany({ where: { active: true, ...(auth.session.allPlants ? {} : { id: { in: auth.session.plantIds } }) }, select: { id: true, name: true, verificationStatus: true } }), db.uom.findMany({ where: { active: true }, orderBy: { code: "asc" } })]);
    return NextResponse.json(JSON.parse(JSON.stringify({ data, meta: { page, pageSize, total }, plants, uoms })));
  } catch (error) { return domainResponse(error); }
}

export async function POST(request: Request) {
  const auth = await requirePermission("master.material.create", { scoped: true, request });
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try { return NextResponse.json(serialize({ data: await createMaterial(db, auth.session, await request.json().catch(() => null), request) }), { status: 201 }); }
  catch (error) { return domainResponse(error); }
}
