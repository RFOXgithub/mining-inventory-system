import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ChildProcess, execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { PrismaClient } from "@prisma/client";
import { AccessActor, allowedActions } from "../src/lib/access";
import { createUser, updateUser, sessionIsCurrent } from "../src/features/access/service";
import { createMaterial, changeMaterial, changeMaterialChild } from "../src/features/masters/service";
import { createPlant, createLocation, changeLocation } from "../src/features/masters/locations-service";

describe("S1 migrations and domain workflows on an isolated PostgreSQL schema", { skip: process.env.RUN_FOUNDATION_DB_TESTS !== "1", concurrency: false }, () => {
  const schema = `quarryflow_s1_test_${randomUUID().replaceAll("-", "")}`;
  let admin: PrismaClient, client: PrismaClient, temporary: string, created = false, datasourceUrl = "";
  let server: ChildProcess | undefined;
  const distDir = `.next-${schema}`;
  let tsconfigBefore: Buffer | undefined, nextEnvBefore: Buffer | undefined;
  const legacyUser = randomUUID(), legacyProduct = randomUUID(), legacyMaterial = randomUUID(), legacyStockpile = randomUUID();
  let technical: AccessActor, pc: AccessActor, manager: AccessActor, scId: string, bpId: string, uomId: string;
  const migration = "202610020001_access_masters";

  before(async () => {
    if (!process.env.DATABASE_URL) process.loadEnvFile();
    const source = new URL(process.env.DATABASE_URL!);
    assert.match(schema, /^quarryflow_s1_test_[a-f0-9]{32}$/);
    admin = new PrismaClient();
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    source.searchParams.set("schema", schema);
    datasourceUrl = source.toString(); client = new PrismaClient({ datasourceUrl });
    temporary = mkdtempSync(path.join(tmpdir(), "quarryflow-s1-migrations-"));
    writeFileSync(path.join(temporary, "schema.prisma"), readFileSync("prisma/schema.prisma"));
    for (const directory of readdirSync("prisma/migrations")) if (directory < migration) cpSync(path.join("prisma/migrations", directory), path.join(temporary, "migrations", directory), { recursive: true });
    const deploy = (file: string) => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", file], { env: { ...process.env, DATABASE_URL: datasourceUrl }, stdio: "pipe", timeout: 120000 });
    deploy(path.join(temporary, "schema.prisma"));
    const current = await client.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
    assert.equal(current[0].schema, schema);
    await client.$executeRaw`INSERT INTO "Role" (id,code,name) VALUES (${randomUUID()}::uuid,'SUPER_ADMIN','Legacy technical')`;
    await client.$executeRaw`INSERT INTO "User" (id,email,"passwordHash",name,"updatedAt") VALUES (${legacyUser}::uuid,'legacy@example.test','fixture','Legacy technical',CURRENT_TIMESTAMP)`;
    await client.$executeRaw`INSERT INTO "UserRole" ("userId","roleId") SELECT ${legacyUser}::uuid,id FROM "Role" WHERE code='SUPER_ADMIN'`;
    await client.$executeRaw`INSERT INTO "Product" (id,code,name,category,unit,"sellingPrice","updatedAt") VALUES (${legacyProduct}::uuid,'KEEP-P','Split 1/2','Legacy','TON',12.34,CURRENT_TIMESTAMP)`;
    await client.$executeRaw`INSERT INTO "Material" (id,code,name,unit) VALUES (${legacyMaterial}::uuid,'KEEP-M','Sirtu Jaw','TON')`;
    await client.$executeRaw`INSERT INTO "Stockpile" (id,code,name,type,location,"productId") VALUES (${legacyStockpile}::uuid,'KEEP-ST','Legacy stock','FINISHED_GOODS','Original location',${legacyProduct}::uuid)`;
    await client.$executeRaw`INSERT INTO "InventoryTransaction" (id,number,"stockpileId","productId",type,direction,quantity,"referenceType","referenceId","balanceAfter","processingKey","createdBy") VALUES (${randomUUID()}::uuid,'KEEP-INV',${legacyStockpile}::uuid,${legacyProduct}::uuid,'PRODUCTION_OUTPUT','IN',100,'LEGACY',${legacyProduct}::uuid,100,'keep:ledger',${legacyUser}::uuid)`;
    deploy("prisma/schema.prisma");
    technical = { userId: legacyUser, roles: ["SUPERADMIN"], functions: [], permissions: allowedActions("SUPERADMIN"), plantIds: [], allPlants: false };
    const make = async (role: string, functions: string[]) => {
      const permissions = allowedActions(role, functions);
      const user = await createUser(client, technical, { name: `${role} fixture`, email: `${randomUUID()}@example.test`, password: "Fixture-only-password-2026", assignment: { role, functions, permissions, plantIds: [], allPlants: true } });
      return { userId: user.id, roles: [role], functions, permissions, plantIds: [], allPlants: true };
    };
    pc = await make("ADMIN", ["PC"]); manager = await make("MANAGER", []);
    scId = (await createPlant(client, pc, { code: "TEST-SC", name: "SC fixture", kind: "SC" })).id;
    bpId = (await createPlant(client, pc, { code: "TEST-BP", name: "BP fixture", kind: "BP" })).id;
    await changeLocation(client, manager, "plant", scId, { action: "verify", version: 1, evidence: "Fixture operational approval" });
    await changeLocation(client, manager, "plant", bpId, { action: "verify", version: 1, evidence: "Fixture operational approval" });
    uomId = (await client.uom.findUniqueOrThrow({ where: { code: "TON" } })).id;
  });

  after(async () => {
    if (server?.pid && server.exitCode === null) {
      if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "pipe" }); else server.kill("SIGTERM");
    }
    if (tsconfigBefore) writeFileSync("tsconfig.json", tsconfigBefore);
    if (nextEnvBefore) writeFileSync("next-env.d.ts", nextEnvBefore);
    const generated = path.resolve(distDir);
    assert.equal(path.dirname(generated), process.cwd()); assert.ok(path.basename(generated).startsWith(".next-quarryflow_s1_test_"));
    rmSync(generated, { force: true, recursive: true });
    await client?.$disconnect();
    if (created) { assert.match(schema, /^quarryflow_s1_test_[a-f0-9]{32}$/); await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); }
    await admin?.$disconnect();
    if (temporary) { assert.equal(path.resolve(path.dirname(temporary)), path.resolve(tmpdir())); assert.ok(path.basename(temporary).startsWith("quarryflow-s1-migrations-")); rmSync(temporary, { recursive: true }); }
  });

  test("migration preserves legacy records, balances and labels without verified aliases or invented plant", async () => {
    const product = await client.product.findUniqueOrThrow({ where: { id: legacyProduct } });
    assert.equal(product.name, "Split 1/2"); assert.equal(product.sellingPrice.toString(), "12.34");
    const item = await client.catalogItem.findUniqueOrThrow({ where: { legacyProductId: legacyProduct }, include: { aliases: true, plants: true } });
    assert.equal(item.verificationStatus, "UNVERIFIED"); assert.equal(item.name, product.name); assert.equal(item.aliases.length, 0); assert.equal(item.plants.length, 0);
    assert.equal((await client.inventoryTransaction.findUniqueOrThrow({ where: { processingKey: "keep:ledger" } })).quantity.toString(), "100");
    const user = await client.user.findUniqueOrThrow({ where: { id: legacyUser }, include: { roles: { include: { role: true } } } });
    assert.equal(user.allPlants, false); assert.ok(user.roles.some(r => r.role.code === "SUPER_ADMIN")); assert.ok(user.roles.some(r => r.role.code === "SUPERADMIN")); assert.ok(!user.actionPermissions.includes("*"));
  });
  test("SUPERADMIN and Finance cannot write PC masters; foreign plant cannot be selected", async () => {
    const input = { code: "SECURE", name: "Secure material", kind: "MATERIAL", category: "Fixture", specification: "", primaryUomId: uomId, plantIds: [scId] };
    await assert.rejects(createMaterial(client, technical, input), /diizinkan/);
    await assert.rejects(createMaterial(client, { ...pc, functions: ["FINANCE"] }, input), /diizinkan/);
    await assert.rejects(createMaterial(client, { ...pc, allPlants: false, plantIds: [bpId] }, input), /diizinkan/);
    assert.equal(await client.catalogItem.count({ where: { code: "SECURE" } }), 0);
  });
  test("material, alias and decimal conversion workflow keeps versions and rejects own verification", async () => {
    const item = await createMaterial(client, pc, { code: "WORKFLOW", name: "Sirtu fixture", kind: "MATERIAL", category: "Fixture", primaryUomId: uomId, plantIds: [scId] });
    await assert.rejects(changeMaterial(client, { ...manager, userId: pc.userId }, item.id, { action: "verify", version: 1, evidence: "Attempt own verification" }), /Maker/);
    const verified = await changeMaterial(client, manager, item.id, { action: "verify", version: 1, evidence: "Verified specification fixture" }); assert.equal(verified.verificationStatus, "VERIFIED");
    const alias = await changeMaterialChild(client, pc, item.id, "aliases", { name: "  Alias   fixture " }) as { id: string; verificationStatus: string };
    assert.equal(alias.verificationStatus, "UNVERIFIED");
    await changeMaterialChild(client, manager, item.id, "aliases", { action: "verify", id: alias.id, evidence: "Alias mapping fixture" });
    const kg = await client.uom.findUniqueOrThrow({ where: { code: "KG" } });
    await assert.rejects(changeMaterialChild(client, pc, item.id, "conversions", { fromUomId: uomId, toUomId: kg.id, factor: "31", effectiveFrom: "2026-10-01T00:00:00Z" }), /definisi satuan/);
    const m3 = await client.uom.findUniqueOrThrow({ where: { code: "M3" } });
    const first = await changeMaterialChild(client, pc, item.id, "conversions", { fromUomId: uomId, toUomId: m3.id, factor: "0.123456789012", effectiveFrom: "2026-10-01T00:00:00Z" }) as { id: string; version: number };
    await changeMaterialChild(client, manager, item.id, "conversions", { action: "verify", id: first.id, evidence: "Exact factor fixture (not company data)" });
    const second = await changeMaterialChild(client, pc, item.id, "conversions", { fromUomId: uomId, toUomId: m3.id, factor: "0.2", effectiveFrom: "2026-11-01T00:00:00Z" }) as { version: number };
    assert.equal(second.version, 2); assert.equal((await client.uomConversion.findUniqueOrThrow({ where: { id: first.id } })).factor.toString(), "0.123456789012");
    await assert.rejects(changeMaterial(client, pc, item.id, { code: "WORKFLOW", name: "Changed fixture", kind: "MATERIAL", category: "Fixture", specification: "", primaryUomId: uomId, plantIds: [scId], version: 1, reason: "Stale version edit" }), /berubah/);
    const edited = await changeMaterial(client, pc, item.id, { code: "WORKFLOW", name: "Changed fixture", kind: "MATERIAL", category: "Fixture", specification: "", primaryUomId: uomId, plantIds: [scId], version: 2, reason: "Corrected specification fixture" }); assert.equal(edited.verificationStatus, "UNVERIFIED");
    assert.ok(await client.auditLog.count({ where: { module: "MASTER_MATERIAL", recordId: item.id } }) >= 6);
  });
  test("location scope and parent verification are enforced; legacy mapping preserves ledger", async () => {
    const location = await createLocation(client, pc, { plantId: scId, code: "TANK", name: "Tank fixture", kind: "TANK" });
    await assert.rejects(changeLocation(client, { ...pc, allPlants: false, plantIds: [bpId] }, "location", location.id, { code: "TANK", name: "Wrong plant", kind: "TANK", stockpileId: null, version: 1, reason: "Unauthorized edit fixture" }), /diizinkan/);
    await changeLocation(client, manager, "location", location.id, { action: "verify", version: 1, evidence: "Tank identity fixture" });
    const mapped = await createLocation(client, pc, { plantId: scId, code: "STOCK", name: "Mapped stock fixture", kind: "STOCKPILE", stockpileId: legacyStockpile });
    assert.equal(mapped.stockpileId, legacyStockpile); assert.equal((await client.inventoryTransaction.findUniqueOrThrow({ where: { processingKey: "keep:ledger" } })).balanceAfter.toString(), "100");
    await assert.rejects(changeLocation(client, pc, "plant", scId, { action: "deactivate", version: 2, reason: "Still referenced fixture" }), /lebih dahulu/);
  });
  test("concurrent material edits commit one version without partial mappings/audit", async () => {
    const item = await createMaterial(client, pc, { code: "RACE", name: "Concurrent fixture", kind: "MATERIAL", category: "Fixture", primaryUomId: uomId, plantIds: [scId] });
    const body = { code: "RACE", name: "Concurrent edit", kind: "MATERIAL", category: "Fixture", primaryUomId: uomId, plantIds: [scId], version: 1, reason: "Concurrent edit fixture" };
    const results = await Promise.allSettled([changeMaterial(client, pc, item.id, body), changeMaterial(client, pc, item.id, body)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await client.catalogItem.findUniqueOrThrow({ where: { id: item.id } })).version, 2);
    assert.equal(await client.catalogItemPlant.count({ where: { itemId: item.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { recordId: item.id, action: "UPDATE" } }), 1);
  });
  test("browser workflows, SSR/API forbidden states, and responsive layouts", { skip: !process.env.S1_PLAYWRIGHT_MODULE, timeout: 240000 }, async () => {
    const { chromium } = createRequire(path.resolve("package.json"))(process.env.S1_PLAYWRIGHT_MODULE!);
    const listener = createServer();
    await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(resolve => listener.close(() => resolve()));
    tsconfigBefore = readFileSync("tsconfig.json"); nextEnvBefore = readFileSync("next-env.d.ts");
    let logs = "";
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { env: { ...process.env, DATABASE_URL: datasourceUrl, QUARRYFLOW_TEST_DIST_DIR: distDir, NODE_ENV: "development" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout?.on("data", data => { logs = (logs + data).slice(-16000); }); server.stderr?.on("data", data => { logs = (logs + data).slice(-16000); });
    const baseURL = `http://localhost:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) { try { if ((await fetch(`${baseURL}/login`)).ok) { ready = true; break; } } catch { /* startup */ } await new Promise(resolve => setTimeout(resolve, 500)); }
    assert.ok(ready, "Isolated Next server did not start");
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Jakarta" });
      const page = await context.newPage(); page.setDefaultTimeout(45000);
      const login = async (userId: string) => {
        const user = await client.user.findUniqueOrThrow({ where: { id: userId } });
        await page.goto(`${baseURL}/login`); await page.getByLabel("Email *").fill(user.email); await page.getByLabel("Kata sandi *").fill("Fixture-only-password-2026"); await page.getByRole("button", { name: "Masuk ke StoneCrusher" }).click();
      };
      await login(pc.userId);
      await page.getByRole("heading", { name: "Material & UOM", exact: true }).waitFor();
      await page.getByRole("button", { name: "Material baru", exact: true }).click();
      await page.getByLabel("Kode", { exact: true }).fill("UI-MATERIAL"); await page.getByLabel("Nama resmi").fill("UI material fixture"); await page.getByLabel("Kategori", { exact: true }).fill("Fixture"); await page.getByLabel("UOM stok utama / satuan jasa").selectOption(uomId); await page.getByLabel("SC fixture", { exact: true }).check();
      await page.getByRole("button", { name: "Simpan draft", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "detached" });
      await page.getByRole("row").filter({ hasText: "UI material fixture" }).getByRole("button", { name: "Buka" }).click();
      await page.getByRole("button", { name: "Tambah alias", exact: true }).click(); await page.getByLabel("Nama alias").fill("UI alias fixture"); await page.getByRole("button", { name: "Simpan draft", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "detached" });
      await page.getByText("UI alias fixture", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Verifikasi", exact: true }).count(), 0);
      for (const width of [1440, 768, 390, 360]) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); assert.equal(overflow, false, `Material page overflow at ${width}`);
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${baseURL}/locations`); await page.getByRole("button", { name: "Plant baru", exact: true }).click(); await page.getByLabel("Kode", { exact: true }).fill("UI-AMP"); await page.getByLabel("Nama", { exact: true }).fill("UI AMP fixture"); await page.getByLabel("Jenis plant").selectOption("AMP"); await page.getByRole("button", { name: "Simpan draft", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "detached" });
      await page.getByRole("row").filter({ hasText: "UI AMP fixture" }).getByRole("button", { name: "Buka" }).click(); await page.getByRole("button", { name: "Lokasi / tangki baru", exact: true }).click(); await page.getByLabel("Kode", { exact: true }).fill("UI-TANK"); await page.getByLabel("Nama", { exact: true }).fill("UI Tank fixture"); await page.getByLabel("Jenis lokasi").selectOption("TANK"); await page.getByRole("button", { name: "Simpan draft", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "detached" }); await page.getByText("UI Tank fixture", { exact: true }).waitFor();
      await page.setViewportSize({ width: 390, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
      await page.goto(`${baseURL}/users`); await page.getByRole("heading", { name: "Akses ditolak" }).waitFor();
      const denied = await page.evaluate(async () => (await fetch("/api/users")).status); assert.equal(denied, 403);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${baseURL}/login`); await page.getByLabel("Email *").fill("admin@quarryflow.co.id"); await page.getByLabel("Kata sandi *").fill("QuarryFlow2026!"); await page.getByRole("button", { name: "Masuk ke StoneCrusher" }).click(); await page.getByRole("heading", { name: "User & akses" }).waitFor();
      await page.getByRole("button", { name: "User baru", exact: true }).click(); await page.getByLabel("Nama", { exact: true }).fill("UI user fixture"); await page.getByLabel("Email", { exact: true }).fill("ui-user@example.test"); await page.getByLabel("Kata sandi", { exact: true }).fill("Fixture-only-password-2026"); await page.getByLabel("Project Control", { exact: true }).check(); await page.getByLabel("master.material.read", { exact: true }).check(); await page.getByLabel("Semua plant (termasuk plant baru)", { exact: true }).check(); await page.getByRole("button", { name: "Simpan user & akses", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "detached" }); await page.getByText("UI user fixture", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Matriks role / fungsi", exact: true }).click(); await page.getByRole("cell", { name: "ADMIN / PC", exact: true }).waitFor();
      await page.setViewportSize({ width: 360, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
      const forbiddenBusiness = await page.evaluate(async () => (await fetch("/api/inventory/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status); assert.equal(forbiddenBusiness, 403);
      assert.ok(!logs.includes("Unhandled Runtime Error"));
    } finally { await browser.close(); }
  });
  test("user assignment update revokes old session and audits without password hashes", async () => {
    const old = await client.user.findUniqueOrThrow({ where: { id: pc.userId } });
    await updateUser(client, technical, pc.userId, { name: old.name, status: "ACTIVE", sessionVersion: old.sessionVersion, assignment: { role: "ADMIN", functions: ["PC"], permissions: ["master.material.read"], allPlants: false, plantIds: [scId] } });
    const updated = await client.user.findUniqueOrThrow({ where: { id: pc.userId } });
    assert.equal(sessionIsCurrent(updated, old.sessionVersion), false); assert.equal(sessionIsCurrent(updated, updated.sessionVersion), true);
    const event = await client.auditLog.findFirstOrThrow({ where: { module: "USERS", recordId: pc.userId, action: "UPDATE_ACCESS" } }); assert.ok(!JSON.stringify(event).includes("passwordHash"));
    await assert.rejects(updateUser(client, technical, legacyUser, { name: "Legacy technical", status: "INACTIVE", sessionVersion: 0, assignment: { role: "SUPERADMIN", functions: [], permissions: ["users.manage"], allPlants: false, plantIds: [] } }), /sendiri/);
  });
});
