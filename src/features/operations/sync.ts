import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { AccessActor } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { runSchema } from "./schema";
import { saveRun } from "./service";
export const syncSchema = z.object({ clientDraftId: z.string().uuid(), deviceId: z.string().uuid(), clientUpdatedAt: z.string().datetime({ offset: true }), sourceId: z.string().uuid().optional(), version: z.number().int().nonnegative(), payload: runSchema }).strict().superRefine((v, c) => { if (v.clientDraftId !== v.payload.requestKey || v.payload.kind === "BLENDING") c.addIssue({ code: "custom", path: ["clientDraftId"], message: "Sync hanya draft produksi/BBM dengan UUID yang sama." }); });
export async function syncDraft(db: PrismaClient, actor: AccessActor, raw: unknown, request?: Request) {
  const p = syncSchema.parse(raw);
  if (p.sourceId && !p.version || !p.sourceId && p.version !== 0) throw new DomainError(422, "Source/version sync tidak sesuai.");
  const row = await saveRun(db, actor, { payload: p.payload, version: p.version }, p.sourceId, request, { deviceId: p.deviceId, clientUpdatedAt: p.clientUpdatedAt });
  return { clientDraftId: p.clientDraftId, sourceId: row.id, version: row.version, status: "SYNCED", serverStatus: row.status, payload: row.payload };
}
