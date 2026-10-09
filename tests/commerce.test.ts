import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { documentSchema, actionSchema } from "../src/features/commerce/schema";
import { freightAmount, lineAmount, remaining } from "../src/features/commerce/calculations";

test("commercial remaining rejects over-delivery with exact decimal boundaries", () => {
  assert.equal(remaining("10", "8", "2"), "0");
  assert.equal(remaining("0.3", "0.1", "0.2"), "0");
  assert.throws(() => remaining("10", "8", "2.000001"), /Over-delivery/);
});
test("price and freight preserve separate charge bases", () => {
  assert.equal(lineAmount("1.005", "100"), "100.5");
  assert.equal(lineAmount("0.333333", "100"), "33.33");
  assert.equal(freightAmount("PER_TRIP", "500", 2, "17"), "1000");
  assert.equal(freightAmount("PER_UNIT", "500", 2, "17"), "8500");
  assert.equal(freightAmount("NONE", "0", 2, "17"), "0");
});
test("cash SO may omit quotation/PO; credit and pickup require explicit sources/proof", () => {
  const source = { kind: "SO", requestKey: randomUUID(), plantId: randomUUID(), partyId: randomUUID(), effectiveAt: "2026-09-01T00:00:00Z", evidence: "Fixture evidence", reason: "Fixture reason", payment: "CASH", paymentTerm: "Fixture cash terms", freight: { mode: "PICKUP", term: "Fixture LOCO", basis: "NONE", rate: "0", internalRate: "0" }, lines: [{ key: randomUUID(), itemId: randomUUID(), uomId: randomUUID(), priceId: randomUUID(), quantity: "1", unitPrice: "100" }] };
  assert.equal(documentSchema.safeParse(source).success, true);
  assert.equal(documentSchema.safeParse({ ...source, payment: "CREDIT" }).success, false);
  assert.equal(documentSchema.safeParse({ ...source, payment: "CREDIT", poId: randomUUID() }).success, true);
  assert.equal(documentSchema.safeParse({ ...source, status: "APPROVED" }).success, false);
  assert.equal(documentSchema.safeParse({ ...source, lines: [source.lines[0], source.lines[0]] }).success, false);
  assert.equal(actionSchema.safeParse({ action: "pickup", version: 1, reason: source.reason }).success, false);
});
