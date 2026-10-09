import { z } from "zod";
const id = z.string().uuid(), text = z.string().trim().min(2).max(200), note = z.string().trim().min(5).max(3000);
export const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const money = z.string().regex(/^\d{1,18}(\.\d{1,6})?$/), date = z.string().datetime({ offset: true });
const files = z.array(id).max(20).default([]);
const policy = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("LETTER_TYPE"), name: text, displayCode: z.string().regex(/^[A-Z0-9-]{1,12}$/), aliases: z.array(text).max(10), format: z.string().min(5).max(150).refine(v => v.includes("{seq}") && !v.replace(/\{(seq|code|year|month|plant)\}/g, "").includes("{"), "Format harus memuat {seq}; placeholder: seq/code/year/month/plant."), scope: z.enum(["GLOBAL", "TYPE", "PLANT_TYPE"]), reset: z.enum(["YEAR", "MONTH", "NEVER"]), padding: z.number().int().min(1).max(10), start: z.number().int().min(1).max(1000000), approvalRequired: z.boolean() }).strict(),
  z.object({ kind: z.literal("ASSET"), name: text, identity: text, plate: z.string().max(80), serial: z.string().max(100), chassis: z.string().max(100), model: text, ownership: z.enum(["OWNED", "RENTED"]), unitCount: z.number().int().positive().max(10000), legacyEquipmentId: id.optional(), operationalAssetId: id.optional(), vehicleId: id.optional(), ownershipEvidence: note, fileIds: files }).strict(),
  z.object({ kind: z.literal("ASSET_FINANCE"), assetId: id, cost: money.refine(v => /[1-9]/.test(v)), residual: money, lifeMonths: z.number().int().min(1).max(1200), startDate: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/), firstMonth: z.enum(["FULL", "NEXT_MONTH", "DAILY_ACTUAL"]), openingMonth: monthSchema, openingAccumulated: money, currency: z.string().regex(/^[A-Z]{3}$/), decimals: z.number().int().min(0).max(6) }).strict(),
  z.object({ kind: z.literal("WORKER"), name: text, job: text, employment: text, active: z.boolean(), userId: id.optional() }).strict(),
  z.object({ kind: z.literal("CHECKLIST"), name: text, checks: z.array(z.object({ key: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/), label: text }).strict()).min(1).max(100).refine(rows => new Set(rows.map(r => r.key)).size === rows.length) }).strict(),
]);
export const configSchema = z.object({ requestKey: id, plantId: id, code: z.string().regex(/^[A-Z0-9_-]{2,50}$/), revision: z.number().int().positive(), effectiveFrom: date, evidence: note, payload: policy }).strict();
export const configActionSchema = z.object({ action: z.enum(["attest", "verify"]), evidence: note }).strict();
const source = z.object({ domain: z.enum(["INVENTORY", "OPERATIONS", "COMMERCE", "FINANCE"]), id }).strict();
const base = { requestKey: id, plantId: id, effectiveAt: date, configId: id, fileIds: files };
export const recordSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("LETTER"), title: text, recipient: text, body: z.string().trim().min(5).max(30000), sources: z.array(source).max(30).default([]) }).strict(),
  z.object({ ...base, kind: z.literal("BUNDLE"), title: text, recipient: text, body: z.string().trim().min(5).max(30000), sources: z.array(source).min(1).max(30) }).strict(),
  z.object({ ...base, kind: z.literal("INSPECTION"), locationId: id, inspectorId: id, notes: note, results: z.array(z.object({ key: text, result: z.enum(["PASS", "FAIL", "NA"]), detail: z.string().max(2000) }).strict()).min(1).max(100), findings: z.array(z.object({ key: text, detail: note, severity: z.enum(["LOW", "MEDIUM", "HIGH"]), picId: id, dueDate: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/), fileIds: files }).strict()).max(100).default([]) }).strict(),
]);
export const saveSchema = z.object({ payload: recordSchema, version: z.number().int().nonnegative() }).strict();
export const actionSchema = z.object({ action: z.enum(["submit", "verify", "issue", "reject", "request-cancel", "cancel", "post"]), version: z.number().int().positive(), reason: note }).strict();
export const examSchema = z.object({ requestKey: id, plantId: id, workerId: id, kind: z.enum(["WCU", "DCU"]), examAt: date, validUntil: date, workStatus: z.enum(["FIT", "RESTRICTED", "UNFIT", "PENDING"]), measurements: z.array(z.object({ label: text, value: z.string().trim().min(1).max(100), unit: z.string().max(30) }).strict()).min(1).max(30), notes: note, fileIds: files }).strict().refine(v => new Date(v.validUntil) >= new Date(v.examAt), "Masa berlaku sebelum pemeriksaan.");
export const saveExamSchema = z.object({ payload: examSchema, version: z.number().int().nonnegative() }).strict();
export const followupSchema = z.object({ requestKey: id, findingId: id, actualAt: date, note, fileIds: files }).strict();
export const syncSchema = z.object({ clientDraftId: id, deviceId: id, clientUpdatedAt: date, sourceId: id.optional(), version: z.number().int().nonnegative(), payload: recordSchema }).strict().refine(v => v.payload.kind === "INSPECTION" && v.clientDraftId === v.payload.requestKey && (!!v.sourceId === (v.version > 0)), "Identitas draft tidak cocok.");
export type ConfigInput = z.infer<typeof configSchema>;
export type RecordInput = z.infer<typeof recordSchema>;
export type InspectionInput = Extract<RecordInput, { kind: "INSPECTION" }>;
export type ExamInput = z.infer<typeof examSchema>;
