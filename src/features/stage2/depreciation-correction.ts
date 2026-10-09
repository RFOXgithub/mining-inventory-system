import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor } from "@/lib/access";
import { z } from "zod";
import { atomic, periodOpen } from "@/features/inventory/ledger-service";
import { actionSchema, ConfigInput } from "./schema";
import { digest, fail, peer, plant, stamp, Tx } from "./common";
const input = z.object({ requestKey: z.string().uuid(), targetId: z.string().uuid(), effectiveAt: z.string().datetime({ offset: true }), amount: z.string().regex(/^-?\d{1,18}(\.\d{1,6})?$/).refine(v => /[1-9]/.test(v)), reason: z.string().trim().min(5).max(3000) }).strict();
async function correctionBasis(tx: Tx, targetId: string, amount: Prisma.Decimal, at: Date) {
  const target = await tx.assetDepreciation.findUnique({ where: { id: targetId } }); if (!target || target.status !== "POSTED") fail("Sumber koreksi harus depresiasi posted.", 422);
  const source = await tx.depreciationEvent.findUniqueOrThrow({ where: { sourceId: target.id } });
  if (at < source.effectiveAt || at > new Date()) fail("Tanggal koreksi harus aktual dan setelah posting sumber.", 422);
  await periodOpen(tx, target.plantId, source.effectiveAt); await periodOpen(tx, target.plantId, at);
  if (amount.abs().gt(target.amount)) fail("Koreksi tidak boleh melebihi nominal depresiasi sumber.", 422);
  if (await tx.assetDepreciation.count({ where: { assetId: target.assetId, status: { in: ["DRAFT", "SUBMITTED", "VERIFIED"] } } })) fail("Selesaikan batch depresiasi pending sebelum koreksi.");
  if (await tx.depreciationEvent.count({ where: { assetId: target.assetId, effectiveAt: { gt: at } } })) fail("Ada event aset setelah tanggal koreksi. Gunakan tanggal aktual yang lebih baru.");
  if (await tx.depreciationCorrection.count({ where: { targetId, status: "POSTED" } })) fail("Sumber sudah mempunyai koreksi efektif.");
  const config = await tx.stageConfig.findFirst({ where: { kind: "ASSET_FINANCE", subjectId: target.assetId, status: "VERIFIED", effectiveFrom: { lte: at } }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }] }); if (!config) fail("Parameter keuangan belum verified.");
  const p = config.payload as Extract<ConfigInput["payload"], { kind: "ASSET_FINANCE" }>, sum = await tx.depreciationEvent.aggregate({ where: { assetId: target.assetId }, _sum: { amount: true } });
  const accumulated = new Prisma.Decimal(p.openingAccumulated).plus(sum._sum.amount ?? 0), after = accumulated.plus(amount);
  if (after.lt(0) || after.gt(new Prisma.Decimal(p.cost).minus(p.residual))) fail("Adjustment melewati batas harga perolehan/nilai residu.", 422);
  return { target, snapshot: { targetId, assetId: target.assetId, configId: config.id, originalEventId: source.id, accumulatedBefore: accumulated.toString(), accumulatedAfter: after.toString(), amount: amount.toString(), currency: p.currency } };
}
export async function createDepreciationCorrection(db: PrismaClient, actor: AccessActor, body: unknown) {
  const p = input.parse(body);
  return atomic(db, async tx => {
    const target = await tx.assetDepreciation.findUnique({ where: { id: p.targetId } }); if (!target) fail("Sumber tidak ditemukan.", 404); await plant(tx, actor, "asset.depreciation.correct", target.plantId);
    const hash = digest(p), old = await tx.depreciationCorrection.findUnique({ where: { requestKey: p.requestKey } }); if (old) { if (old.hash !== hash || old.makerId !== actor.userId) fail("UUID koreksi sudah digunakan."); return old; }
    const b = await correctionBasis(tx, p.targetId, new Prisma.Decimal(p.amount), new Date(p.effectiveAt));
    const row = await tx.depreciationCorrection.create({ data: { ...p, effectiveAt: new Date(p.effectiveAt), plantId: target.plantId, assetId: target.assetId, snapshot: b.snapshot, hash, makerId: actor.userId } }); await stamp(tx, actor, "DEPRECIATION_CORRECTION", "CREATE", row.id, { targetId: target.id, reason: p.reason }); return row;
  });
}
export async function actDepreciationCorrection(db: PrismaClient, actor: AccessActor, id: string, body: unknown) {
  const a = actionSchema.parse(body);
  return atomic(db, async tx => {
    const row = await tx.depreciationCorrection.findUnique({ where: { id } }); if (!row) fail("Koreksi tidak ditemukan.", 404);
    const ownDraft = row.status === "DRAFT" && row.makerId === actor.userId, p = a.action === "submit" || a.action === "reject" && ownDraft ? "asset.depreciation.correct" : "asset.depreciation.correction.approve";
    await plant(tx, actor, p, row.plantId);
    if (a.action === "submit" && row.makerId !== actor.userId) fail("Hanya pembuat dapat submit.", 403);
    const target = a.action === "submit" ? "SUBMITTED" : a.action === "post" ? "POSTED" : a.action === "reject" ? "REJECTED" : null; if (!target) fail("Action koreksi tidak valid.", 422);
    if (!ownDraft) peer(actor, row.makerId);
    if (row.status === target && row.version === a.version + 1) return row;
    if (row.version !== a.version || a.action === "submit" && row.status !== "DRAFT" || a.action === "post" && row.status !== "SUBMITTED" || a.action === "reject" && !["DRAFT", "SUBMITTED"].includes(row.status)) fail("Versi/status koreksi berubah.");
    if (a.action !== "reject") {
      const b = await correctionBasis(tx, row.targetId, row.amount, row.effectiveAt); if (digest(b.snapshot) !== digest(row.snapshot)) fail("Saldo/config berubah setelah request. Tolak request dan rekonsiliasi ulang.");
      if (a.action === "post") { peer(actor, b.target.makerId); if (b.target.verifiedBy) peer(actor, b.target.verifiedBy); if (b.target.postedBy) peer(actor, b.target.postedBy); await tx.depreciationEvent.create({ data: { correctionId: id, plantId: row.plantId, assetId: row.assetId, amount: row.amount, effectiveAt: row.effectiveAt, actorId: actor.userId } }); }
    }
    const next = await tx.depreciationCorrection.update({ where: { id }, data: { status: target, version: { increment: 1 }, ...(a.action === "post" ? { approvedBy: actor.userId } : {}) } }); await stamp(tx, actor, "DEPRECIATION_CORRECTION", a.action.toUpperCase(), id, { targetId: row.targetId, reason: a.reason, amount: row.amount.toString() }); return next;
  });
}
