import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { allowedActions, FINAL_ROLES } from "@/lib/access";
import { domainResponse } from "@/lib/domain-error";
import { pageParams } from "@/lib/api";
import { createUser } from "@/features/access/service";

export async function GET(request: Request) {
  const auth = await requirePermission("users.manage");
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const { u, page, pageSize, skip } = pageParams(request), q = (u.searchParams.get("q") ?? "").slice(0, 100);
    const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {};
    const [rows, total, plants] = await Promise.all([
      db.user.findMany({ where, select: { id: true, name: true, email: true, status: true, sessionVersion: true, functions: true, actionPermissions: true, allPlants: true, plantScopes: true, roles: { include: { role: { select: { code: true } } } } }, skip, take: pageSize, orderBy: { name: "asc" } }),
      db.user.count({ where }), db.plant.findMany({ where: { active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({ data: rows, plants, meta: { page, pageSize, total }, matrix: FINAL_ROLES.map(role => ({ role, PC: allowedActions(role, ["PC"]), FINANCE: allowedActions(role, ["FINANCE"]), BOTH: allowedActions(role, ["PC", "FINANCE"]) })) });
  } catch (error) { return domainResponse(error); }
}

export async function POST(request: Request) {
  const auth = await requirePermission("users.manage", { request });
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try { return NextResponse.json({ data: await createUser(db, auth.session, await request.json().catch(() => null), request) }, { status: 201 }); }
  catch (error) { return domainResponse(error); }
}
