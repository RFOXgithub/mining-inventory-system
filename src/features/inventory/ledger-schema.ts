import { z } from "zod";

const decimal = z.string().regex(/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?$/, "Gunakan angka desimal, maksimal 6 angka pecahan.");
const line = z.object({ itemId: z.string().uuid(), locationId: z.string().uuid(), destinationId: z.string().uuid().optional(), quantity: decimal }).strict();
export const stockDocumentSchema = z.object({
  requestKey: z.string().uuid(), kind: z.enum(["RECEIPT", "TRANSFER", "OPENING", "LEGACY_IMPORT", "OPNAME", "ADJUSTMENT", "INTERNAL_ISSUE", "REVERSAL"]),
  effectiveAt: z.string().datetime({ offset: true }), reason: z.string().trim().min(5).max(1000), evidence: z.string().trim().min(5).max(1000),
  sourceName: z.string().trim().min(3).max(200).optional(), checksum: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  sourceType: z.enum(["SUPPLIER", "QUARRY", "INTERNAL"]).optional(),
  reversalOfId: z.string().uuid().optional(), lines: z.array(line).max(50),
}).strict().superRefine((data, ctx) => {
  if (data.kind === "REVERSAL") {
    if (!data.reversalOfId || data.lines.length) ctx.addIssue({ code: "custom", message: "Reversal harus memakai dokumen sumber tanpa baris manual." });
  } else if (!data.lines.length || data.reversalOfId) ctx.addIssue({ code: "custom", message: "Baris sumber wajib diisi." });
  if (["OPENING", "LEGACY_IMPORT"].includes(data.kind) && (!data.sourceName || !data.checksum)) ctx.addIssue({ code: "custom", message: "Migration memerlukan nama sumber dan checksum SHA-256." });
  if (data.kind === "RECEIPT" && (!data.sourceName || !data.sourceType)) ctx.addIssue({ code: "custom", path: ["sourceName"], message: "Jenis dan nama sumber supplier/quarry/internal receipt wajib diisi." });
  const seen = new Set<string>();
  data.lines.forEach((row, index) => {
    const key = `${row.locationId}:${row.itemId}`;
    if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["lines", index], message: "Material/lokasi tidak boleh duplikat." });
    seen.add(key);
    if (data.kind === "TRANSFER" ? !row.destinationId || row.destinationId === row.locationId : !!row.destinationId) ctx.addIssue({ code: "custom", path: ["lines", index, "destinationId"], message: "Lokasi tujuan transfer harus berbeda; transaksi lain tidak memakai tujuan." });
    const qty = Number(row.quantity);
    if (data.kind === "ADJUSTMENT" ? qty === 0 : ["OPNAME", "OPENING", "LEGACY_IMPORT"].includes(data.kind) ? qty < 0 : qty <= 0) ctx.addIssue({ code: "custom", path: ["lines", index, "quantity"], message: "Quantity tidak sesuai jenis transaksi." });
  });
});
export const stockActionSchema = z.object({ action: z.enum(["post", "approve", "reject", "finance"]), version: z.number().int().positive().optional(), reason: z.string().trim().min(5).max(1000) }).strict();
export const periodActionSchema = z.object({ plantId: z.string().uuid(), month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/), action: z.enum(["request-close", "request-reopen", "finance", "approve", "reject"]), version: z.number().int().nonnegative(), reason: z.string().trim().min(5).max(1000) }).strict();
