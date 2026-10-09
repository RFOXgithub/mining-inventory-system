import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor, can } from "@/lib/access";
import { z } from "zod";
import { allow, digest, fail } from "./common";
import { documentAccess } from "./files";
import { ConfigInput, monthSchema } from "./schema";
export const workspaces = { documents: "documents.read", assets: "asset.read", inspections: "inspection.read" } as const;
export async function stageData(db: PrismaClient, actor: AccessActor, url: URL) {
  const workspace = z.enum(["documents", "assets", "inspections"]).parse(url.searchParams.get("workspace")), selectedPlant = z.string().uuid().optional().parse(url.searchParams.get("plantId") || undefined);
  const month = monthSchema.parse(url.searchParams.get("month") || new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7)), medical = url.searchParams.get("view") === "health";
  allow(actor, workspaces[workspace], selectedPlant); if (medical) allow(actor, "health.read", selectedPlant);
  return db.$transaction(async tx => {
    const plants = await tx.plant.findMany({ where: { active: true, ...(selectedPlant ? { id: selectedPlant } : actor.allPlants ? {} : { id: { in: actor.plantIds } }) }, select: { id: true, code: true, name: true, verificationStatus: true }, orderBy: { code: "asc" } });
    const plantIds = plants.filter(p => can(actor, workspaces[workspace], p.id)).map(p => p.id), scope = { plantId: { in: plantIds } };
    const kinds = workspace === "documents" ? ["LETTER_TYPE"] : workspace === "assets" ? ["ASSET", ...(can(actor, "asset.finance.read") ? ["ASSET_FINANCE"] : [])] : ["WORKER", "CHECKLIST"];
    const configs = await tx.stageConfig.findMany({ where: { ...scope, kind: { in: kinds } }, orderBy: [{ code: "asc" }, { revision: "desc" }], take: 501 });
    if (configs.length > 500) fail("Persempit plant: register memiliki lebih dari 500 versi parameter.", 422);
    const start = new Date(`${month}-01T00:00:00+07:00`), [y, m] = month.split("-").map(Number), end = new Date(Date.UTC(y, m, 1) - 7 * 3600000);
    const candidates = workspace === "assets" ? [] : await tx.stageRecord.findMany({ where: { ...scope, kind: { in: workspace === "documents" ? ["LETTER", "BUNDLE"] : ["INSPECTION"] }, effectiveAt: { gte: start, lt: end } }, orderBy: { effectiveAt: "desc" }, take: 201 });
    if (candidates.length > 200) fail("Persempit plant/periode: viewer dibatasi 200 sumber dan tidak memotong export diam-diam.", 422);
    const records = [];
    for (const row of candidates) { try { await documentAccess(tx, actor, row.id); records.push(row); } catch (e) { if (!(e instanceof Error) || !("status" in e) || e.status !== 403) throw e; } }
    const financial = workspace === "assets" && can(actor, "asset.finance.read"), depreciations = financial ? await tx.assetDepreciation.findMany({ where: { ...scope, month }, orderBy: { assetId: "asc" }, take: 500 }) : [];
    const corrections = financial ? await tx.depreciationCorrection.findMany({ where: { ...scope, effectiveAt: { gte: start, lt: end } }, orderBy: { effectiveAt: "desc" }, take: 500 }) : [];
    const events = financial ? await tx.depreciationEvent.findMany({ where: { ...scope, effectiveAt: { gte: start, lt: end } }, orderBy: { effectiveAt: "asc" }, take: 10001 }) : [];
    if (events.length > 10000) fail("Persempit plant/periode untuk export ledger aset lengkap.", 422);
    const accumulatedEvents = financial ? await tx.depreciationEvent.groupBy({ by: ["assetId"], where: { ...scope, effectiveAt: { lt: end } }, _sum: { amount: true } }) : [];
    const books = financial ? configs.filter(c => c.kind === "ASSET").filter((c, i, a) => a.findIndex(v => v.rootId === c.rootId && v.status === "VERIFIED" && v.effectiveFrom < end) === i).map(asset => {
      const finance = configs.filter(c => c.kind === "ASSET_FINANCE" && c.subjectId === asset.rootId && c.status === "VERIFIED" && c.effectiveFrom < end).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.revision - a.revision)[0];
      if (!finance) return { assetId: asset.rootId, currency: null, bookValue: null, accumulated: null };
      const p = finance.payload as Extract<ConfigInput["payload"], { kind: "ASSET_FINANCE" }>, accumulated = new Prisma.Decimal(p.openingAccumulated).plus(accumulatedEvents.find(e => e.assetId === asset.rootId)?._sum.amount ?? 0);
      return { assetId: asset.rootId, currency: p.currency, accumulated: accumulated.toString(), bookValue: new Prisma.Decimal(p.cost).minus(accumulated).toString() };
    }) : [];
    const locations = workspace === "inspections" ? await tx.plantLocation.findMany({ where: { ...scope, active: true, verificationStatus: "VERIFIED" }, select: { id: true, plantId: true, name: true } }) : [];
    const findings = workspace === "inspections" ? await tx.inspectionFinding.findMany({ where: { ...scope, OR: [{ status: "OPEN" }, { inspectionId: { in: records.map(r => r.id) } }] }, orderBy: { dueDate: "asc" }, take: 501 }) : [], followups = workspace === "inspections" ? await tx.findingFollowup.findMany({ where: { ...scope, findingId: { in: findings.map(f => f.id) } }, orderBy: { actualAt: "desc" }, take: 1001 }) : [];
    if (findings.length > 500 || followups.length > 1000) fail("Persempit plant/periode untuk memuat temuan dan history lengkap.", 422);
    // Public summary intentionally selects no measurements, notes, files, or clinical history.
    const summaries = workspace === "inspections" ? await tx.medicalExam.findMany({ where: { ...scope, status: "VERIFIED" }, select: { workerId: true, kind: true, examAt: true, workStatus: true, validUntil: true }, orderBy: { examAt: "desc" }, take: 5000 }) : [];
    const summary = summaries.filter((row, i, a) => a.findIndex(v => v.workerId === row.workerId && v.kind === row.kind) === i).map(row => ({ ...row, workStatus: row.validUntil < new Date() ? "EXPIRED" : row.workStatus }));
    const exams = medical ? await tx.medicalExam.findMany({ where: { ...scope, examAt: { gte: start, lt: end } }, orderBy: { examAt: "desc" }, take: 200 }) : [];
    const fileIds = new Set([...configs.flatMap(c => c.payload && (c.payload as { kind: string }).kind === "ASSET" ? (c.payload as { fileIds: string[] }).fileIds : []),...records.flatMap(r => { const p = r.payload as { fileIds: string[]; findings?: { fileIds: string[] }[] }; return [...p.fileIds, ...(p.findings?.flatMap(f => f.fileIds) ?? [])]; }), ...followups.flatMap(f => f.fileIds), ...exams.flatMap(e => e.fileIds)]);
    const sources: { domain: string; id: string; plantId: string; number: string; status: string }[] = [];
    if (workspace === "documents") {
      if (can(actor, "inventory.read")) { const inventory = await tx.stockDocument.findMany({ where: { status: "POSTED", lines: { some: { location: scope } } }, select: { id: true, number: true, status: true, lines: { select: { location: { select: { plantId: true } }, destination: { select: { plantId: true } } } } }, take: 200, orderBy: { effectiveAt: "desc" } }); for (const r of inventory) { const plantId = r.lines[0]?.location.plantId; if (plantId && r.lines.every(l => l.location.plantId === plantId && (!l.destination || l.destination.plantId === plantId))) sources.push({ domain: "INVENTORY", id: r.id, plantId, number: r.number, status: r.status }); } }
      if (can(actor, "production.read") || can(actor, "fuel.read")) { const ops = await tx.operationalRun.findMany({ where: { ...scope, status: "POSTED" }, select: { id: true, number: true, plantId: true, status: true, kind: true }, orderBy: { effectiveAt: "desc" }, take: 200 }); for (const r of ops) if (can(actor, r.kind.startsWith("FUEL_") ? "fuel.read" : "production.read", r.plantId)) sources.push({ domain: "OPERATIONS", id: r.id, plantId: r.plantId, number: r.number, status: r.status }); }
      if (can(actor, "sales.read")) { const com = await tx.commerceRecord.findMany({ where: { ...scope, status: { in: ["APPROVED", "DISPATCHED", "COMPLETED"] } }, select: { id: true, number: true, plantId: true, status: true }, orderBy: { effectiveAt: "desc" }, take: 200 }); sources.push(...com.map(r => ({ ...r, domain: "COMMERCE" }))); }
      if (can(actor, "finance.read")) { const fin = await tx.financialRecord.findMany({ where: { ...scope, status: { in: ["ISSUED", "POSTED", "VERIFIED"] } }, select: { id: true, number: true, plantId: true, status: true }, orderBy: { effectiveAt: "desc" }, take: 200 }); sources.push(...fin.map(r => ({ ...r, domain: "FINANCE" }))); }
    }
    const files = await tx.stageFile.findMany({ where: { ...scope, id: { in: [...fileIds] } }, select: { id: true, name: true, mime: true, size: true, sha256: true, sourceId: true } });
    const history = await tx.auditLog.findMany({ where: { module: { in: ["STAGE_CONFIG", "STAGE_RECORD", "DEPRECIATION", "DEPRECIATION_CORRECTION", "FOLLOWUP"] }, recordId: { in: [...configs.map(c => c.id), ...records.map(r => r.id), ...depreciations.map(d => d.id), ...corrections.map(c => c.id), ...followups.map(f => f.id)] } }, select: { recordId: true, action: true, userId: true, createdAt: true, newValue: true }, orderBy: { createdAt: "asc" }, take: 2000 });
    const snapshotHash = digest({ records, depreciations, corrections, events, books, findings, followups, configs, summary });
    return { workspace, month, plants, configs, records, depreciations, corrections, events, books, locations, findings, followups, summary, exams, files, sources, history, snapshotHash, limits: { records: 200, configs: 500, findings: 500 } };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}
