import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse, DomainError } from "@/lib/domain-error";
import { uomSchema } from "@/features/masters/schema";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requirePermission("master.material.read", { scoped: true });
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try { return NextResponse.json({ data: await db.uom.findMany({ where: { active: true }, orderBy: { code: "asc" } }) }); }
  catch (error) { return domainResponse(error); }
}

export async function POST(request: Request) {
  const auth = await requirePermission("master.material.create", { scoped: true, request });
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    if (!auth.session.allPlants) throw new DomainError(403, "UOM bersama memerlukan cakupan semua plant.");
    const input = uomSchema.parse(await request.json().catch(() => null));
    const row = await db.$transaction(async tx => {
      const row = await tx.uom.create({ data: { ...input, createdBy: auth.session.userId } });
      await writeAudit(tx, { userId: auth.session.userId, module: "MASTER_UOM", action: "CREATE", recordId: row.id, newValue: input, request });
      return row;
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (error) { return domainResponse(error); }
}
