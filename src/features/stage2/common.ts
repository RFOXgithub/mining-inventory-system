import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AccessActor, can } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { writeAudit } from "@/lib/audit";
export type Tx = Prisma.TransactionClient;
export const digest = (value: unknown) => {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, item]) => [k, sort(item)])) : v;
  return createHash("sha256").update(JSON.stringify(sort(JSON.parse(JSON.stringify(value))))).digest("hex");
};
export function fail(message: string, status = 409): never { throw new DomainError(status, message); }
export function allow(actor: AccessActor, permission: string, plantId?: string) { if (!can(actor, permission, plantId)) fail("Action atau cakupan plant tidak diizinkan.", 403); }
export function peer(actor: AccessActor, maker: string) { if (actor.userId === maker) fail("Verifier harus akun berbeda dari pembuat.", 403); }
export async function plant(tx: Tx, actor: AccessActor, p: string, plantId: string) { allow(actor, p, plantId); const row = await tx.plant.findUnique({ where: { id: plantId } }); if (!row?.active || row.verificationStatus !== "VERIFIED") fail("Plant harus aktif dan verified.", 422); return row; }
export function stamp(tx: Tx, actor: AccessActor, module: string, action: string, id: string, info: object = {}) { return writeAudit(tx, { userId: actor.userId, module, action, recordId: id, newValue: info }); }
export async function verified(tx: Tx, id: string, kind: string, plantId: string, at: Date) {
  const row = await tx.stageConfig.findUnique({ where: { id } });
  if (!row || row.kind !== kind || row.plantId !== plantId || row.status !== "VERIFIED" || row.effectiveFrom > at) fail(`${kind} harus verified dan efektif.`, 422);
  const latest = await tx.stageConfig.findFirst({ where: { rootId: row.rootId, status: "VERIFIED", effectiveFrom: { lte: at } }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }] });
  if (latest?.id !== id) fail("Gunakan versi verified yang efektif terbaru.", 422);
  return row;
}
export async function worker(tx: Tx, rootId: string, plantId: string, at: Date) { const row = await tx.stageConfig.findFirst({ where: { rootId, kind: "WORKER", plantId, status: "VERIFIED", effectiveFrom: { lte: at } }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }] }); if (!row || !(row.payload as { active: boolean }).active) fail("Pekerja/PIC harus aktif dan verified.", 422); return row; }
export const configPermission = (kind: string, verb: "create" | "verify" | "read") => `${kind === "LETTER_TYPE" ? "documents.config" : kind === "ASSET" ? "asset.physical" : kind === "ASSET_FINANCE" ? "asset.finance" : kind === "WORKER" ? "workers" : "inspection.config"}.${verb}`;
