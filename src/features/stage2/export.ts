import { PrismaClient } from "@prisma/client";
import { AccessActor } from "@/lib/access";
import { stageData, workspaces } from "./query";
import { allow, fail } from "./common";
import { writeAudit } from "@/lib/audit";
export async function stageExport(db: PrismaClient, actor: AccessActor, url: URL) {
  if (url.searchParams.get("view") === "health") fail("Export detail medis tidak tersedia untuk workspace umum.", 403);
  const workspace = url.searchParams.get("workspace") as keyof typeof workspaces;
  allow(actor, workspace === "inspections" ? "inspection.export" : "reports.export", url.searchParams.get("plantId") || undefined);
  const result = await stageData(db, actor, url), hash = result.snapshotHash;
  if (url.searchParams.get("hash") !== hash) fail("Sumber export berubah. Muat ulang viewer.");
  const rows: (string | number | null)[][] = [];
  for (const r of result.records) rows.push([r.plantId, r.id, r.kind, r.number, r.status, r.effectiveAt.toISOString(), r.makerId, r.verifiedBy, "", "", r.kind === "INSPECTION" ? (r.payload as { notes: string }).notes : (r.payload as { title: string }).title]);
  for (const d of result.depreciations) rows.push([d.plantId, d.id, "DEPRECIATION_SOURCE", d.assetId, d.status, d.month, d.makerId, d.verifiedBy, d.amount.toString(), (result.configs.find(c => c.id === d.configId)?.payload as { currency: string })?.currency ?? "", `book ${d.bookBefore} -> ${d.bookAfter}`]);
  for (const e of result.events) rows.push([e.plantId, e.id, "DEPRECIATION_EVENT", e.sourceId ?? e.correctionId, "POSTED", e.effectiveAt.toISOString(), e.actorId, "", e.amount.toString(), (result.configs.find(c => c.kind === "ASSET_FINANCE" && c.subjectId === e.assetId)?.payload as { currency: string })?.currency ?? "", e.assetId]);
  for (const c of result.corrections) rows.push([c.plantId,c.id,"DEPRECIATION_CORRECTION",c.targetId,c.status,c.effectiveAt.toISOString(),c.makerId,c.approvedBy,c.amount.toString(),"",c.reason]);
  for (const f of result.findings) rows.push([f.plantId, f.id, "FINDING", f.inspectionId, f.status, f.dueDate, f.picId, f.resolvedBy, "", "", `${f.severity}: ${f.detail}`]);
  for (const s of result.summary) rows.push([result.configs.find(c => c.rootId === s.workerId)?.plantId ?? "", s.workerId, "WORK_STATUS_SUMMARY", s.kind, s.workStatus, s.examAt.toISOString(), "", "", "", "", `valid until ${s.validUntil.toISOString()}`]);
  for (const b of result.books) rows.push([result.configs.find(c => c.rootId === b.assetId)?.plantId ?? "", b.assetId, "BOOK_AS_OF", result.month, "", "", "", "", b.bookValue, b.currency, `accumulated ${b.accumulated}`]);
  const cell = (value: unknown) => { const s = String(value ?? ""); return `"${(/^[\s]*[=+@-]/.test(s) ? "'" : "") + s.replaceAll('"', '""')}"`; };
  const csv = [["plantId", "sourceId", "event", "reference", "status", "effectiveAt", "maker/PIC", "verifier", "amount", "currency", "detail"], ...rows].map(r => r.map(cell).join(",")).join("\r\n");
  await db.$transaction(tx => writeAudit(tx, { userId: actor.userId, module: "STAGE_EXPORT", action: "EXPORT", newValue: { workspace: result.workspace, month: result.month, plantIds: result.plants.map(p => p.id), hash, rows: rows.length } }));
  return { csv, hash, count: rows.length, filename: `quarryflow-${workspace}-${result.month}.csv` };
}
