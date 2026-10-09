import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor } from "@/lib/access";
import { atomic, jakartaMonth, periodOpen } from "@/features/inventory/ledger-service";
import { actionSchema, ConfigInput, monthSchema } from "./schema";
import { allow, digest, fail, peer, plant, stamp, Tx } from "./common";
type Finance = Extract<ConfigInput["payload"], { kind: "ASSET_FINANCE" }>;
const D = Prisma.Decimal;
export function monthEnd(month: string) { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 1) - 7 * 3600000 - 1); }
export function nextMonth(month: string) { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); }
export function depreciationAmount(p: Finance, month: string, accumulated: Prisma.Decimal) {
  const cost = new D(p.cost), residual = new D(p.residual), remaining = cost.minus(residual).minus(accumulated);
  if (remaining.lt(0)) fail("Saldo buku di bawah residu.", 422);
  let rate = cost.minus(residual).div(p.lifeMonths);
  const startMonth = p.startDate.slice(0, 7);
  if (month < p.openingMonth || month < startMonth || p.firstMonth === "NEXT_MONTH" && month === startMonth) rate = new D(0);
  if (month === startMonth && p.firstMonth === "DAILY_ACTUAL") {
    const [y, m, day] = p.startDate.split("-").map(Number), days = new Date(Date.UTC(y, m, 0)).getUTCDate(); rate = rate.mul(days - day + 1).div(days);
  }
  const amount = D.min(rate.toDecimalPlaces(p.decimals, D.ROUND_HALF_UP), remaining);
  return { amount, bookBefore: cost.minus(accumulated), bookAfter: cost.minus(accumulated).minus(amount) };
}
async function basis(tx: Tx, assetId: string, plantId: string, month: string) {
  const at = monthEnd(month), physical = await tx.stageConfig.findFirst({ where: { rootId: assetId, plantId, kind: "ASSET", status: "VERIFIED", effectiveFrom: { lte: at } }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }] });
  if (!physical || (physical.payload as { ownership: string }).ownership !== "OWNED") fail("Aset sewa/tidak verified tidak didepresiasi.", 422);
  const config = await tx.stageConfig.findFirst({ where: { subjectId: assetId, plantId, kind: "ASSET_FINANCE", status: "VERIFIED", effectiveFrom: { lte: at } }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }] });
  if (!config) fail("Parameter aset belum verified.", 422);
  const p = config.payload as Finance;
  if (await tx.depreciationCorrection.count({ where: { assetId, status: { in: ["DRAFT", "SUBMITTED"] } } })) fail("Selesaikan request koreksi aset sebelum batch depresiasi berikutnya.");
  const first = p.firstMonth === "NEXT_MONTH" ? nextMonth(p.startDate.slice(0, 7)) : p.startDate.slice(0, 7), expectedStart = first > p.openingMonth ? first : p.openingMonth;
  if (month < expectedStart) fail("Periode sebelum awal depresiasi/cutoff.", 422);
  const prior = await tx.assetDepreciation.findFirst({ where: { assetId, month: { lt: month }, status: "POSTED" }, orderBy: { month: "desc" } });
  if (month !== (prior ? nextMonth(prior.month) : expectedStart)) fail("Posting/generasi depresiasi harus berurutan tanpa periode terlewat.");
  if (await tx.assetDepreciation.count({ where: { assetId, month: { gt: month }, status: "POSTED" } })) fail("Periode berikutnya sudah posted.");
  const events = await tx.depreciationEvent.aggregate({ where: { assetId }, _sum: { amount: true } }), accumulated = new D(p.openingAccumulated).plus(events._sum.amount ?? 0);
  const values = depreciationAmount(p, month, accumulated);
  return { config, p, values, snapshot: { configId: config.id, parameters: p, accumulated: accumulated.toString(), amount: values.amount.toString(), bookBefore: values.bookBefore.toString(), bookAfter: values.bookAfter.toString() } };
}
export async function generateDepreciation(db: PrismaClient, actor: AccessActor, plantId: string, rawMonth: unknown) {
  const month = monthSchema.parse(rawMonth);
  return atomic(db, async tx => {
    await plant(tx, actor, "asset.depreciation.generate", plantId);
    allow(actor, "asset.finance.read", plantId);
    if (month > jakartaMonth(new Date())) fail("Periode depresiasi di masa depan.", 422);
    await periodOpen(tx, plantId, monthEnd(month));
    const assets = await tx.stageConfig.findMany({ where: { kind: "ASSET", plantId, status: "VERIFIED", effectiveFrom: { lte: monthEnd(month) } }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }] }), seen = new Set<string>(), rows = [], exceptions = [];
    for (const asset of assets) {
      if (seen.has(asset.rootId)) continue; seen.add(asset.rootId);
      if ((asset.payload as { ownership: string }).ownership !== "OWNED") { exceptions.push({ assetId: asset.rootId, message: "RENTED: tidak didepresiasi" }); continue; }
      const old = await tx.assetDepreciation.findUnique({ where: { assetId_month: { assetId: asset.rootId, month } } }); if (old) { rows.push(old); continue; }
      let b; try { b = await basis(tx, asset.rootId, plantId, month); } catch (e) { if (e instanceof Error) { exceptions.push({ assetId: asset.rootId, message: e.message }); continue; } throw e; }
      if (b.values.amount.isZero()) { exceptions.push({ assetId: asset.rootId, message: "Nilai residu sudah tercapai / amount nol" }); continue; }
      const row = await tx.assetDepreciation.create({ data: { plantId, assetId: asset.rootId, configId: b.config.id, month, ...b.values, snapshot: b.snapshot, makerId: actor.userId } }); rows.push(row);
      await stamp(tx, actor, "DEPRECIATION", "GENERATE", row.id, { month, amount: row.amount.toString() });
    }
    return { rows, exceptions };
  });
}
export async function actDepreciation(db: PrismaClient, actor: AccessActor, id: string, body: unknown) {
  const a = actionSchema.parse(body);
  return atomic(db, async tx => {
    const row = await tx.assetDepreciation.findUnique({ where: { id } }); if (!row) fail("Depresiasi tidak ditemukan.", 404);
    const permission = a.action === "submit" ? "asset.depreciation.generate" : a.action === "verify" ? "asset.depreciation.verify" : "asset.depreciation.post";
    await plant(tx, actor, permission, row.plantId);
    allow(actor, "asset.finance.read", row.plantId);
    const target = ({ submit: "SUBMITTED", verify: "VERIFIED", post: "POSTED" } as Record<string, string>)[a.action]; if (!target) fail("Action depresiasi tidak valid.", 422);
    if (a.action === "submit" && actor.userId !== row.makerId) fail("Hanya pembuat dapat submit.", 403);
    if (a.action === "verify") { peer(actor, row.makerId); const param = await tx.stageConfig.findUniqueOrThrow({ where: { id: row.configId } }); peer(actor, param.makerId); }
    if (row.status === target && row.version === a.version + 1) return row;
    if (row.version !== a.version || row.status !== ({ submit: "DRAFT", verify: "SUBMITTED", post: "VERIFIED" } as Record<string, string>)[a.action]) fail("Versi/status depresiasi berubah.");
    await periodOpen(tx, row.plantId, monthEnd(row.month));
    if (a.action === "post" && monthEnd(row.month) > new Date()) fail("Posting bulanan menunggu akhir bulan aktual.", 422);
    const current = await basis(tx, row.assetId, row.plantId, row.month); if (digest(current.snapshot) !== digest(row.snapshot)) fail("Parameter/saldo buku berubah; draft harus direkonsiliasi sebelum diposting.");
    if (a.action === "post") await tx.depreciationEvent.create({ data: { sourceId: id, assetId: row.assetId, plantId: row.plantId, effectiveAt: monthEnd(row.month), amount: row.amount, actorId: actor.userId } });
    const next = await tx.assetDepreciation.update({ where: { id }, data: { status: target, version: { increment: 1 }, ...(a.action === "verify" ? { verifiedBy: actor.userId } : a.action === "post" ? { postedBy: actor.userId } : {}) } });
    await stamp(tx, actor, "DEPRECIATION", a.action.toUpperCase(), id, { reason: a.reason, month: row.month, amount: row.amount.toString() }); return next;
  });
}
