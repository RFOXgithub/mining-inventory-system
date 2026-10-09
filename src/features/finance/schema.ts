import { z } from "zod";
const id = z.string().uuid();
export const evidence = z.string().trim().min(5).max(1000);
const name = z.string().trim().min(2).max(200);
const date = z.string().datetime({ offset: true });
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "Tanggal kalender tidak sah.");
export const money = z.string().regex(/^\d{1,20}(\.\d{1,2})?$/, "Nilai memakai decimal, maksimal 20 angka bulat dan 2 desimal.");
const positiveMoney = money.refine(v => /[1-9]/.test(v), "Nilai harus positif.");
const quantity = z.string().regex(/^\d{1,17}(\.\d{1,6})?$/).refine(v => /[1-9]/.test(v), "Quantity harus positif.");
const policy = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ACCOUNT"), bank: name, number: name, holder: name, ownership: z.enum(["COMPANY", "THIRD_PARTY"]), currency: z.string().regex(/^[A-Z]{3}$/), receiptAllowed: z.boolean(), settlementTreatment: evidence }).strict(),
  z.object({ kind: z.literal("TAX"), commercialTreatment: evidence, currency: z.string().regex(/^[A-Z]{3}$/), rate: z.string().regex(/^\d{1,3}(\.\d{1,6})?$/).refine(v => Number(v) <= 100), calculation: z.enum(["NONE", "EXCLUSIVE", "INCLUSIVE"]), base: z.enum(["ITEMS", "ITEMS_FREIGHT"]), rounding: z.enum(["HALF_UP", "DOWN", "UP"]), roundAt: z.enum(["LINE", "TOTAL"]) }).strict(),
  z.object({ kind: z.literal("TERM"), partyCode: name, basis: z.enum(["INVOICE", "DELIVERY", "RECEIPT", "EXPLICIT"]), days: z.number().int().min(0).max(3650), deliveryBasis: z.enum(["FIRST_COMPLETION", "LAST_COMPLETION"]), explicitDueDate: dateOnly.optional(), schedule: z.enum(["PER_DELIVERY", "PERIODIC", "ON_REQUEST"]) }).strict(),
]).superRefine((p, ctx) => {
  if (p.kind === "TAX" && p.calculation === "NONE" && Number(p.rate) !== 0) ctx.addIssue({ code: "custom", path: ["rate"], message: "Tanpa pajak memerlukan rate nol yang disahkan secara eksplisit." });
  if (p.kind === "TERM" && (p.basis === "EXPLICIT" ? !p.explicitDueDate : !!p.explicitDueDate)) ctx.addIssue({ code: "custom", path: ["explicitDueDate"], message: "Tanggal eksplisit hanya digunakan pada term EXPLICIT verified." });
});
export const configSchema = z.object({ requestKey: id, plantId: id, code: name, revision: z.number().int().positive(), effectiveFrom: date, evidence, payload: policy }).strict();
export const configActionSchema = z.object({ action: z.enum(["finance", "verify"]), evidence }).strict();
const base = { requestKey: id, plantId: id, effectiveAt: date, evidence, reason: evidence };
const invoiceLine = z.discriminatedUnion("role", [z.object({ role: z.literal("ITEM"), deliveryId: id, sourceKey: id, quantity }).strict(), z.object({ role: z.literal("FREIGHT"), deliveryId: id, amount: positiveMoney }).strict()]);
export const recordSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("INVOICE"), taxId: id.optional(), termId: id.optional(), billingMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), receivedDate: dateOnly.optional(), receivedEvidence: evidence.optional(), lines: z.array(invoiceLine).min(1).max(50) }).strict(),
  z.object({ ...base, kind: z.literal("RECEIPT"), partyId: id, accountId: id.optional(), currency: z.string().regex(/^[A-Z]{3}$/), amount: positiveMoney, bankReference: name }).strict(),
  z.object({ ...base, kind: z.literal("ALLOCATION"), receiptId: id, lines: z.array(z.object({ invoiceId: id, amount: positiveMoney }).strict()).min(1).max(50) }).strict(),
  z.object({ ...base, kind: z.literal("PPH"), invoiceId: id, amount: positiveMoney, certificateNumber: name, certificateDate: dateOnly, payerTaxIdentity: name }).strict(),
  z.object({ ...base, kind: z.literal("CORRECTION"), targetId: id }).strict(),
]).superRefine((p, ctx) => {
  if (p.kind === "INVOICE" && new Set(p.lines.map(l => `${l.deliveryId}:${l.role === "ITEM" ? l.sourceKey : "FREIGHT"}`)).size !== p.lines.length || p.kind === "ALLOCATION" && new Set(p.lines.map(l => l.invoiceId)).size !== p.lines.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "Sumber/baris tidak boleh duplikat." });
});
export const saveSchema = z.object({ payload: recordSchema, version: z.number().int().nonnegative() }).strict();
export const actionSchema = z.object({ action: z.enum(["issue", "post", "submit", "verify", "approve", "reject"]), version: z.number().int().positive(), reason: evidence }).strict();
export type RecordInput = z.infer<typeof recordSchema>;
export type ConfigInput = z.infer<typeof configSchema>;
