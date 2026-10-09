import { z } from "zod";
import { dateOnly } from "@/features/finance/schema";
export const categories = ["production", "consumption", "inventory", "fuel", "sales", "po", "delivery", "invoice", "payment", "aging", "closing", "approval"] as const;
export const filterSchema = z.object({ category: z.enum(categories).default("production"), from: dateOnly, to: dateOnly, plantId: z.string().uuid().optional(), locationId: z.string().uuid().optional(), itemId: z.string().uuid().optional(), customer: z.string().trim().max(100).optional(), project: z.string().trim().max(100).optional(), status: z.string().trim().max(40).optional() }).strict().refine(v => v.from <= v.to, { path: ["to"], message: "Akhir periode mendahului awal." });
export const reviewSchema = z.object({ domain: z.enum(["INVENTORY", "OPERATIONS", "COMMERCE", "FINANCE", "OP_CONFIG", "COM_CONFIG", "FIN_CONFIG"]), id: z.string().uuid(), version: z.number().int().positive(), reviewHash: z.string().regex(/^[a-f0-9]{64}$/), action: z.enum(["approve", "reject", "verify", "finance", "attest-pc", "attest-finance"]), reason: z.string().trim().min(5).max(1000) }).strict();
export type ReportFilter = z.infer<typeof filterSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
