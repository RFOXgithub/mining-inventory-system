import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, ChildProcess } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { hash } from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";
import { allowedActions, AccessActor } from "../src/lib/access";
import { createStockDocument, actStockDocument, actStockPeriod } from "../src/features/inventory/ledger-service";
import { inventoryData, inventoryDocuments } from "../src/features/inventory/ledger-query";
import { changeMaterial } from "../src/features/masters/service";
import { changeLocation } from "../src/features/masters/locations-service";

describe("inventory posting on an isolated PostgreSQL schema", { skip: process.env.RUN_INVENTORY_DB_TESTS !== "1", concurrency: false }, () => {
  const schema = `quarryflow_inventory_test_${randomUUID().replaceAll("-", "")}`;
  let admin: PrismaClient, db: PrismaClient, url: string, temporary: string, created = false, server: ChildProcess | undefined;
  let tsconfig: Buffer | undefined, nextEnv: Buffer | undefined;
  const distDir = `.next-${schema}`;
  const plant = randomUUID(), foreignPlant = randomUUID(), item = randomUUID(), item2 = randomUUID(), a = randomUUID(), b = randomUUID(), foreign = randomUUID(), legacyLocation = randomUUID();
  const legacyUser = randomUUID(), legacyProduct = randomUUID(), legacyStockpile = randomUUID(), legacyEvent = randomUUID();
  let pc: AccessActor, finance: AccessActor, manager: AccessActor, technical: AccessActor, uom: string, legacyItem: string;
  const day = (day: number, month = "09") => `2026-${month}-${String(day).padStart(2, "0")}T00:00:00Z`;
  const action = (action: string) => ({ action, reason: "Fixture decision evidence" });
  const make = (kind: string, quantity: string, locationId: string = a, itemId: string = item, effectiveAt = day(1), extra = {}) => ({ requestKey: randomUUID(), kind, effectiveAt, sourceName: "Quarry fixture source", sourceType: "QUARRY", reason: "Fixture stock purpose", evidence: "Fixture stock source evidence", lines: [{ itemId, locationId, quantity }], ...extra });
  const balance = async (locationId: string = a, itemId: string = item) => (await db.stockLedgerEntry.aggregate({ where: { locationId, itemId }, _sum: { quantity: true } }))._sum.quantity ?? new Prisma.Decimal(0);
  async function receipt(qty: string, locationId: string = a, itemId: string = item, effectiveAt = day(1), actor = pc) {
    const doc = await createStockDocument(db, actor, make("RECEIPT", qty, locationId, itemId, effectiveAt));
    await actStockDocument(db, actor, doc.id, action("post")); return doc;
  }
  before(async () => {
    if (!process.env.DATABASE_URL) process.loadEnvFile();
    const connection = new URL(process.env.DATABASE_URL!); connection.searchParams.set("connection_limit", "1"); connection.searchParams.set("pool_timeout", "30"); connection.searchParams.set("connect_timeout", "20");
    if (process.env.QUARRYFLOW_TEST_DIRECT_CONNECTION === "1" && connection.hostname.endsWith(".neon.tech")) connection.hostname = connection.hostname.replace("-pooler.", ".");
    admin = new PrismaClient({ datasourceUrl: connection.toString() }); assert.match(schema, /^quarryflow_inventory_test_[a-f0-9]{32}$/);
    console.info(`Owned fixture schema: ${schema}`);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    const source = new URL(connection); source.searchParams.set("connection_limit", "5"); source.searchParams.set("schema", schema); url = source.toString();
    const scopedClient = new PrismaClient({ datasourceUrl: url, log: [{ emit: "event", level: "query" }] }); db = scopedClient;
    let scopedModel = false; scopedClient.$on("query", event => { if (event.query.includes(`"${schema}"."User"`)) scopedModel = true; });
    temporary = mkdtempSync(path.join(tmpdir(), "quarryflow-inventory-migrations-"));
    writeFileSync(path.join(temporary, "schema.prisma"), readFileSync("prisma/schema.prisma"));
    for (const dir of readdirSync("prisma/migrations")) if (dir < "202610020001_access_masters") cpSync(path.join("prisma/migrations", dir), path.join(temporary, "migrations", dir), { recursive: true });
    // Each test owns a unique schema; production's database-wide migration lock
    // must not block or be shared with these independent fixture migrations.
    const deploy = (file: string) => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", file], { env: { ...process.env, DATABASE_URL: url, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" }, stdio: "pipe", timeout: 120000 });
    deploy(path.join(temporary, "schema.prisma"));
    const tables = await db.$queryRaw<{ table_schema: string }[]>`SELECT table_schema FROM information_schema.tables WHERE table_schema=${schema} AND table_name='User'`;
    assert.deepEqual(tables.map(t => t.table_schema), [schema]); await db.user.count(); assert.ok(scopedModel);
    await db.$transaction(async fixture => {
      await fixture.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      assert.equal((await fixture.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`)[0].schema, schema);
      await fixture.$executeRaw`INSERT INTO "User"(id,email,"passwordHash",name,"updatedAt") VALUES (${legacyUser}::uuid,'legacy-stock@example.test','fixture','Legacy stock maker',CURRENT_TIMESTAMP)`;
      await fixture.$executeRaw`INSERT INTO "Product"(id,code,name,category,unit,"sellingPrice","updatedAt") VALUES (${legacyProduct}::uuid,'LEGACY-STOCK','Legacy fixture material','Fixture','TON',0,CURRENT_TIMESTAMP)`;
      await fixture.$executeRaw`INSERT INTO "Stockpile"(id,code,name,type,location,"productId") VALUES (${legacyStockpile}::uuid,'LEGACY-L','Legacy fixture location','FINISHED_GOODS','Fixture',${legacyProduct}::uuid)`;
      await fixture.$executeRaw`INSERT INTO "InventoryTransaction"(id,number,"stockpileId","productId",type,direction,quantity,"referenceType","referenceId","balanceAfter","processingKey","createdBy","createdAt") VALUES (${legacyEvent}::uuid,'LEGACY-E',${legacyStockpile}::uuid,${legacyProduct}::uuid,'PRODUCTION_OUTPUT','IN',100,'LEGACY',${legacyProduct}::uuid,100,'legacy:preserved',${legacyUser}::uuid,'2026-09-01T00:00:00Z')`;
    }, { timeout: 60000 });
    deploy("prisma/schema.prisma");
    const passwordHash = await hash("Fixture-stock-password-2026", 10);
    const actor = async (role: string, functions: string[]): Promise<AccessActor> => {
      const roleRow = await db.role.findUniqueOrThrow({ where: { code: role } }), id = randomUUID(), permissions = allowedActions(role, functions);
      await db.user.create({ data: { id, name: `${role} stock fixture`, email: `${id}@example.test`, passwordHash, functions: functions as ("PC" | "FINANCE")[], actionPermissions: permissions, roles: { create: { roleId: roleRow.id } } } });
      return { userId: id, roles: [role], functions, permissions, plantIds: [plant], allPlants: false };
    };
    pc = await actor("ADMIN", ["PC"]); finance = await actor("ADMIN", ["FINANCE"]); manager = await actor("MANAGER", []); technical = await actor("SUPERADMIN", []);
    await db.plant.createMany({ data: [plant, foreignPlant].map((id, index) => ({ id, code: `STOCK-${index}`, name: `Stock plant ${index}`, kind: "SC", verificationStatus: "VERIFIED", createdBy: pc.userId, verifiedBy: manager.userId })) });
    for (const person of [pc, finance, manager]) await db.userPlantScope.create({ data: { userId: person.userId, plantId: plant } });
    uom = (await db.uom.findUniqueOrThrow({ where: { code: "TON" } })).id;
    for (const [index, id] of [item, item2].entries()) await db.catalogItem.create({ data: { id, code: `STOCK-I${index}`, name: `Stock material ${index}`, kind: "MATERIAL", category: "Fixture", primaryUomId: uom, createdBy: pc.userId, verifiedBy: manager.userId, verificationStatus: "VERIFIED", plants: { create: [{ plantId: plant }, { plantId: foreignPlant }] } } });
    legacyItem = (await db.catalogItem.findUniqueOrThrow({ where: { legacyProductId: legacyProduct } })).id;
    await db.catalogItem.update({ where: { id: legacyItem }, data: { verificationStatus: "VERIFIED", verifiedBy: manager.userId, plants: { create: { plantId: plant } } } });
    await db.plantLocation.createMany({ data: [a, b, foreign, legacyLocation].map((id, index) => ({ id, plantId: id === foreign ? foreignPlant : plant, code: `STOCK-L${index}`, name: `Stock location ${index}`, kind: "STOCKPILE", verificationStatus: "VERIFIED", createdBy: pc.userId, verifiedBy: manager.userId, stockpileId: id === legacyLocation ? legacyStockpile : null })) });
  });
  after(async () => {
    if (server?.pid && server.exitCode === null) {
      if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "pipe" }); else server.kill("SIGTERM");
    }
    if (tsconfig) writeFileSync("tsconfig.json", tsconfig); if (nextEnv) writeFileSync("next-env.d.ts", nextEnv);
    const generated = path.resolve(distDir); assert.equal(path.dirname(generated), process.cwd()); assert.ok(path.basename(generated).startsWith(".next-quarryflow_inventory_test_")); rmSync(generated, { recursive: true, force: true });
    await db?.$disconnect();
    if (created) { assert.match(schema, /^quarryflow_inventory_test_[a-f0-9]{32}$/); await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); }
    await admin?.$disconnect();
    if (temporary) { assert.equal(path.resolve(path.dirname(temporary)), path.resolve(tmpdir())); assert.ok(path.basename(temporary).startsWith("quarryflow-inventory-migrations-")); rmSync(temporary, { recursive: true }); }
  });

  test("idempotent receipt preserves exact quantities and role/plant scope", async () => {
    const input = make("RECEIPT", "100.123456");
    const [doc, duplicate] = await Promise.all([createStockDocument(db, pc, input), createStockDocument(db, pc, input)]);
    assert.equal(duplicate.id, doc.id);
    assert.equal((await createStockDocument(db, pc, input)).id, doc.id);
    await assert.rejects(createStockDocument(db, pc, { ...input, reason: "Different payload" }), /Request key/);
    await Promise.all([actStockDocument(db, pc, doc.id, action("post")), actStockDocument(db, pc, doc.id, action("post"))]);
    assert.equal((await balance()).toString(), "100.123456"); assert.equal(await db.stockLedgerEntry.count({ where: { documentId: doc.id } }), 1);
    assert.equal(await db.auditLog.count({ where: { recordId: doc.id, action: "POST" } }), 1);
    await assert.rejects(createStockDocument(db, technical, make("RECEIPT", "1")), /diizinkan/);
    await assert.rejects(createStockDocument(db, finance, make("RECEIPT", "1")), /diizinkan/);
    await assert.rejects(createStockDocument(db, pc, make("RECEIPT", "1", foreign)), /diizinkan/);
    const scoped = await inventoryData(db, pc, new URL("https://example.test/api/inventory")); assert.ok(scoped.locations.every(l => l.plantId === plant));
    await assert.rejects(changeMaterial(db, { ...pc, allPlants: true }, item, { action: "deactivate", version: 1, reason: "Fixture archive attempt" }), /saldo/);
    await assert.rejects(changeLocation(db, pc, "location", a, { action: "deactivate", version: 1, reason: "Fixture archive attempt" }), /saldo/);
    const volume = await db.uom.findUniqueOrThrow({ where: { code: "M3" } });
    await assert.rejects(changeMaterial(db, { ...pc, allPlants: true }, item, { code: "STOCK-I0", name: "Stock material 0", kind: "MATERIAL", category: "Fixture", primaryUomId: volume.id, plantIds: [plant, foreignPlant], version: 1, reason: "Fixture UOM rewrite attempt" }), /Jenis\/UOM/);
  });
  test("concurrent transfers reject overspending, conserve stock and retry exactly once", async () => {
    const input = () => ({ ...make("TRANSFER", "80"), lines: [{ itemId: item, locationId: a, destinationId: b, quantity: "80" }] });
    const one = await createStockDocument(db, pc, input()), two = await createStockDocument(db, pc, input());
    const results = await Promise.allSettled([actStockDocument(db, pc, one.id, action("post")), actStockDocument(db, pc, two.id, action("post"))]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const posted = (await db.stockDocument.findMany({ where: { id: { in: [one.id, two.id] }, status: "POSTED" } }))[0];
    await actStockDocument(db, pc, posted.id, action("post"));
    assert.equal(await db.stockLedgerEntry.count({ where: { documentId: posted.id } }), 2);
    assert.equal((await balance()).plus(await balance(b)).toString(), "100.123456");
    await actStockDocument(db, manager, posted.id === one.id ? two.id : one.id, action("reject"));
  });
  test("reversal blocks dependencies, requires another Manager, and ledger/source rows are immutable", async () => {
    const source = await db.stockDocument.findFirstOrThrow({ where: { kind: "RECEIPT", status: "POSTED" } });
    const original = await createStockDocument(db, pc, { ...make("REVERSAL", "1", a, item, day(3)), lines: [], reversalOfId: source.id });
    await assert.rejects(actStockDocument(db, manager, original.id, action("approve")), /turunan/);
    const transfer = await db.stockDocument.findFirstOrThrow({ where: { kind: "TRANSFER", status: "POSTED" } });
    const reversal = await createStockDocument(db, pc, { ...make("REVERSAL", "1", a, item, day(2)), lines: [], reversalOfId: transfer.id });
    await assert.rejects(actStockDocument(db, { ...manager, userId: pc.userId }, reversal.id, action("approve")), /Maker/);
    await actStockDocument(db, manager, reversal.id, action("approve")); await actStockDocument(db, manager, original.id, action("approve"));
    assert.equal((await balance()).toString(), "0"); assert.equal((await balance(b)).toString(), "0");
    const event = await db.stockLedgerEntry.findFirstOrThrow();
    await assert.rejects(db.stockLedgerEntry.update({ where: { id: event.id }, data: { quantity: 999 } }));
    await assert.rejects(db.stockDocumentLine.updateMany({ where: { documentId: source.id }, data: { quantity: 999 } }));
    await assert.rejects(db.stockDocument.update({ where: { id: source.id }, data: { evidence: "Rewritten evidence" } }));
  });
  test("opname cut-off posts fixed variance without overwriting later receipts", async () => {
    await receipt("100", a, item, day(10));
    const opname = await createStockDocument(db, pc, make("OPNAME", "90", a, item, day(11)));
    assert.equal(opname.lines[0].bookQuantity?.toString(), "100");
    await receipt("20", a, item, day(12));
    await actStockDocument(db, manager, opname.id, action("approve")); await actStockDocument(db, manager, opname.id, action("approve"));
    assert.equal((await balance()).toString(), "110");
    assert.equal((await db.stockLedgerEntry.findFirstOrThrow({ where: { documentId: opname.id } })).quantity.toString(), "-10");
    assert.equal((await db.stockDocumentLine.findFirstOrThrow({ where: { documentId: opname.id } })).bookQuantity?.toString(), "100");
  });
  test("stale snapshots and subsequent negative balances fail atomically", async () => {
    await receipt("100", b, item2, day(10));
    const stale = await createStockDocument(db, pc, make("OPNAME", "90", b, item2, day(11)));
    await receipt("1", b, item2, day(10));
    await assert.rejects(actStockDocument(db, manager, stale.id, action("approve")), /Snapshot/);
    await actStockDocument(db, manager, stale.id, action("reject"));
    const opname = await createStockDocument(db, pc, make("OPNAME", "0", b, item2, day(11)));
    const issue = await createStockDocument(db, pc, make("INTERNAL_ISSUE", "100", b, item2, day(12)));
    await actStockDocument(db, manager, issue.id, action("approve"));
    await assert.rejects(actStockDocument(db, manager, opname.id, action("approve")), /negatif/);
    assert.equal(await db.stockLedgerEntry.count({ where: { documentId: opname.id } }), 0);
    assert.equal((await balance(b, item2)).toString(), "1");
    await actStockDocument(db, manager, opname.id, action("reject"));
  });
  test("opening is once per pair with three independent sign-offs; legacy cannot be opened twice", async () => {
    const extra = { sourceName: "Opening fixture workbook", checksum: "a".repeat(64) };
    const doc = await createStockDocument(db, pc, make("OPENING", "50", a, item2, day(1), extra));
    await assert.rejects(actStockDocument(db, manager, doc.id, action("approve")), /Finance/);
    await assert.rejects(actStockDocument(db, { ...finance, userId: pc.userId }, doc.id, action("finance")), /Maker/);
    await actStockDocument(db, finance, doc.id, action("finance")); await actStockDocument(db, manager, doc.id, action("approve"));
    const again = await createStockDocument(db, pc, make("OPENING", "50", a, item2, day(1), extra));
    await actStockDocument(db, finance, again.id, action("finance")); await assert.rejects(actStockDocument(db, manager, again.id, action("approve")), /sekali/); await actStockDocument(db, manager, again.id, action("reject"));
    assert.equal((await balance(a, item2)).toString(), "50");
    const duplicate = await createStockDocument(db, pc, make("OPENING", "100", legacyLocation, legacyItem, day(2), extra));
    await actStockDocument(db, finance, duplicate.id, action("finance")); await assert.rejects(actStockDocument(db, manager, duplicate.id, action("approve")), /legacy/); await actStockDocument(db, manager, duplicate.id, action("reject"));
    const adoption = await createStockDocument(db, pc, make("LEGACY_IMPORT", "100", legacyLocation, legacyItem, day(2), extra));
    await actStockDocument(db, finance, adoption.id, action("finance")); await actStockDocument(db, manager, adoption.id, action("approve"));
    assert.equal((await balance(legacyLocation, legacyItem)).toString(), "100"); assert.equal(await db.inventoryTransaction.count(), 1);
    assert.equal((await db.stockLedgerEntry.findUniqueOrThrow({ where: { legacyId: legacyEvent } })).effectiveAt.toISOString(), new Date(day(1)).toISOString());
    await assert.rejects(db.inventoryTransaction.update({ where: { id: legacyEvent }, data: { quantity: 500 } }));
  });
  test("closed periods block backdates/reversal; reopen and stale Finance reconciliation are controlled", async () => {
    const scoped = (actor: AccessActor) => ({ ...actor, plantIds: [foreignPlant] });
    const source = await receipt("10", foreign, item, day(1, "08"), scoped(pc));
    const period = (action: string, version: number) => ({ plantId: foreignPlant, month: "2026-08", action, version, reason: "Fixture period reconciliation" });
    await actStockPeriod(db, scoped(pc), period("request-close", 0));
    await actStockPeriod(db, scoped(finance), period("finance", 1));
    const newReceipt = await receipt("1", foreign, item, day(2, "08"), scoped(pc));
    await assert.rejects(actStockPeriod(db, scoped(manager), period("approve", 2)), /rekonsiliasi Finance/);
    await actStockPeriod(db, scoped(finance), period("finance", 2)); await actStockPeriod(db, scoped(manager), period("approve", 3));
    await assert.rejects(createStockDocument(db, scoped(pc), make("RECEIPT", "1", foreign, item, day(3, "08"))), /tertutup/);
    const reversal = await createStockDocument(db, scoped(pc), { ...make("REVERSAL", "1", foreign, item, day(1)), lines: [], reversalOfId: newReceipt.id });
    await assert.rejects(actStockDocument(db, scoped(manager), reversal.id, action("approve")), /tertutup/);
    await actStockPeriod(db, scoped(pc), period("request-reopen", 4)); await actStockPeriod(db, scoped(finance), period("finance", 5)); await actStockPeriod(db, scoped(manager), period("approve", 6));
    await actStockDocument(db, scoped(manager), reversal.id, action("approve"));
    assert.equal((await balance(foreign)).toString(), "10");
    const list = await inventoryDocuments(db, pc, new URL("https://example.test/api/inventory/documents")); assert.ok(!list.data.some(d => d.id === source.id));
  });
  test("browser receipt, opname, CSR, forbidden APIs and responsive layouts", { skip: !process.env.INVENTORY_PLAYWRIGHT_MODULE, timeout: 480000 }, async () => {
    const browserItem = (await db.catalogItem.create({ data: { code: "BROWSER-STOCK", name: "Browser stock fixture", kind: "MATERIAL", category: "Fixture", primaryUomId: uom, verificationStatus: "VERIFIED", createdBy: pc.userId, verifiedBy: manager.userId, plants: { create: { plantId: plant } } } })).id;
    const { chromium } = createRequire(path.resolve("package.json"))(process.env.INVENTORY_PLAYWRIGHT_MODULE!);
    const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    const port = (listener.address() as { port: number }).port; await new Promise<void>(resolve => listener.close(() => resolve()));
    tsconfig = readFileSync("tsconfig.json"); nextEnv = readFileSync("next-env.d.ts");
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { env: { ...process.env, DATABASE_URL: url, QUARRYFLOW_TEST_DIST_DIR: distDir, NODE_ENV: "development" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let logs = ""; server.stdout?.on("data", chunk => { logs = (logs + chunk).slice(-16000); }); server.stderr?.on("data", chunk => { logs = (logs + chunk).slice(-16000); });
    const base = `http://localhost:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) { try { if ((await fetch(`${base}/login`)).ok) { ready = true; break; } } catch { /* Next startup */ } await new Promise(resolve => setTimeout(resolve, 500)); }
    assert.ok(ready, `Inventory test server did not start (exit ${server.exitCode}): ${logs.slice(-3000).replace(/postgres(?:ql)?:\/\/\S+/g, "[database URL redacted]")}`);
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Jakarta" });
      const page = await context.newPage(); page.setDefaultTimeout(45000);
      const login = async (actor: AccessActor) => {
        const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
        await page.goto(`${base}/login`); await page.getByLabel("Email *").fill(user.email); await page.getByLabel("Kata sandi *").fill("Fixture-stock-password-2026"); await page.getByRole("button", { name: "Masuk ke StoneCrusher" }).click(); await page.waitForURL((url: URL) => !url.pathname.startsWith("/login"));
      };
      const save = async (kind: string, quantity: string, reason: string) => {
        await page.getByRole("button", { name: `${kind} baru`, exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Material / UOM", { exact: true }).selectOption(browserItem);
        await dialog.getByLabel("Lokasi sumber", { exact: true }).selectOption(a);
        await dialog.getByLabel(kind === "Opname" ? "Fisik pada cut-off (TON)" : "Quantity (TON)", { exact: true }).fill(quantity);
        await dialog.getByLabel(kind === "CSR / internal issue" ? "Tujuan / penerima CSR dan alasan" : "Alasan", { exact: true }).fill(reason);
        if (kind === "Receipt") { await dialog.getByLabel("Sumber supplier / quarry / internal", { exact: true }).fill("Browser quarry fixture"); await dialog.getByLabel("Jenis sumber receipt", { exact: true }).selectOption("QUARRY"); }
        await dialog.getByLabel("Bukti / referensi dokumen / metode ukur", { exact: true }).fill("Browser source evidence fixture");
        await dialog.getByRole("button", { name: "Simpan & ajukan", exact: true }).click(); await dialog.waitFor({ state: "detached" });
        return db.stockDocument.findFirstOrThrow({ where: { reason }, orderBy: { createdAt: "desc" } });
      };
      const decide = async (doc: { number: string }, button: string) => {
        await page.getByRole("status").filter({ hasText: "Memuat inventory" }).waitFor({ state: "detached" });
        await page.getByRole("row").filter({ hasText: doc.number }).getByRole("button", { name: "Buka", exact: true }).click();
        try { await page.getByRole("button", { name: button, exact: true }).click(); }
        catch (error) { throw new Error(`${String(error)}\nUI: ${await page.locator("main").innerText().catch(() => page.locator(".content").innerText())}\nServer: ${logs.slice(-4000).replace(/postgres(?:ql)?:\/\/\S+/g, "[database URL redacted]")}`); }
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Alasan keputusan / referensi rekonsiliasi").fill("Browser authorized decision fixture"); await dialog.getByRole("button", { name: "Konfirmasi tindakan" }).click(); await dialog.waitFor({ state: "detached" });
      };
      await login(pc); await page.goto(`${base}/inventory`); await page.getByRole("heading", { name: "Inventory", exact: true }).waitFor();
      const source = await save("Receipt", "20", "Browser receipt fixture"); await decide(source, "Post ke ledger");
      assert.equal((await balance(a, browserItem)).toString(), "20");
      for (const width of [1440, 768, 390, 360]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); }
      await page.goto(`${base}/stock-opnames`); const opname = await save("Opname", "18", "Browser opname fixture");
      assert.equal((await db.stockDocumentLine.findFirstOrThrow({ where: { documentId: opname.id } })).bookQuantity?.toString(), "20");
      const denied = await page.request.post(`${base}/api/inventory/documents/${opname.id}`, { headers: { origin: base }, data: action("approve") }); assert.equal(denied.status(), 403);
      await page.goto(`${base}/internal-issues`); const issue = await save("CSR / internal issue", "1", "Browser CSR fixture");
      await login(manager); await page.goto(`${base}/stock-opnames`); await decide(opname, "Approve & post");
      await page.goto(`${base}/internal-issues`); await decide(issue, "Approve & post"); assert.equal((await balance(a, browserItem)).toString(), "17");
      for (const route of ["/stock-opnames", "/internal-issues"]) { await page.goto(`${base}${route}`); for (const width of [1440, 768, 390, 360]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); } }
      await login(technical); const forbidden = await page.request.get(`${base}/api/inventory`); assert.equal(forbidden.status(), 403);
      await page.goto(`${base}/inventory`); await page.getByRole("heading", { name: "Akses ditolak", exact: true }).waitFor();
    } finally { await browser.close(); }
  });
});
