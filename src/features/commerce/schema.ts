import { z } from "zod";

const id = z.string().uuid();
export const evidence = z.string().trim().min(5).max(1000);
const label = z.string().trim().min(2).max(200);
export const quantity = z.string().regex(/^\d{1,17}(\.\d{1,6})?$/, "Maksimal 17 angka bulat dan 6 desimal.");
const positive = quantity.refine(v => /[1-9]/.test(v), "Quantity harus positif.");
export const money = z.string().regex(/^\d{1,15}(\.\d{1,2})?$/, "Harga maksimal 15 angka bulat dan 2 desimal.");
const date = z.string().datetime({ offset: true });
export const freight = z.object({ mode: z.enum(["PICKUP", "DELIVERY"]), term: label, basis: z.enum(["NONE", "PER_TRIP", "PER_UNIT"]), rate: money, internalRate: money }).strict().superRefine((v, ctx) => {
  if (v.basis === "NONE" && (Number(v.rate) !== 0 || Number(v.internalRate) !== 0)) ctx.addIssue({ code: "custom", path: ["rate"], message: "Term tanpa ongkos harus memilih nol secara eksplisit." });
});
const policy = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PARTY"), customerCode: label, customerName: label, projectCode: label, projectName: label, address: label, contact: label, taxReference: evidence }).strict(),
  z.object({ kind: z.literal("PRICE"), partyCode: label.nullable(), itemId: id, uomId: id, unitPrice: money, currency: z.string().regex(/^[A-Z]{3}$/), taxTreatment: evidence, minimumOrder: quantity, validUntil: date, freight }).strict(),
  z.object({ kind: z.literal("VEHICLE"), name: label, identity: label, ownership: label, driver: label }).strict(),
  z.object({ kind: z.literal("EVENT_POLICY"), stockOutEvent: z.literal("VERIFIED_DISPATCH"), completionRule: z.literal("ACCEPTED_WITH_PROOF"), serviceRule: z.literal("VERIFIED_SERVICE_PROOF"), pickupCombined: z.boolean() }).strict(),
]);
export const configSchema = z.object({ requestKey: id, plantId: id, code: z.string().trim().min(2).max(50), revision: z.number().int().positive(), effectiveFrom: date, evidence, payload: policy }).strict();
export const configActionSchema = z.object({ action: z.enum(["attest-pc", "attest-finance", "verify"]), evidence }).strict();
const line = z.object({ key: id, poLineKey: id.optional(), itemId: id, uomId: id, quantity: positive, priceId: id, unitPrice: money }).strict();
const header = { requestKey: id, plantId: id, effectiveAt: date, evidence, reason: evidence };
const terms = { partyId: id, payment: z.enum(["CASH", "CREDIT", "CONTRACT"]), paymentTerm: evidence, freight, lines: z.array(line).min(1).max(50) };
export const documentSchema = z.discriminatedUnion("kind", [
  z.object({ ...header, ...terms, kind: z.literal("QUOTATION"), validUntil: date }).strict(),
  z.object({ ...header, ...terms, kind: z.literal("SO"), quotationId: id.optional(), poId: id.optional() }).strict(),
  z.object({ ...header, ...terms, kind: z.literal("PO"), externalNumber: label, previousId: id.optional() }).strict(),
  z.object({ ...header, kind: z.literal("DELIVERY"), salesOrderId: id, destination: label, mode: z.enum(["PICKUP", "DELIVERY", "SERVICE"]), vehicleId: id.optional(), customerVehicle: label.optional(), driver: label, trips: z.number().int().min(1).max(10000), method: evidence, lines: z.array(z.object({ orderLineKey: id, locationId: id.optional(), quantity: positive }).strict()).min(1).max(50) }).strict(),
]).superRefine((v, ctx) => {
  const keys = v.lines.map(l => "key" in l ? l.key : l.orderLineKey);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "Baris tidak boleh duplikat." });
  if (v.kind === "SO" && v.payment !== "CASH" && !v.poId) ctx.addIssue({ code: "custom", path: ["poId"], message: "Kontrak/kredit wajib Customer PO approved." });
  if (v.kind === "DELIVERY" && (v.mode === "DELIVERY" && !v.vehicleId || v.mode === "PICKUP" && !v.customerVehicle)) ctx.addIssue({ code: "custom", path: ["vehicleId"], message: "Pilih kendaraan delivery atau identitas kendaraan pickup." });
  if (v.kind === "DELIVERY" && (v.mode !== "DELIVERY" && v.vehicleId || v.mode !== "PICKUP" && v.customerVehicle)) ctx.addIssue({ code: "custom", path: ["vehicleId"], message: "Referensi kendaraan tidak sesuai jalur delivery." });
});
export const saveSchema = z.object({ payload: documentSchema, version: z.number().int().nonnegative() }).strict();
export const completionSchema = z.object({ effectiveAt: date, receiver: label, evidence, lines: z.array(z.object({ orderLineKey: id, accepted: quantity, rejected: quantity }).strict()).min(1).max(50) }).strict();
export const actionSchema = z.object({ action: z.enum(["submit", "verify", "approve", "reject", "dispatch", "pickup", "complete"]), version: z.number().int().positive(), reason: evidence, completion: completionSchema.optional() }).strict().superRefine((v, ctx) => {
  if (["complete", "pickup"].includes(v.action) !== !!v.completion) ctx.addIssue({ code: "custom", path: ["completion"], message: "Completion/pickup memerlukan quantity accepted/rejected dan bukti." });
});
export type DocumentInput = z.infer<typeof documentSchema>;
export type ConfigInput = z.infer<typeof configSchema>;
export type CompletionInput = z.infer<typeof completionSchema>;
