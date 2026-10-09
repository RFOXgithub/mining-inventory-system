import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { csvCell, reportTotals, parseReportFilter, weeklyBand, ReportRow } from "../src/features/core/reports";
import { filterSchema, reviewSchema } from "../src/features/core/schema";
import { syncSchema } from "../src/features/operations/sync";

test("official totals preserve exact decimals, UOM, event, plant and currency", () => {
  const row = { id: "a", sourceId: "a", reference: "a", date: "2026-09-01", plantId: "p", plant: "SC", event: "OUTPUT", status: "POSTED", customer: "", project: "", item: "", itemId: "", location: "", locationId: "", quantity: "0.1", uom: "M3", amount: null, currency: "", detail: "", metadata: {} } satisfies ReportRow;
  const totals = reportTotals([row, { ...row, quantity: "0.2" }, { ...row, quantity: "1", uom: "TON" }, { ...row, event: "DISPATCHED" }, { ...row, plantId: "bp", plant: "BP" }, { ...row, quantity: null, amount: "100000000000000000.01", currency: "IDR" }, { ...row, quantity: null, amount: "0.09", currency: "IDR" }, { ...row, quantity: null, amount: "1", currency: "USD" }]);
  assert.equal(totals.length, 6); assert.equal(totals.find(t => t.plant === "SC" && t.event === "OUTPUT" && t.uom === "M3" && !t.currency)?.quantity, "0.3"); assert.equal(totals.find(t => t.currency === "IDR")?.amount, "100000000000000000.1");
});
test("report filters enforce dates and export neutralizes spreadsheet formulas", () => {
  assert.equal(filterSchema.safeParse({ from: "2026-09-31", to: "2026-10-01" }).success, false);
  assert.equal(filterSchema.safeParse({ from: "2026-10-02", to: "2026-10-01" }).success, false);
  assert.equal(parseReportFilter(new URL("https://fixture/api/reports?category=fuel&from=2026-09-01&to=2026-09-30&snapshot=x")).category, "fuel");
  assert.equal(csvCell('=HYPERLINK("evil")'), '"\'=HYPERLINK(""evil"")"'); assert.equal(csvCell("-1.2"), '"-1.2"'); assert.equal(csvCell(" @evil"), '"\' @evil"');
  assert.deepEqual([1, 7, 8, 14, 15, 21, 22, 30].map(day => weeklyBand(`2026-09-${String(day).padStart(2, "0")}`)), ["M1", "M1", "M2", "M2", "M3", "M3", "M4", "M4"]);
});
test("sync packets allow draft payload only, stable UUID and no posted/payment commands", () => {
  const requestKey = randomUUID(), payload = { requestKey, kind: "SC", plantId: randomUUID(), effectiveAt: "2026-09-10T00:00:00Z", pic: "Fixture PIC", method: "Fixture method", evidence: "Fixture evidence", reason: "Fixture reason", inputs: [{ itemId: randomUUID(), locationId: randomUUID(), uomId: randomUUID(), quantity: "1" }], outputs: [{ itemId: randomUUID(), locationId: randomUUID(), uomId: randomUUID(), quantity: "1" }] }, packet = { clientDraftId: requestKey, deviceId: randomUUID(), clientUpdatedAt: "2026-09-10T00:00:00Z", version: 0, payload };
  assert.equal(syncSchema.safeParse(packet).success, true);
  for (const altered of [{ ...packet, action: "post" }, { ...packet, payment: {} }, { ...packet, clientDraftId: randomUUID() }, { ...packet, payload: { ...payload, kind: "BLENDING" } }]) assert.equal(syncSchema.safeParse(altered).success, false);
  assert.equal(reviewSchema.safeParse({ domain: "OPERATIONS", id: randomUUID(), version: 1, reviewHash: "a".repeat(64), action: "post", reason: "Fixture reason" }).success, false);
});
