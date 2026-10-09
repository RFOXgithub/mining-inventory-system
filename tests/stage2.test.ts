import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { allowedActions, can, AccessActor } from "../src/lib/access";
import { depreciationAmount, nextMonth } from "../src/features/stage2/depreciation";
import { configSchema, examSchema, syncSchema } from "../src/features/stage2/schema";
import { fileType } from "../src/features/stage2/files";
import { digest } from "../src/features/stage2/common";
const p = { kind: "ASSET_FINANCE" as const, assetId: randomUUID(), cost: "1200", residual: "200", lifeMonths: 2, startDate: "2026-08-16", firstMonth: "DAILY_ACTUAL" as const, openingMonth: "2026-08", openingAccumulated: "0", currency: "IDR", decimals: 6 };
test("straight-line actual days, residual cap and next-month activation", () => {
  assert.equal(depreciationAmount(p, "2026-08", new Prisma.Decimal(0)).amount.toString(), "258.064516");
  const capped = depreciationAmount(p, "2026-09", new Prisma.Decimal("999.99")); assert.equal(capped.amount.toString(), "0.01"); assert.equal(capped.bookAfter.toString(), "200");
  assert.equal(depreciationAmount({ ...p, firstMonth: "NEXT_MONTH" }, "2026-08", new Prisma.Decimal(0)).amount.toString(), "0"); assert.equal(nextMonth("2026-12"), "2027-01");
  assert.throws(() => depreciationAmount(p, "2026-09", new Prisma.Decimal(1001)), /residu/);
});
test("medical permission ceiling excludes Manager, Director, PC, Finance and technical multi-role", () => {
  for (const role of ["MANAGER", "DIREKTUR", "ADMIN", "SUPERADMIN"]) { const actor: AccessActor = { userId: randomUUID(), roles: [role], functions: ["PC", "FINANCE"], permissions: ["health.read", "health.manage", "health.verify"], plantIds: [], allPlants: true }; for (const permission of actor.permissions) assert.equal(can(actor, permission), false); }
  const a: AccessActor = { userId: randomUUID(), roles: ["HSE"], functions: [], permissions: allowedActions("HSE"), plantIds: ["permitted"], allPlants: false };
  assert.equal(can(a, "health.read", "permitted"), true); assert.equal(can(a, "health.read", "foreign"), false); assert.equal(can({ ...a, roles: ["SUPERADMIN", "HSE"] }, "health.read"), false); assert.equal(can({ ...a, permissions: [] }, "health.read"), false);
});
test("company letter scheme is explicit; offline packet cannot contain examinations", () => {
  const exam = { requestKey: randomUUID(), plantId: randomUUID(), workerId: randomUUID(), kind: "WCU", examAt: "2026-09-01T00:00:00Z", validUntil: "2026-09-02T00:00:00Z", workStatus: "FIT", measurements: [{ label: "Actual exam", value: "120", unit: "actual" }], notes: "Private clinical data", fileIds: [] };
  assert.equal(examSchema.safeParse(exam).success, true); assert.equal(syncSchema.safeParse({ clientDraftId: exam.requestKey, deviceId: randomUUID(), clientUpdatedAt: exam.examAt, version: 0, payload: exam }).success, false);
  assert.equal(configSchema.safeParse({ requestKey: randomUUID(), plantId: randomUUID(), code: "TYPE", revision: 1, effectiveFrom: exam.examAt, evidence: "Fixture verified only", payload: { kind: "LETTER_TYPE", name: "Letter", displayCode: "XX", aliases: [], format: "{code}/{year}", scope: "TYPE", reset: "YEAR", start: 1, padding: 4, approvalRequired: true } }).success, false);
});
test("private attachments reject executable formats and check actual signatures", () => { assert.equal(fileType(Buffer.from("%PDF-1.7\nfixture")), "application/pdf"); assert.throws(() => fileType(Buffer.from("<svg onload='alert(1)'>")), /signature/); });
test("Stage 2 snapshots survive JSONB property ordering but preserve ordered lines and changed values", () => { const a = { amount: "100", parameters: { life: 3, cost: "300" }, rows: ["first", "second"] }; assert.equal(digest(a), digest({ rows: a.rows, parameters: { cost: "300", life: 3 }, amount: "100" })); assert.notEqual(digest(a), digest({ ...a, amount: "101" })); assert.notEqual(digest(a), digest({ ...a, rows: ["second", "first"] })); });
