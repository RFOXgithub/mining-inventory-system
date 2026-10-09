import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor } from "@/lib/access";
import { atomic, jakartaMonth } from "@/features/inventory/ledger-service";
import { configSchema, configActionSchema, ConfigInput } from "./schema";
import { allow, configPermission, digest, fail, peer, plant, stamp, Tx, verified } from "./common";
import { bindFiles } from "./files";
export async function validateConfig(tx: Tx, data: ConfigInput) {
  const p = data.payload, at = new Date(data.effectiveFrom);
  if (p.kind === "LETTER_TYPE") {
    const issued = await tx.stageRecord.count({ where: { kind: { in: ["LETTER", "BUNDLE"] }, number: { not: null }, configId: { in: (await tx.stageConfig.findMany({ where: { plantId: data.plantId, kind: "LETTER_TYPE", code: data.code }, select: { id: true } })).map(c => c.id) } } });
    const prior = await tx.stageConfig.findFirst({ where: { plantId: data.plantId, kind: "LETTER_TYPE", code: data.code, status: "VERIFIED" }, orderBy: { revision: "desc" } });
    if (issued && prior) { const q = prior.payload as typeof p; if (["scope", "reset", "start"].some(k => q[k as keyof typeof q] !== p[k as keyof typeof p])) fail("Deret issued tidak boleh direset atau diganti cakupannya.", 422); }
    if (p.scope === "GLOBAL") {
      const global = await tx.stageConfig.findMany({ where: { kind: "LETTER_TYPE", status: "VERIFIED" } });
      if (global.some(c => { const q = c.payload as typeof p; return q.scope === "GLOBAL" && (q.reset !== p.reset || q.start !== p.start); })) fail("Deret global harus memakai aturan reset dan nomor awal yang sama.", 422);
    }
  }
  if (p.kind === "ASSET") {
    if (p.legacyEquipmentId && !await tx.equipment.findUnique({ where: { id: p.legacyEquipmentId } })) fail("Equipment sumber tidak ditemukan.", 422);
    for (const [id, kind, model] of [[p.operationalAssetId, "ASSET", "operational"], [p.vehicleId, "VEHICLE", "commerce"]] as const) if (id) {
      const c = model === "operational" ? await tx.operationalConfig.findUnique({ where: { id } }) : await tx.commerceConfig.findUnique({ where: { id } });
      if (!c || c.kind !== kind || c.plantId !== data.plantId || c.verificationStatus !== "VERIFIED" || c.effectiveFrom > at) fail("Mapping alat/kendaraan harus verified dan sesuai plant.", 422);
    }
    const assets = await tx.stageConfig.findMany({ where: { plantId: data.plantId, kind: "ASSET", status: "VERIFIED", code: { not: data.code } } });
    if (assets.some(a => { const q = a.payload as Extract<ConfigInput["payload"], { kind: "ASSET" }>; return q.identity.toLowerCase() === p.identity.toLowerCase() || ["plate", "serial", "chassis", "legacyEquipmentId", "operationalAssetId", "vehicleId"].some(k => !!p[k as keyof typeof p] && p[k as keyof typeof p] === q[k as keyof typeof q]); })) fail("Identitas/mapping aset sudah terdaftar. Verifikasi konflik sebelum membuat aset baru.", 422);
  }
  if (p.kind === "WORKER" && p.userId) { const u = await tx.user.findUnique({ where: { id: p.userId } }); if (!u?.active) fail("Akun PIC tidak aktif.", 422); }
  if (p.kind !== "ASSET_FINANCE") return;
  const asset = await tx.stageConfig.findFirst({ where: { rootId: p.assetId, kind: "ASSET", plantId: data.plantId, status: "VERIFIED", effectiveFrom: { lte: at } }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }] });
  if (!asset || (asset.payload as { ownership: string }).ownership !== "OWNED") fail("Parameter depresiasi hanya untuk aset milik sendiri yang verified.", 422);
  const cost = new Prisma.Decimal(p.cost), residual = new Prisma.Decimal(p.residual), opening = new Prisma.Decimal(p.openingAccumulated);
  if (residual.gt(cost) || opening.gt(cost.minus(residual))) fail("Nilai residu/akumulasi melewati harga perolehan.", 422);
  const parsed = new Date(`${p.startDate}T00:00:00+07:00`); if (Number.isNaN(parsed.getTime()) || new Date(parsed.getTime() + 7 * 3600000).toISOString().slice(0, 10) !== p.startDate || p.openingMonth < p.startDate.slice(0, 7)) fail("Tanggal mulai/cutoff akumulasi tidak valid.", 422);
  const previous = await tx.stageConfig.findFirst({ where: { kind: "ASSET_FINANCE", subjectId: p.assetId, status: "VERIFIED" }, orderBy: { revision: "desc" } });
  if (previous && previous.code !== data.code) fail("Gunakan kode versi parameter yang sama untuk aset ini.", 422);
  if (previous) {
    if (at <= previous.effectiveFrom) fail("Versi baru harus efektif setelah versi sebelumnya.", 422);
    const posted = await tx.assetDepreciation.findFirst({ where: { assetId: p.assetId, status: "POSTED" }, orderBy: { month: "desc" } });
    if (posted) {
      const old = previous.payload as typeof p;
      if (["cost", "openingAccumulated", "openingMonth", "currency", "startDate", "firstMonth"].some(k => old[k as keyof typeof old] !== p[k as keyof typeof p]) || jakartaMonth(at) <= posted.month) fail("Versi baru tidak boleh mengubah basis/saldo awal atau periode yang sudah posted.", 422);
      const events = await tx.depreciationEvent.aggregate({ where: { assetId: p.assetId }, _sum: { amount: true } });
      if (new Prisma.Decimal(p.openingAccumulated).plus(events._sum.amount ?? 0).gt(cost.minus(residual))) fail("Residu baru melewati nilai buku aktual.", 422);
    }
    if (await tx.assetDepreciation.count({ where: { assetId: p.assetId, month: { gte: jakartaMonth(at) }, status: { not: "POSTED" } } })) fail("Selesaikan draft depresiasi sebelum mengganti parameter efektif.");
  }
}
export async function createConfig(db: PrismaClient, actor: AccessActor, body: unknown) {
  const data = configSchema.parse(body), p = data.payload;
  return atomic(db, async tx => {
    await plant(tx, actor, configPermission(p.kind, "create"), data.plantId);
    const hash = digest(data), old = await tx.stageConfig.findUnique({ where: { requestKey: data.requestKey } });
    if (old) { if (old.hash !== hash || old.makerId !== actor.userId) fail("UUID sudah digunakan untuk parameter berbeda."); return old; }
    const previous = await tx.stageConfig.findFirst({ where: { plantId: data.plantId, kind: p.kind, code: data.code }, orderBy: { revision: "desc" } });
    if (data.revision !== (previous?.revision ?? 0) + 1 || previous && previous.status !== "VERIFIED") fail("Revisi harus berurutan setelah versi verified.", 422);
    if (previous && p.kind === "ASSET_FINANCE" && previous.subjectId !== p.assetId) fail("Versi parameter tidak boleh berpindah aset.", 422);
    await validateConfig(tx, data);
    const id = randomUUID(), row = await tx.stageConfig.create({ data: { id, requestKey: data.requestKey, plantId: data.plantId, kind: p.kind, code: data.code, revision: data.revision, rootId: previous?.rootId ?? id, subjectId: p.kind === "ASSET_FINANCE" ? p.assetId : null, effectiveFrom: new Date(data.effectiveFrom), payload: p, hash, evidence: data.evidence, makerId: actor.userId } });
    if (p.kind === "ASSET") await bindFiles(tx, actor, p.fileIds, data.plantId, "ASSET", row.rootId);
    await stamp(tx, actor, "STAGE_CONFIG", "CREATE", id, { kind: p.kind, revision: row.revision }); return row;
  });
}
export async function actConfig(db: PrismaClient, actor: AccessActor, id: string, body: unknown) {
  const data = configActionSchema.parse(body);
  return atomic(db, async tx => {
    const row = await tx.stageConfig.findUnique({ where: { id } }); if (!row) fail("Parameter tidak ditemukan.", 404);
    await plant(tx, actor, data.action === "attest" ? "asset.finance.attest" : configPermission(row.kind, "verify"), row.plantId); peer(actor, row.makerId);
    if (data.action === "attest") {
      if (row.kind !== "ASSET_FINANCE") fail("Attest hanya untuk parameter keuangan aset.", 422);
      if (row.attestedBy === actor.userId) return row;
      if (row.status !== "DRAFT" || row.attestedBy) fail("Parameter sudah diproses.");
      const next = await tx.stageConfig.update({ where: { id }, data: { attestedBy: actor.userId } }); await stamp(tx, actor, "STAGE_CONFIG", "ATTEST", id, { evidence: data.evidence }); return next;
    }
    if (row.status === "VERIFIED") return row;
    if (row.kind === "ASSET_FINANCE" && (!row.attestedBy || row.attestedBy === actor.userId)) fail("Diperlukan attest Finance terpisah sebelum verifikasi Manager.");
    await validateConfig(tx, { requestKey: row.requestKey, plantId: row.plantId, code: row.code, revision: row.revision, effectiveFrom: row.effectiveFrom.toISOString(), evidence: row.evidence, payload: row.payload as ConfigInput["payload"] });
    const next = await tx.stageConfig.update({ where: { id }, data: { status: "VERIFIED", verifiedBy: actor.userId } }); await stamp(tx, actor, "STAGE_CONFIG", "VERIFY", id, { evidence: data.evidence }); return next;
  });
}
