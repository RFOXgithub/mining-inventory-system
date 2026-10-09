import test from "node:test";
import assert from "node:assert/strict";
import { AccessActor, allowedActions, can, canApprove } from "../src/lib/access";
import { assignmentSchema } from "../src/features/access/schema";
import { effectivePermissions, sessionIsCurrent } from "../src/features/access/service";
import { assertSameOrigin } from "../src/lib/domain-error";
import { conversionSchema, normalizeAlias } from "../src/features/masters/schema";

const id = "123e4567-e89b-42d3-a456-426614174000", other = "223e4567-e89b-42d3-a456-426614174000";
const actor = (roles: string[], functions: string[], permissions: string[]): AccessActor => ({ userId: id, roles, functions, permissions, plantIds: [id], allPlants: false });

test("SUPERADMIN business grants and legacy wildcard cannot bypass the role ceiling", () => {
  const admin = actor(["SUPERADMIN", "ADMIN"], ["PC"], ["*", "inventory.adjust", "inventory.approve", "users.manage"]);
  assert.equal(can(admin, "inventory.adjust", id), false);
  assert.equal(can(admin, "inventory.approve", id), false);
  assert.equal(can(admin, "users.manage"), true);
  assert.equal(can(actor(["SUPER_ADMIN"], [], ["*"]), "users.manage"), false);
});
test("ADMIN PC and Finance require both a function and an explicit action grant", () => {
  assert.equal(can(actor(["ADMIN"], ["PC"], ["finance.manage"]), "finance.manage", id), false);
  assert.equal(can(actor(["ADMIN"], ["FINANCE"], ["inventory.adjust"]), "inventory.adjust", id), false);
  assert.equal(can(actor(["ADMIN"], ["PC"], []), "master.material.create", id), false);
  assert.equal(can(actor(["ADMIN"], ["PC"], ["master.material.create"]), "master.material.create", id), true);
});
test("plant-scoped access denies another plant and maker-checker survives role promotion", () => {
  const manager = actor(["MANAGER"], [], ["inventory.approve"]);
  assert.equal(can(manager, "inventory.approve", other), false);
  assert.equal(canApprove(manager, "inventory.approve", id, id), false);
  assert.equal(canApprove(manager, "inventory.approve", other, id), true);
});
test("assignment validation rejects invented roles, wildcard, mixed scope and non-ADMIN functions", () => {
  const base = { role: "ADMIN", functions: ["PC"], permissions: ["master.material.read"], allPlants: false, plantIds: [id] };
  assert.equal(assignmentSchema.safeParse(base).success, true);
  for (const change of [{ role: "SUPERVISOR" }, { permissions: ["*"] }, { role: "HSE" }, { allPlants: true }, { permissions: ["finance.manage"] }]) assert.equal(assignmentSchema.safeParse({ ...base, ...change }).success, false);
  assert.deepEqual(effectivePermissions(["ADMIN"], ["PC"], ["*", "finance.manage", "inventory.read"]), ["inventory.read"]);
  assert.equal(allowedActions("HSE").includes("sales.read"), false);
});
test("session version and account status revoke an otherwise signed session", () => {
  const user = { active: true, status: "ACTIVE", lockedUntil: null, sessionVersion: 2 };
  assert.equal(sessionIsCurrent(user, 2), true);
  assert.equal(sessionIsCurrent(user, 1), false);
  assert.equal(sessionIsCurrent(user, undefined), false);
  assert.equal(sessionIsCurrent({ ...user, active: false }, 2), false);
  assert.equal(sessionIsCurrent({ ...user, status: "LOCKED" }, 2), false);
});
test("cookie mutations reject cross-origin and missing-origin requests", () => {
  assert.doesNotThrow(() => assertSameOrigin(new Request("https://example.test/api/users", { method: "POST", headers: { origin: "https://example.test" } })));
  for (const origin of ["https://attacker.test", undefined]) {
    const headers = new Headers(); if (origin) headers.set("origin", origin);
    assert.throws(() => assertSameOrigin(new Request("https://example.test/api/users", { method: "POST", headers })), /Asal/);
  }
});
test("conversion accepts exact decimal factors without inventing packaging/density and aliases retain meaning", () => {
  const input = { fromUomId: id, toUomId: other, factor: "0.123456789012", effectiveFrom: "2026-10-02T00:00:00Z" };
  assert.equal(conversionSchema.safeParse(input).success, true);
  assert.equal(conversionSchema.safeParse({ ...input, factor: "0" }).success, false);
  assert.equal(conversionSchema.safeParse({ ...input, factor: "31", verificationStatus: "VERIFIED" }).success, false);
  assert.notEqual(normalizeAlias("Sirtu"), normalizeAlias("Sirtu Jaw"));
});
