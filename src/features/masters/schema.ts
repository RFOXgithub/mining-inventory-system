import { z } from "zod";

const code = z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_.-]+$/, "Kode hanya huruf, angka, titik, garis dan underscore.").transform(v => v.toUpperCase());
const name = z.string().trim().min(2).max(150);
export const idSchema = z.string().uuid();
const plants = z.array(idSchema).min(1).max(100).refine(v => new Set(v).size === v.length, "Plant tidak boleh duplikat.");
export const materialSchema = z.object({
  code, name, kind: z.enum(["MATERIAL", "PRODUCT", "SERVICE"]), category: name,
  specification: z.string().trim().max(2000).default(""), primaryUomId: idSchema, plantIds: plants,
}).strict();
export const materialEditSchema = materialSchema.extend({ version: z.number().int().positive(), reason: z.string().trim().min(5).max(500) });
export const verifySchema = z.object({ action: z.literal("verify"), version: z.number().int().positive(), evidence: z.string().trim().min(5).max(1000) }).strict();
export const deactivateSchema = z.object({ action: z.literal("deactivate"), version: z.number().int().positive(), reason: z.string().trim().min(5).max(500) }).strict();
export const aliasSchema = z.object({ name }).strict();
export const childVerifySchema = z.object({ action: z.literal("verify"), id: idSchema, evidence: z.string().trim().min(5).max(1000) }).strict();
export const conversionSchema = z.object({
  fromUomId: idSchema, toUomId: idSchema,
  factor: z.string().regex(/^\d{1,12}(\.\d{1,12})?$/, "Faktor decimal maksimal 12 angka bulat dan 12 desimal.").refine(v => /[1-9]/.test(v), "Faktor harus lebih dari nol."),
  effectiveFrom: z.string().datetime({ offset: true }),
}).strict().refine(v => v.fromUomId !== v.toUomId, { path: ["toUomId"], message: "UOM asal dan tujuan harus berbeda." });
export const uomSchema = z.object({ code, name, dimension: z.enum(["UNKNOWN", "MASS", "VOLUME", "COUNT", "TIME", "SERVICE"]) }).strict();
export const plantSchema = z.object({ code, name, kind: z.enum(["SC", "BP", "AMP"]) }).strict();
export const plantEditSchema = plantSchema.extend({ version: z.number().int().positive(), reason: z.string().trim().min(5).max(500) });
export const locationSchema = z.object({ plantId: idSchema, code, name, kind: z.enum(["STOCKPILE", "WAREHOUSE", "TANK", "QUARRY"]), stockpileId: idSchema.nullable().default(null) }).strict();
export const locationEditSchema = locationSchema.omit({ plantId: true }).extend({ version: z.number().int().positive(), reason: z.string().trim().min(5).max(500) });

export function normalizeAlias(value: string) { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID"); }
