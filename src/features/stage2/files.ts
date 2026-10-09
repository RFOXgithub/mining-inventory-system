import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AccessActor } from "@/lib/access";
import { atomic } from "@/features/inventory/ledger-service";
import { allow, fail, plant, Tx } from "./common";
import type { RecordInput } from "./schema";
export const MAX_FILE = 4 * 1024 * 1024;
const domains = { DOCUMENT: "documents", ASSET: "asset.physical", INSPECTION: "inspection", MEDICAL: "health" } as const;
export function fileType(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  fail("Hanya PDF/JPEG/PNG/WebP dengan signature valid.", 422);
}
export function sourcePermission(domain: string) { return ({ INVENTORY: "inventory.read", OPERATIONS: "production.read", COMMERCE: "sales.read", FINANCE: "finance.read" } as Record<string, string>)[domain]; }
export async function documentAccess(tx: Tx, actor: AccessActor, id: string) {
  const row = await tx.stageRecord.findUnique({ where: { id } }); if (!row) fail("Dokumen tidak ditemukan.", 404);
  allow(actor, row.kind === "INSPECTION" ? "inspection.read" : "documents.read", row.plantId);
  const p = row.payload as RecordInput;
  if (p.kind !== "INSPECTION") for (const src of p.sources) {
    let permission = sourcePermission(src.domain);
    if (src.domain === "OPERATIONS") { const op = await tx.operationalRun.findUnique({ where: { id: src.id }, select: { kind: true } }); if (op?.kind.startsWith("FUEL_")) permission = "fuel.read"; }
    allow(actor, permission, row.plantId);
  }
  return row;
}
export async function uploadFile(db: PrismaClient, actor: AccessActor, meta: unknown, bytes: Uint8Array) {
  const data = z.object({ requestKey: z.string().uuid(), plantId: z.string().uuid(), domain: z.enum(["DOCUMENT", "ASSET", "INSPECTION", "MEDICAL"]), name: z.string().trim().min(1).max(180).refine(v => !/[\r\n/\\\x00]/.test(v)), mime: z.string() }).strict().parse(meta);
  if (bytes.length === 0 || bytes.length > MAX_FILE) fail("Ukuran file harus 1 byte sampai 4 MiB.", 422);
  const mime = fileType(bytes); if (mime !== data.mime) fail("Content-Type tidak cocok dengan file.", 422);
  const hash = createHash("sha256").update(bytes).digest("hex");
  return atomic(db, async tx => {
    await plant(tx, actor, `${domains[data.domain]}.${data.domain === "MEDICAL" ? "manage" : "create"}`, data.plantId);
    const old = await tx.stageFile.findUnique({ where: { requestKey: data.requestKey }, select: { id: true, ownerId: true, sha256: true, name: true, mime: true, domain: true, plantId: true } });
    if (old) { if (old.ownerId !== actor.userId || old.sha256 !== hash || old.domain !== data.domain || old.plantId !== data.plantId || old.name !== data.name || old.mime !== mime) fail("UUID file sudah digunakan."); return { id: old.id, name: old.name, sha256: hash }; }
    const row = await tx.stageFile.create({ data: { ...data, mime, sha256: hash, size: bytes.length, content: new Uint8Array(bytes), ownerId: actor.userId }, select: { id: true, name: true, sha256: true } }); return row;
  });
}
export async function bindFiles(tx: Tx, actor: AccessActor, ids: string[], plantId: string, domain: keyof typeof domains, sourceId: string) {
  for (const id of new Set(ids)) {
    const f = await tx.stageFile.findUnique({ where: { id }, select: { id: true, plantId: true, domain: true, ownerId: true, sourceId: true } });
    if (!f || f.plantId !== plantId || f.domain !== domain || f.sourceId && f.sourceId !== sourceId || !f.sourceId && f.ownerId !== actor.userId) fail("File tidak sesuai pemilik, sumber atau plant.", 422);
    if (!f.sourceId) await tx.stageFile.update({ where: { id }, data: { sourceId } });
  }
}
export async function downloadFile(db: PrismaClient, actor: AccessActor, id: string) {
  return db.$transaction(async tx => {
    const f = await tx.stageFile.findUnique({ where: { id }, select: { id: true, plantId: true, domain: true, ownerId: true, sourceId: true } }); if (!f) fail("File tidak ditemukan.", 404);
    const domain = domains[f.domain as keyof typeof domains]; if (!domain) fail("Domain file tidak valid.", 403); allow(actor, `${domain}.read`, f.plantId);
    if (!f.sourceId && f.ownerId !== actor.userId) fail("File belum diterbitkan oleh pemilik.", 403);
    if (f.sourceId && f.domain === "DOCUMENT") await documentAccess(tx, actor, f.sourceId);
    const row = await tx.stageFile.findUniqueOrThrow({ where: { id } });
    return row;
  }, { isolationLevel: "RepeatableRead" });
}
