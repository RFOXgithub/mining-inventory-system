import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { calculateInvoice, dueDate, aging, asOfEnd, settlement } from "../src/features/finance/calculations";
import { projectInvoice, projectReceipt } from "../src/features/finance/query";
import { assertFinancialTimeline } from "../src/features/finance/service";
import { configSchema, dateOnly, saveSchema } from "../src/features/finance/schema";
const D = Prisma.Decimal;
const tax = { rate: "10", calculation: "EXCLUSIVE" as const, base: "ITEMS" as const, rounding: "HALF_UP" as const, roundAt: "TOTAL" as const };
test("invoice supports explicit exclusive/inclusive bases and rounding without floating-point loss", () => {
  const lines = [{ role: "ITEM", quantity: "2", unitPrice: "100" }, { role: "FREIGHT", quantity: "1", unitPrice: "50" }];
  assert.equal(calculateInvoice(lines, tax).total, "270");
  assert.equal(calculateInvoice(lines, { ...tax, base: "ITEMS_FREIGHT" }).total, "275");
  const inclusive = calculateInvoice([{ role: "ITEM", quantity: "1", unitPrice: "110" }], { ...tax, calculation: "INCLUSIVE" });
  assert.equal(inclusive.subtotal, "100"); assert.equal(inclusive.tax, "10"); assert.equal(inclusive.total, "110");
  const tiny = Array.from({ length: 2 }, () => ({ role: "ITEM", quantity: "1", unitPrice: "0.05" }));
  assert.equal(calculateInvoice(tiny, { ...tax, roundAt: "LINE" }).tax, "0.02"); assert.equal(calculateInvoice(tiny, tax).tax, "0.01");
  assert.equal(calculateInvoice([{ role: "ITEM", quantity: "1", unitPrice: "9007199254740993.11" }], { ...tax, rate: "0", calculation: "NONE" }).total, "9007199254740993.11");
});
test("receipt headers never reduce invoice outstanding; only allocation and verified PPh events settle", () => {
  const events = [{ kind: "INVOICE", invoiceId: "inv", receiptId: null, amount: new D(100) }, { kind: "RECEIPT", invoiceId: null, receiptId: "receipt", amount: new D(200) }, { kind: "ALLOCATION", invoiceId: "inv", receiptId: "receipt", amount: new D(30) }, { kind: "PPH", invoiceId: "inv", receiptId: null, amount: new D(20) }];
  assert.equal(projectInvoice("inv", events).outstanding, "50"); assert.equal(projectReceipt("receipt", events).unallocated, "170");
  assert.equal(settlement("100", "0", "0").paymentStatus, "Issued"); assert.equal(settlement("100", "80", "20").paymentStatus, "Paid"); assert.throws(() => settlement("100", "81", "20"));
});
test("dated settlement rejects backdating that overspends a later event", () => {
  const rows = [{ kind: "INVOICE", amount: new D(100), effectiveAt: new Date("2026-09-01"), sequence: BigInt(1) }, { kind: "ALLOCATION", amount: new D(80), effectiveAt: new Date("2026-09-20"), sequence: BigInt(2) }];
  assert.throws(() => assertFinancialTimeline(rows, [{ kind: "PPH", amount: new D(30), effectiveAt: new Date("2026-09-10"), eventKey: "candidate" }], false), /over-allocation/);
  assert.doesNotThrow(() => assertFinancialTimeline(rows, [{ kind: "PPH", amount: new D(20), effectiveAt: new Date("2026-09-10"), eventKey: "candidate" }], false));
});
test("due dates and as-of aging use calendar days and WIB day boundaries", () => {
  assert.equal(dueDate("2026-10-01", 30), "2026-10-31"); assert.equal(dueDate("2024-02-28", 1), "2024-02-29");
  assert.equal(asOfEnd("2026-10-01").toISOString(), "2026-10-01T17:00:00.000Z");
  for (const [days, bucket] of [[-1, "Belum Jatuh Tempo"], [0, "Jatuh Tempo Hari Ini"], [30, "0–30"], [31, "31–60"], [60, "31–60"], [61, "61–90"], [90, "61–90"], [91, ">90"]] as const) assert.equal(aging("2026-01-01", dueDate("2026-01-01", days)).bucket, bucket);
  assert.equal(aging(null, "2026-10-01").days, null); assert.equal(dateOnly.safeParse("2026-02-29").success, false);
});
test("financial inputs reject client payment status, negative money and invented no-tax rate", () => {
  assert.equal(saveSchema.safeParse({ payload: { kind: "INVOICE", status: "Paid" }, version: 0 }).success, false);
  assert.equal(configSchema.shape.payload.safeParse({ kind: "TAX", commercialTreatment: "Fixture explicit", currency: "IDR", rate: "10", calculation: "NONE", base: "ITEMS", rounding: "HALF_UP", roundAt: "TOTAL" }).success, false);
});
