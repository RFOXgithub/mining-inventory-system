import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { domainResponse } from "@/lib/domain-error";
import { updateUser } from "@/features/access/service";
import { idSchema } from "@/features/masters/schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("users.manage", { request });
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try { const { id } = await params; return NextResponse.json({ data: await updateUser(db, auth.session, idSchema.parse(id), await request.json().catch(() => null), request) }); }
  catch (error) { return domainResponse(error); }
}
