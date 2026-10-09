import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { stockDocumentSchema } from "../src/features/inventory/ledger-schema";
import { timelineBalance, jakartaMonth } from "../src/features/inventory/ledger-service";
const D = Prisma.Decimal;
const date = new Date("2026-09-01T00:00:00Z"), later = new Date("2026-09-02T00:00:00Z");
test("timeline checks historical and future negatives with exact decimals", () => {
  const rows = [{ quantity: new D("0.3"), effectiveAt: date, createdAt: date, eventKey: "1" }, { quantity: new D("-0.2"), effectiveAt: later, createdAt: later, eventKey: "2" }];
  assert.equal(timelineBalance(rows, [{ quantity: new D("-0.1"), effectiveAt: date }]).toString(), "0");
  assert.throws(() => timelineBalance(rows, [{ quantity: new D("-0.100001"), effectiveAt: date }]), /negatif/);
  assert.throws(() => timelineBalance([], [{ quantity: new D(-1), effectiveAt: date }, { quantity: new D(2), effectiveAt: later }]), /negatif/);
  const large = new D("999999999999999999.999999");
  assert.equal(timelineBalance([{ quantity: large, effectiveAt: date, sequence: BigInt(1) }], [{ quantity: large.negated(), effectiveAt: later }]).toString(), "0");
});
test("stock validators reject direct posted fields, duplicate lines and missing migration provenance", () => {
  const row = { itemId: randomUUID(), locationId: randomUUID(), quantity: "0.000001" };
  const base = { requestKey: randomUUID(), kind: "RECEIPT", sourceName: "Quarry fixture", sourceType: "QUARRY", effectiveAt: date.toISOString(), reason: "Receipt fixture", evidence: "Document fixture", lines: [row] };
  assert.equal(stockDocumentSchema.safeParse(base).success, true);
  for (const change of [{ status: "POSTED" }, { lines: [row, row] }, { kind: "OPENING" }, { kind: "TRANSFER" }, { lines: [{ ...row, quantity: "0.0000001" }] }]) assert.equal(stockDocumentSchema.safeParse({ ...base, ...change }).success, false);
  assert.equal(stockDocumentSchema.safeParse({ ...base, kind: "REVERSAL", reversalOfId: randomUUID(), lines: [] }).success, true);
});
test("period scope uses Jakarta boundaries rather than host timezone", () => {
  assert.equal(jakartaMonth(new Date("2026-09-30T17:00:00Z")), "2026-10");
  assert.equal(jakartaMonth(new Date("2026-09-30T16:59:59Z")), "2026-09");
});
