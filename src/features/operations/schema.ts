import { z } from "zod";

const id = z.string().uuid();
const note = z.string().trim().min(5).max(1000);
export const quantity = z.string().regex(/^\d{1,18}(\.\d{1,6})?$/, "Quantity maksimal 18 angka bulat dan 6 desimal.");
const positive = quantity.refine(v => /[1-9]/.test(v), "Quantity harus positif.");
export const processKind = z.enum(["SC", "BP", "AMP", "BLENDING"]);
export const runKind = z.enum(["SC", "BP", "AMP", "BLENDING", "FUEL_RECEIPT", "FUEL_USAGE", "FUEL_TRANSFER"]);
export const materialLine = z.object({ itemId: id, locationId: id, uomId: id, quantity, conversionId: id.optional() }).strict();
const unique = (rows: { itemId: string; locationId: string }[]) => new Set(rows.map(r => `${r.itemId}:${r.locationId}`)).size === rows.length;
export const runSchema = z.object({
  requestKey: id, kind: runKind, plantId: id, effectiveAt: z.string().datetime({ offset: true }),
  pic: z.string().trim().min(2).max(150), method: note, evidence: note, reason: note,
  batch: z.string().trim().max(100).default(""), quality: z.string().trim().max(500).default(""),
  inputs: z.array(materialLine.extend({ quantity: positive })).max(50).default([]),
  outputs: z.array(materialLine).max(50).default([]), mixVersionId: id.optional(), fuelUsageId: id.optional(),
  fuel: z.object({ policyId: id, tankId: id, destinationId: id.optional(), liters: positive, assetId: id.optional(), purpose: z.enum(["PRODUCTION", "NON_PRODUCTION"]).optional(), sourceType: z.enum(["SUPPLIER", "QUARRY", "INTERNAL"]).optional(), sourceName: z.string().trim().min(3).max(150).optional() }).strict().optional(),
}).strict().superRefine((v, ctx) => {
  const fuel = v.kind.startsWith("FUEL_");
  if (fuel ? !v.fuel || v.inputs.length || v.outputs.length || v.mixVersionId || v.fuelUsageId : !!v.fuel || !v.inputs.length || !v.outputs.length) ctx.addIssue({ code: "custom", path: [fuel ? "fuel" : "inputs"], message: "Baris aktual tidak sesuai jenis transaksi." });
  if (!unique(v.inputs) || !unique(v.outputs)) ctx.addIssue({ code: "custom", path: ["inputs"], message: "Material/lokasi tidak boleh duplikat." });
  if (["BP", "AMP", "BLENDING"].includes(v.kind) && (!v.mixVersionId || v.outputs.length !== 1)) ctx.addIssue({ code: "custom", path: ["mixVersionId"], message: "Pilih satu hasil dan mix design version." });
  if (["BP", "AMP"].includes(v.kind) && (!v.batch || !v.quality)) ctx.addIssue({ code: "custom", path: ["batch"], message: "Batch dan mutu/referensi rekonsiliasi wajib." });
  if (v.fuelUsageId && v.kind !== "AMP") ctx.addIssue({ code: "custom", path: ["fuelUsageId"], message: "Referensi BBM proses hanya untuk AMP." });
  if (v.fuel) {
    if (v.kind === "FUEL_USAGE" && (!v.fuel.assetId || !v.fuel.purpose)) ctx.addIssue({ code: "custom", path: ["fuel"], message: "Pemakaian membutuhkan alat dan purpose." });
    if (v.kind === "FUEL_RECEIPT" && (!v.fuel.sourceType || !v.fuel.sourceName)) ctx.addIssue({ code: "custom", path: ["fuel"], message: "Receipt membutuhkan jenis dan nama sumber." });
    if (v.kind === "FUEL_TRANSFER" && (!v.fuel.destinationId || v.fuel.destinationId === v.fuel.tankId)) ctx.addIssue({ code: "custom", path: ["fuel"], message: "Pilih tangki tujuan berbeda." });
    if (v.kind !== "FUEL_TRANSFER" && v.fuel.destinationId || v.kind !== "FUEL_USAGE" && (v.fuel.assetId || v.fuel.purpose)) ctx.addIssue({ code: "custom", path: ["fuel"], message: "Referensi BBM tidak sesuai jenis." });
  }
});
export const saveRunSchema = z.object({ payload: runSchema, version: z.number().int().nonnegative() }).strict();
export const runActionSchema = z.object({ action: z.enum(["submit", "verify", "post", "reject"]), version: z.number().int().positive(), reason: note }).strict();
const component = z.object({ itemId: id, uomId: id, quantity: positive, conversionId: id.optional() }).strict();
const policy = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PRODUCT"), itemId: id, process: processKind }).strict(),
  z.object({ kind: z.literal("MIX"), process: processKind, outputItemId: id, outputUomId: id, components: z.array(component).min(1).max(50) }).strict(),
  z.object({ kind: z.literal("FUEL"), itemId: id }).strict(),
  z.object({ kind: z.literal("ASSET"), name: z.string().trim().min(2).max(150), identity: z.string().trim().min(3).max(150), ownership: z.string().trim().min(3).max(150), payer: z.string().trim().min(3).max(150), costResponsibility: z.string().trim().min(3).max(200), contract: z.string().trim().min(3).max(200), eligibleProduction: z.boolean() }).strict(),
]);
export const configSchema = z.object({ requestKey: id, plantId: id, code: z.string().trim().min(2).max(50), revision: z.number().int().positive(), effectiveFrom: z.string().datetime({ offset: true }), evidence: note, payload: policy }).strict();
export const configVerifySchema = z.object({ evidence: note }).strict();
export type RunInput = z.infer<typeof runSchema>;
export type ConfigInput = z.infer<typeof configSchema>;
