import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runSchema, configSchema } from "../src/features/operations/schema";
import { exactStockQuantity, standardFactor, fuelKpi } from "../src/features/operations/calculations";
import { operationHash } from "../src/features/operations/service";

test("conversion is exact; density and packaging are never inferred", () => {
  assert.equal(exactStockQuantity("123.456", "0.001").toString(), "0.123456");
  assert.equal(standardFactor("TON", "KG"), "1000");
  assert.equal(standardFactor("TON", "M3"), undefined);
  assert.equal(standardFactor("JERIGEN", "L"), undefined);
  assert.throws(() => exactStockQuantity("0.000001", "0.001"), /presisi/);
  assert.throws(() => exactStockQuantity("999999999999999999", "1000"), /presisi/);
});
test("fuel KPI uses actual liters/output and returns N/A for zero", () => {
  assert.equal(fuelKpi("30", "10").ratio, "3"); assert.equal(fuelKpi("1", "3").ratio, "0.333333");
  assert.deepEqual(fuelKpi("30", "0"), { ratio: null, exception: "Output nol: N/A" });
});
test("snapshot survives JSONB key ordering while detecting changed actual quantities", () => {
  const source = { lines: [{ quantity: "10.123456", itemId: "Fixture" }], output: "5", asset: { payer: "Fixture payer", eligibleProduction: true } };
  const stored = { asset: { eligibleProduction: true, payer: "Fixture payer" }, output: "5", lines: [{ itemId: "Fixture", quantity: "10.123456" }] };
  assert.equal(operationHash(source), operationHash(stored));
  assert.notEqual(operationHash(source), operationHash({ ...stored, output: "6" }));
});
test("operational contracts separate actual materials, blending, and fuel", () => {
  const line = () => ({ itemId: randomUUID(), locationId: randomUUID(), uomId: randomUUID(), quantity: "10" });
  const source = { requestKey: randomUUID(), kind: "SC", plantId: randomUUID(), effectiveAt: "2026-09-01T00:00:00Z", pic: "Fixture PIC", method: "Fixture measurement", evidence: "Fixture document", reason: "Fixture source", inputs: [line()], outputs: [line()] };
  assert.equal(runSchema.safeParse(source).success, true);
  assert.equal(runSchema.safeParse({ ...source, status: "POSTED" }).success, false);
  assert.equal(runSchema.safeParse({ ...source, inputs: [source.inputs[0], source.inputs[0]] }).success, false);
  assert.equal(runSchema.safeParse({ ...source, kind: "BP" }).success, false);
  assert.equal(runSchema.safeParse({ ...source, kind: "BLENDING", mixVersionId: randomUUID() }).success, true);
  assert.equal(runSchema.safeParse({ ...source, fuelUsageId: randomUUID() }).success, false);
  const fuel = { ...source, kind: "FUEL_USAGE", inputs: [], outputs: [], fuel: { policyId: randomUUID(), tankId: randomUUID(), liters: "5", assetId: randomUUID(), purpose: "PRODUCTION" } };
  assert.equal(runSchema.safeParse(fuel).success, true);
  assert.equal(runSchema.safeParse({ ...fuel, inputs: source.inputs }).success, false);
  assert.equal(runSchema.safeParse({ ...fuel, fuel: { ...fuel.fuel, liters: "0" } }).success, false);
  assert.equal(configSchema.safeParse({ requestKey: randomUUID(), plantId: randomUUID(), code: "Fixture", revision: 1, effectiveFrom: source.effectiveAt, evidence: source.evidence, payload: { kind: "ASSET", name: "Fixture", identity: "Fixture", ownership: "Fixture", payer: "Fixture", costResponsibility: "Fixture", contract: "Fixture" } }).success, false);
});
