import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor, can } from "@/lib/access";
import { atomic, periodOpen } from "@/features/inventory/ledger-service";
import { actionSchema, ConfigInput, RecordInput, saveSchema } from "./schema";
import { allow, digest, fail, peer, plant, stamp, Tx, verified, worker } from "./common";
import { bindFiles, documentAccess, sourcePermission } from "./files";

export async function recordSnapshot(tx: Tx, actor: AccessActor, p: RecordInput) {
  const at = new Date(p.effectiveAt), config = await verified(tx, p.configId, p.kind === "INSPECTION" ? "CHECKLIST" : "LETTER_TYPE", p.plantId, at);
  if (at > new Date()) fail("Tanggal aktual tidak boleh di masa depan.", 422);
  if (p.kind === "INSPECTION") {
    await periodOpen(tx, p.plantId, at);
    const location = await tx.plantLocation.findUnique({ where: { id: p.locationId } }); if (!location?.active || location.verificationStatus !== "VERIFIED" || location.plantId !== p.plantId) fail("Lokasi inspeksi harus aktif dan verified.", 422);
    await worker(tx, p.inspectorId, p.plantId, at);
    const policy = config.payload as Extract<ConfigInput["payload"], { kind: "CHECKLIST" }>;
    const keys = policy.checks.map(c => c.key);
    if (p.results.length !== keys.length || new Set(p.results.map(r => r.key)).size !== keys.length || p.results.some(r => !keys.includes(r.key)) || new Set(p.findings.map(r => r.key)).size !== p.findings.length) fail("Checklist harus lengkap dan key tidak duplikat.", 422);
    if (p.results.some(r => r.result === "FAIL" && !p.findings.some(f => f.key === r.key)) || p.findings.some(f => !p.results.some(r => r.key === f.key && r.result === "FAIL"))) fail("Setiap hasil gagal harus memiliki temuan/PIC/follow-up.", 422);
    for (const f of p.findings) { await worker(tx, f.picId, p.plantId, at); if (f.dueDate < p.effectiveAt.slice(0, 10) || Number.isNaN(Date.parse(f.dueDate))) fail("Tanggal target temuan tidak valid.", 422); }
    return { config: config.payload, configId: config.id, location: { id: location.id, name: location.name }, results: p.results, findings: p.findings };
  }
  const sources = [];
  if (new Set(p.sources.map(s => `${s.domain}:${s.id}`)).size !== p.sources.length) fail("Sumber bundle duplikat.", 422);
  for (const s of p.sources) {
    let permission = sourcePermission(s.domain); let row;
    if (s.domain === "INVENTORY") {
      const stock = await tx.stockDocument.findUnique({ where: { id: s.id }, include: { lines: { include: { location: { select: { plantId: true } }, destination: { select: { plantId: true } } } } } });
      if (!stock || stock.status !== "POSTED" || !stock.lines.length || stock.lines.some(l => l.location.plantId !== p.plantId || l.destination && l.destination.plantId !== p.plantId)) fail("Sumber inventory harus posted dan seluruh baris sesuai plant.", 422);
      row = { ...stock, plantId: p.plantId };
    } else if (s.domain === "OPERATIONS") { row = await tx.operationalRun.findUnique({ where: { id: s.id } }); if (row?.kind.startsWith("FUEL_")) permission = "fuel.read"; }
    else if (s.domain === "COMMERCE") row = await tx.commerceRecord.findUnique({ where: { id: s.id } });
    else row = await tx.financialRecord.findUnique({ where: { id: s.id } });
    allow(actor, permission, p.plantId);
    if (!row || row.plantId !== p.plantId || !["POSTED", "ISSUED", "VERIFIED", "APPROVED", "DISPATCHED", "COMPLETED"].includes(row.status)) fail("Sumber bundle belum disahkan atau berbeda plant.", 422);
    sources.push({ domain: s.domain, permission, id: row.id, number: row.number, status: row.status, kind: row.kind, effectiveAt: row.effectiveAt.toISOString(), version: row.version, snapshot: "snapshot" in row ? row.snapshot : "lines" in row ? row.lines.map(l => ({ lineNo: l.lineNo, itemName: l.itemName, uom: l.uomCode, quantity: l.quantity.toString() })) : null, hash: digest(row) });
  }
  return JSON.parse(JSON.stringify({ configId: config.id, config: config.payload, sources }));
}
export async function saveRecord(db: PrismaClient, actor: AccessActor, body: unknown, id?: string) {
  const data = saveSchema.parse(body), p = data.payload, permission = p.kind === "INSPECTION" ? "inspection.create" : "documents.create";
  return atomic(db, async tx => {
    await plant(tx, actor, permission, p.plantId);
    allow(actor, p.kind === "INSPECTION" ? "inspection.read" : "documents.read", p.plantId);
    const hash = digest(p), old = id ? await tx.stageRecord.findUnique({ where: { id } }) : await tx.stageRecord.findUnique({ where: { requestKey: p.requestKey } });
    if (id && !old) fail("Draft tidak ditemukan.", 404);
    if (old) {
      if (old.makerId !== actor.userId || old.requestKey !== p.requestKey || old.kind !== p.kind || old.plantId !== p.plantId) fail("Identitas/pembuat draft tidak sesuai.", 403);
      await documentAccess(tx, actor, old.id);
      if (old.hash === hash && (!id || data.version === old.version || data.version === old.version - 1)) return old;
      if (!id || old.version !== data.version || old.status !== "DRAFT") fail("Draft berubah atau sudah disubmit. Bandingkan versi server.");
    } else if (data.version !== 0) fail("Versi draft baru harus nol.", 422);
    const snapshot = await recordSnapshot(tx, actor, p);
    const row = old ? await tx.stageRecord.update({ where: { id: old.id }, data: { payload: p, snapshot, hash, configId: p.configId, effectiveAt: new Date(p.effectiveAt), version: { increment: 1 } } }) : await tx.stageRecord.create({ data: { requestKey: p.requestKey, plantId: p.plantId, kind: p.kind, effectiveAt: new Date(p.effectiveAt), configId: p.configId, payload: p, snapshot, hash, makerId: actor.userId } });
    await bindFiles(tx, actor, [...p.fileIds, ...(p.kind === "INSPECTION" ? p.findings.flatMap(f => f.fileIds) : [])], p.plantId, p.kind === "INSPECTION" ? "INSPECTION" : "DOCUMENT", row.id);
    await stamp(tx, actor, "STAGE_RECORD", old ? "UPDATE" : "CREATE", row.id, { kind: row.kind, version: row.version }); return row;
  });
}
export async function actRecord(db: PrismaClient, actor: AccessActor, id: string, body: unknown) {
  const a = actionSchema.parse(body);
  return atomic(db, async tx => {
    const row = await documentAccess(tx, actor, id), p = row.payload as RecordInput, inspection = p.kind === "INSPECTION";
    const permission = a.action === "submit" ? inspection ? "inspection.create" : "documents.create" : a.action === "verify" || a.action === "reject" ? inspection ? "inspection.verify" : "documents.approve" : a.action === "issue" ? "documents.issue" : a.action === "request-cancel" ? "documents.cancel.request" : "documents.cancel.approve";
    await plant(tx, actor, permission, row.plantId);
    if (["verify", "reject", "cancel"].includes(a.action)) peer(actor, row.makerId);
    if (a.action === "submit" && actor.userId !== row.makerId) fail("Hanya pembuat dapat submit.", 403);
    const target = ({ submit: "SUBMITTED", verify: "VERIFIED", issue: "ISSUED", reject: "REJECTED", cancel: "CANCELLED" } as Record<string, string>)[a.action];
    if (row.status === target && row.version === a.version + 1 || a.action === "request-cancel" && row.cancelRequestedBy === actor.userId && row.version === a.version + 1) return row;
    if (row.version !== a.version) fail("Versi berubah. Muat ulang.");
    let changes: Prisma.StageRecordUpdateInput = { version: { increment: 1 } };
    if (a.action === "submit") {
      if (row.status !== "DRAFT") fail("Hanya draft dapat disubmit.");
      changes = { ...changes, status: "SUBMITTED", snapshot: await recordSnapshot(tx, actor, p) };
    } else if (a.action === "verify" || a.action === "reject") {
      if (row.status !== "SUBMITTED") fail("Dokumen belum disubmit.");
      if (a.action === "verify") {
        if (digest(await recordSnapshot(tx, actor, p)) !== digest(row.snapshot)) fail("Sumber/parameter berubah setelah submit.");
        if (inspection) {
          for (const f of p.findings) await tx.inspectionFinding.create({ data: { inspectionId: id, key: f.key, plantId: p.plantId, picId: f.picId, detail: f.detail, severity: f.severity, dueDate: f.dueDate, fileIds: f.fileIds } });
        }
      }
      changes = { ...changes, status: target, verifiedBy: a.action === "verify" ? actor.userId : null };
    } else if (a.action === "issue") {
      if (inspection) fail("Inspeksi memakai verifikasi.", 422);
      const snapshot = await recordSnapshot(tx, actor, p), config = await verified(tx, p.configId, "LETTER_TYPE", p.plantId, new Date(p.effectiveAt)), policy = config.payload as Extract<ConfigInput["payload"], { kind: "LETTER_TYPE" }>;
      if (policy.approvalRequired ? row.status !== "VERIFIED" : !["DRAFT", "SUBMITTED", "VERIFIED"].includes(row.status)) fail("Surat membutuhkan persetujuan sesuai parameter verified.");
      if (row.status !== "DRAFT" && digest(snapshot) !== digest(row.snapshot)) fail("Sumber berubah setelah persetujuan. Buat versi dokumen baru.");
      const date = new Date(row.effectiveAt.getTime() + 7 * 3600000).toISOString(), year = date.slice(0, 4), month = date.slice(5, 7);
      const scope = policy.scope === "GLOBAL" ? "STAGE:GLOBAL" : policy.scope === "TYPE" ? `STAGE:TYPE:${config.rootId}` : `STAGE:PLANT:${row.plantId}:${config.rootId}`;
      const period = policy.reset === "NEVER" ? "ALL" : policy.reset === "YEAR" ? year : `${year}-${month}`;
      const seq = await tx.numberSequence.upsert({ where: { documentType_period: { documentType: scope, period } }, create: { documentType: scope, period, prefix: policy.displayCode, padding: policy.padding, lastNumber: policy.start }, update: { lastNumber: { increment: 1 } } });
      const plantRow = await tx.plant.findUniqueOrThrow({ where: { id: p.plantId } });
      const tokens: Record<string, string> = { seq: String(seq.lastNumber).padStart(policy.padding, "0"), code: policy.displayCode, year, month, plant: plantRow.code };
      const number = policy.format.replace(/\{(seq|code|year|month|plant)\}/g, (_, key: string) => tokens[key]);
      changes = { ...changes, number, status: "ISSUED", issuedBy: actor.userId, snapshot };
    } else if (a.action === "request-cancel") {
      if (inspection || row.status !== "ISSUED" || row.cancelRequestedBy) fail("Surat issued tanpa permintaan pembatalan saja.");
      changes = { ...changes, cancelRequestedBy: actor.userId, cancelReason: a.reason };
    } else if (a.action === "cancel") {
      if (inspection || row.status !== "ISSUED" || !row.cancelRequestedBy) fail("Belum ada permintaan pembatalan.");
      peer(actor, row.cancelRequestedBy); changes = { ...changes, status: "CANCELLED" };
    } else fail("Action tidak sesuai dokumen.", 422);
    const next = await tx.stageRecord.update({ where: { id }, data: changes }); await stamp(tx, actor, "STAGE_RECORD", a.action.toUpperCase(), id, { reason: a.reason, number: next.number, version: next.version }); return next;
  });
}
