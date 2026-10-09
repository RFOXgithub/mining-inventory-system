import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertSameOrigin, domainResponse, DomainError } from "@/lib/domain-error";
import { stageData } from "./query";
import { createConfig, actConfig } from "./configs";
import { saveRecord, actRecord } from "./documents";
import { actDepreciation, generateDepreciation } from "./depreciation";
import { actExam, saveExam, actFollowup, saveFollowup } from "./hse";
import { downloadFile, MAX_FILE, uploadFile } from "./files";
import { syncSchema } from "./schema";
import { createDepreciationCorrection, actDepreciationCorrection } from "./depreciation-correction";
import { stageExport } from "./export";
import { z } from "zod";
const json = (value: unknown, status = 200) => NextResponse.json(JSON.parse(JSON.stringify(value)), { status, headers: { "Cache-Control": "private, no-store" } });
async function bytes(request: Request, limit: number) { const reader = request.body?.getReader(); if (!reader) throw new DomainError(422, "Body diperlukan."); const chunks = []; let length = 0; try { for (;;) { const r = await reader.read(); if (r.done) break; length += r.value.length; if (length > limit) { await reader.cancel(); throw new DomainError(413, "Body terlalu besar."); } chunks.push(Buffer.from(r.value)); } } finally { reader.releaseLock(); } return Buffer.concat(chunks); }
export async function GET(request: Request) { const actor = await getSession(); if (!actor) return json({ message: "Silakan masuk." }, 401); try { return json(await stageData(db, actor, new URL(request.url))); } catch (e) { return domainResponse(e); } }
type Context = { params: Promise<{ entity: string; id?: string }> };
export async function mutate(request: Request, context: Context) {
  const actor = await getSession(); if (!actor) return json({ message: "Silakan masuk." }, 401);
  try {
    assertSameOrigin(request); const { entity, id } = await context.params, body = JSON.parse((await bytes(request, 256 * 1024)).toString("utf8")), action = new URL(request.url).pathname.endsWith("/actions"); let result;
    if (id) z.string().uuid().parse(id);
    if (entity === "configs") result = action && id ? await actConfig(db, actor, id, body) : !id ? await createConfig(db, actor, body) : null;
    else if (entity === "records") result = action && id ? await actRecord(db, actor, id, body) : await saveRecord(db, actor, body, id);
    else if (entity === "exams") result = action && id ? await actExam(db, actor, id, body) : await saveExam(db, actor, body, id);
    else if (entity === "followups") result = action && id ? await actFollowup(db, actor, id, body) : !id ? await saveFollowup(db, actor, body) : null;
    else if (entity === "depreciation") { if (id && action) result = await actDepreciation(db, actor, id, body); else if (!id) { const b = z.object({ plantId: z.string().uuid(), month: z.string() }).strict().parse(body); result = await generateDepreciation(db, actor, b.plantId, b.month); } }
    else if (entity === "corrections") result = action && id ? await actDepreciationCorrection(db, actor, id, body) : !id ? await createDepreciationCorrection(db, actor, body) : null;
    else if (entity === "sync" && !id) { const packet = syncSchema.parse(body), row = await saveRecord(db, actor, { payload: packet.payload, version: packet.version }, packet.sourceId); result = { sourceId: row.id, version: row.version, status: row.status }; }
    if (!result) throw new DomainError(404, "Endpoint tidak ditemukan."); return json({ data: result }, id || entity === "sync" ? 200 : 201);
  } catch (e) { if (e instanceof SyntaxError) return json({ message: "JSON tidak valid." }, 422); return domainResponse(e); }
}
export async function filePOST(request: Request) {
  const actor = await getSession(); if (!actor) return json({ message: "Silakan masuk." }, 401);
  try { assertSameOrigin(request); const url = new URL(request.url), body = await bytes(request, MAX_FILE); return json({ data: await uploadFile(db, actor, { requestKey: url.searchParams.get("requestKey"), plantId: url.searchParams.get("plantId"), domain: url.searchParams.get("domain"), name: url.searchParams.get("name"), mime: request.headers.get("content-type") }, body) }, 201); } catch (e) { return domainResponse(e); }
}
export async function fileGET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getSession(); if (!actor) return json({ message: "Silakan masuk." }, 401);
  try { const id = z.string().uuid().parse((await context.params).id), row = await downloadFile(db, actor, id); return new Response(new Uint8Array(row.content), { headers: { "Content-Type": row.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "ETag": `"${row.sha256}"` } }); } catch (e) { return domainResponse(e); }
}

export async function exportGET(request: Request) { const actor = await getSession(); if (!actor) return json({ message: "Silakan masuk." }, 401); try { const result = await stageExport(db, actor, new URL(request.url)); return new Response("\ufeff" + result.csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${result.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); } catch (e) { return domainResponse(e); } }
