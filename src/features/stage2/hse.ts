import { PrismaClient } from "@prisma/client";
import { AccessActor } from "@/lib/access";
import { atomic, periodOpen } from "@/features/inventory/ledger-service";
import { actionSchema, followupSchema, saveExamSchema } from "./schema";
import { allow, digest, fail, peer, plant, stamp, worker } from "./common";
import { bindFiles } from "./files";
export async function saveExam(db: PrismaClient, actor: AccessActor, body: unknown, id?: string) {
  const a = saveExamSchema.parse(body), p = a.payload;
  return atomic(db, async tx => {
    await plant(tx, actor, "health.manage", p.plantId); await worker(tx, p.workerId, p.plantId, new Date(p.examAt));
    allow(actor, "health.read", p.plantId);
    if (new Date(p.examAt) > new Date()) fail("Pemeriksaan harus memakai tanggal aktual.", 422);
    const hash = digest(p), old = id ? await tx.medicalExam.findUnique({ where: { id } }) : await tx.medicalExam.findUnique({ where: { requestKey: p.requestKey } });
    if (id && !old) fail("Pemeriksaan tidak ditemukan.", 404);
    if (old) {
      if (old.makerId !== actor.userId || old.plantId !== p.plantId || old.requestKey !== p.requestKey || old.kind !== p.kind || old.workerId !== p.workerId) fail("Identitas/pembuat pemeriksaan tidak sesuai.", 403);
      if (old.hash === hash && (!id || a.version === old.version || a.version === old.version - 1)) return old;
      if (!id || old.version !== a.version || old.status !== "DRAFT") fail("Versi pemeriksaan berubah/sudah disubmit.");
    } else if (a.version !== 0) fail("Versi baru harus nol.", 422);
    const data = { ...p, hash, examAt: new Date(p.examAt), validUntil: new Date(p.validUntil) };
    const row = old ? await tx.medicalExam.update({ where: { id: old.id }, data: { ...data, version: { increment: 1 } } }) : await tx.medicalExam.create({ data: { ...data, makerId: actor.userId } });
    await bindFiles(tx, actor, p.fileIds, p.plantId, "MEDICAL", row.id);
    // Global audit contains action metadata only, never medical values or notes.
    await stamp(tx, actor, "HEALTH", old ? "UPDATE" : "CREATE", row.id, { kind: row.kind, status: row.status }); return row;
  });
}
export async function actExam(db: PrismaClient, actor: AccessActor, id: string, body: unknown) {
  const a = actionSchema.parse(body);
  return atomic(db, async tx => {
    const row = await tx.medicalExam.findUnique({ where: { id } }); if (!row) fail("Pemeriksaan tidak ditemukan.", 404);
    await plant(tx, actor, a.action === "submit" ? "health.manage" : "health.verify", row.plantId);
    allow(actor, "health.read", row.plantId);
    if (a.action === "submit" && actor.userId !== row.makerId) fail("Hanya pembuat dapat submit.", 403);
    if (["verify", "reject"].includes(a.action)) peer(actor, row.makerId);
    const target = ({ submit: "SUBMITTED", verify: "VERIFIED", reject: "REJECTED" } as Record<string, string>)[a.action]; if (!target) fail("Action pemeriksaan tidak valid.", 422);
    if (row.status === target && row.version === a.version + 1) return row;
    if (row.version !== a.version || row.status !== (a.action === "submit" ? "DRAFT" : "SUBMITTED")) fail("Versi/status pemeriksaan berubah.");
    await worker(tx, row.workerId, row.plantId, row.examAt);
    const next = await tx.medicalExam.update({ where: { id }, data: { status: target, version: { increment: 1 }, ...(a.action === "verify" ? { verifiedBy: actor.userId } : {}) } });
    await stamp(tx, actor, "HEALTH", a.action.toUpperCase(), id, { kind: row.kind, status: next.status }); return next;
  });
}
export async function saveFollowup(db: PrismaClient, actor: AccessActor, body: unknown) {
  const a = followupSchema.parse(body);
  return atomic(db, async tx => {
    const finding = await tx.inspectionFinding.findUnique({ where: { id: a.findingId } }); if (!finding) fail("Temuan tidak ditemukan.", 404);
    await plant(tx, actor, "inspection.followup", finding.plantId); await worker(tx, finding.picId, finding.plantId, new Date(a.actualAt));
    if (new Date(a.actualAt) > new Date()) fail("Follow-up harus memakai tanggal aktual.", 422);
    const hash = digest(a), old = await tx.findingFollowup.findUnique({ where: { requestKey: a.requestKey } }); if (old) { if (old.hash !== hash || old.makerId !== actor.userId) fail("UUID follow-up berbeda."); return old; }
    if (finding.status !== "OPEN") fail("Temuan sudah selesai.");
    await periodOpen(tx, finding.plantId, new Date(a.actualAt));
    const row = await tx.findingFollowup.create({ data: { ...a, actualAt: new Date(a.actualAt), plantId: finding.plantId, hash, makerId: actor.userId } });
    await bindFiles(tx, actor, a.fileIds, finding.plantId, "INSPECTION", row.id); await stamp(tx, actor, "FOLLOWUP", "SUBMIT", row.id); return row;
  });
}
export async function actFollowup(db: PrismaClient, actor: AccessActor, id: string, body: unknown) {
  const a = actionSchema.parse(body);
  return atomic(db, async tx => {
    const row = await tx.findingFollowup.findUnique({ where: { id } }); if (!row) fail("Follow-up tidak ditemukan.", 404);
    await plant(tx, actor, "inspection.verify", row.plantId); peer(actor, row.makerId);
    if (!["verify", "reject"].includes(a.action)) fail("Action follow-up tidak valid.", 422);
    const target = a.action === "verify" ? "VERIFIED" : "REJECTED";
    if (row.status === target && row.version === a.version + 1) return row;
    if (row.status !== "SUBMITTED" || row.version !== a.version) fail("Versi/status follow-up berubah.");
    await periodOpen(tx, row.plantId, row.actualAt);
    if (a.action === "verify") {
      const finding = await tx.inspectionFinding.findUniqueOrThrow({ where: { id: row.findingId } }); if (finding.status !== "OPEN") fail("Temuan sudah diselesaikan follow-up lain.");
      await tx.inspectionFinding.update({ where: { id: finding.id }, data: { status: "RESOLVED", resolvedBy: actor.userId, version: { increment: 1 } } });
    }
    const next = await tx.findingFollowup.update({ where: { id }, data: { status: target, verifiedBy: actor.userId, version: { increment: 1 } } }); await stamp(tx, actor, "FOLLOWUP", a.action.toUpperCase(), id, { reason: a.reason }); return next;
  });
}
