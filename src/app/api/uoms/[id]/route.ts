import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse, DomainError } from "@/lib/domain-error";
import { childVerifySchema, idSchema } from "@/features/masters/schema";
import { assertVerifier } from "@/features/masters/service";
import { writeAudit } from "@/lib/audit";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("master.material.verify", { scoped: true, request });
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const id = idSchema.parse((await params).id);
    const input = childVerifySchema.parse({ ...await request.json().catch(() => null), id });
    if (!auth.session.allPlants) throw new DomainError(403, "Verifikasi UOM bersama memerlukan cakupan semua plant.");
    return NextResponse.json({ data: await db.$transaction(async tx => {
      const row = await tx.uom.findUnique({ where: { id } });
      if (!row) throw new DomainError(404, "UOM tidak ditemukan.");
      assertVerifier(auth.session, "master.material.verify", row, []);
      if (!row.active || row.dimension === "UNKNOWN") throw new DomainError(422, "Dimensi UOM harus diketahui sebelum verifikasi.");
      const updated = await tx.uom.updateMany({ where: { id, verificationStatus: "UNVERIFIED" }, data: { verificationStatus: "VERIFIED", evidence: input.evidence, verifiedBy: auth.session.userId } });
      if (!updated.count) throw new DomainError(409, "UOM sudah terverifikasi.");
      await writeAudit(tx, { userId: auth.session.userId, module: "MASTER_UOM", action: "VERIFY", recordId: id, newValue: { evidence: input.evidence }, request });
      return { id, verificationStatus: "VERIFIED" };
    }) });
  } catch (error) { return domainResponse(error); }
}
