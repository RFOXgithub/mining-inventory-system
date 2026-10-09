import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { hash } from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";
import { AccessActor, allowedActions } from "../src/lib/access";
import { saveRun, actRun, createConfig, verifyConfig } from "../src/features/operations/service";
import { operationData } from "../src/features/operations/query";
import { createStockDocument, actStockDocument, actStockPeriod } from "../src/features/inventory/ledger-service";
import { syncDraft } from "../src/features/operations/sync";
import { approvalData, reviewAction } from "../src/features/core/approvals";
import { closingData } from "../src/features/core/closing";
import { officialReport, dashboardData, exportReport } from "../src/features/core/reports";

describe("production, blending and fuel on isolated PostgreSQL", { skip: process.env.RUN_OPERATIONS_DB_TESTS !== "1", concurrency: false }, () => {
  const schema = `quarryflow_operations_test_${randomUUID().replaceAll("-", "")}`, distDir = `.next-${schema}`;
  let admin: PrismaClient, db: PrismaClient, url: string, created = false, server: ChildProcess | undefined, tsconfig: Buffer | undefined, nextEnv: Buffer | undefined;
  let maker: AccessActor, checker: AccessActor, manager: AccessActor, technical: AccessActor, finance: AccessActor, director: AccessActor, hse: AccessActor;
  const plants = [randomUUID(), randomUUID(), randomUUID()], stores = plants.map(() => randomUUID()), tanks = plants.map(() => randomUUID()), tankB = randomUUID();
  const rawItem = randomUUID(), products = [randomUUID(), randomUUID(), randomUUID(), randomUUID()], fuelItem = randomUUID();
  let ton: string, m3: string, liter: string, mixBP: string, mixAMP: string, mixBlend: string, fuelPolicy: string, asset: string, excludedAsset: string;
  const date = "2026-09-10T00:00:00Z", evidence = "Fixture measured source evidence";
  const balance = async (itemId: string, locationId: string) => ((await db.stockLedgerEntry.aggregate({ where: { itemId, locationId }, _sum: { quantity: true } }))._sum.quantity ?? new Prisma.Decimal(0)).toString();
  const input = (kind: string, plant = 0, quantity = "10", output = "5", extra = {}) => ({ requestKey: randomUUID(), kind, plantId: plants[plant], effectiveAt: date, pic: "Fixture PIC", method: evidence, evidence, reason: evidence, batch: "Fixture batch", quality: "Fixture quality and weigh reconciliation", inputs: [{ itemId: rawItem, locationId: stores[plant], uomId: ton, quantity }], outputs: [{ itemId: products[kind === "BLENDING" ? 3 : plant], locationId: stores[plant], uomId: plant === 2 ? ton : m3, quantity: output }], ...extra });
  const fuel = (kind: string, liters: string, extra = {}) => ({ ...input(kind, 2), inputs: [], outputs: [], fuel: { policyId: fuelPolicy, tankId: tanks[2], liters, ...extra } });
  const action = (action: string, version: number) => ({ action, version, reason: evidence });
  async function ready(payload: unknown) {
    const draft = await saveRun(db, maker, { payload, version: 0 });
    const submitted = await actRun(db, maker, draft.id, action("submit", draft.version));
    return actRun(db, checker, submitted.id, action("verify", submitted.version));
  }
  const post = (row: { id: string; version: number }) => actRun(db, checker, row.id, action("post", row.version));
  before(async () => {
    if (!process.env.DATABASE_URL) process.loadEnvFile();
    const connection = new URL(process.env.DATABASE_URL!); connection.searchParams.set("connection_limit", "1"); connection.searchParams.set("pool_timeout", "30"); connection.searchParams.set("connect_timeout", "20");
    if (process.env.QUARRYFLOW_TEST_DIRECT_CONNECTION === "1" && connection.hostname.endsWith(".neon.tech")) connection.hostname = connection.hostname.replace("-pooler.", ".");
    admin = new PrismaClient({ datasourceUrl: connection.toString() }); assert.match(schema, /^quarryflow_operations_test_[a-f0-9]{32}$/);
    console.info(`Owned fixture schema: ${schema}`);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    const source = new URL(connection); source.searchParams.set("connection_limit", "5"); source.searchParams.set("schema", schema); url = source.toString();
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" }, stdio: "pipe", timeout: 180000 });
    const scopedClient = new PrismaClient({ datasourceUrl: url, log: [{ emit: "event", level: "query" }] }); db = scopedClient;
    let scopedModel = false; scopedClient.$on("query", event => { if (event.query.includes(`"${schema}"."User"`)) scopedModel = true; });
    const tables = await db.$queryRaw<{ table_schema: string }[]>`SELECT table_schema FROM information_schema.tables WHERE table_schema=${schema} AND table_name='User'`;
    assert.deepEqual(tables.map(t => t.table_schema), [schema]);
    await db.user.count(); assert.ok(scopedModel, "Prisma model queries must address the owned fixture schema");
    const passwordHash = await hash("Fixture-operations-password-2026", 10);
    async function actor(role: string, functions: string[]): Promise<AccessActor> {
      const id = randomUUID(), roleRow = await db.role.findUniqueOrThrow({ where: { code: role } }), permissions = allowedActions(role, functions);
      await db.user.create({ data: { id, name: `${role} operations fixture`, email: `${id}@example.test`, passwordHash, functions: functions as "PC"[], actionPermissions: permissions, roles: { create: { roleId: roleRow.id } } } });
      return { userId: id, roles: [role], functions, permissions, allPlants: false, plantIds: plants };
    }
    maker = await actor("ADMIN", ["PC"]); checker = await actor("ADMIN", ["PC"]); manager = await actor("MANAGER", []); technical = await actor("SUPERADMIN", []);
    finance = await actor("ADMIN", ["FINANCE"]);
    director = await actor("DIREKTUR", []); hse = await actor("HSE", []);
    await db.plant.createMany({ data: plants.map((id, i) => ({ id, code: `OPS-P${i}`, name: `Fixture ${["SC", "BP", "AMP"][i]}`, kind: ["SC", "BP", "AMP"][i] as "SC", createdBy: maker.userId, verificationStatus: "VERIFIED", verifiedBy: manager.userId })) });
    await db.userPlantScope.createMany({ data: [maker, checker, manager, finance, director, hse].flatMap(a => plants.map(plantId => ({ userId: a.userId, plantId }))) });
    const uoms = await db.uom.findMany(); ton = uoms.find(u => u.code === "TON")!.id; m3 = uoms.find(u => u.code === "M3")!.id; liter = uoms.find(u => u.code === "L")!.id;
    for (const [i, id] of [rawItem, ...products, fuelItem].entries()) await db.catalogItem.create({ data: { id, code: `OPS-I${i}`, name: `Fixture item ${i}`, kind: i === 0 || id === fuelItem ? "MATERIAL" : "PRODUCT", category: "Fixture", primaryUomId: id === fuelItem ? liter : i === 0 || id === products[2] ? ton : m3, createdBy: maker.userId, verificationStatus: "VERIFIED", verifiedBy: manager.userId, plants: { create: plants.map(plantId => ({ plantId })) } } });
    await db.plantLocation.createMany({ data: [...stores.map((id, i) => ({ id, plantId: plants[i], code: `STORE${i}`, kind: "STOCKPILE" as const })), ...tanks.map((id, i) => ({ id, plantId: plants[i], code: `TANK${i}`, kind: "TANK" as const })), { id: tankB, plantId: plants[2], code: "TANKB", kind: "TANK" as const }].map(l => ({ ...l, name: l.code, createdBy: maker.userId, verificationStatus: "VERIFIED", verifiedBy: manager.userId })) });
    // Fictional verified fixture versions; separate tests exercise the approval service.
    const config = async (plant: number, code: string, payload: object) => { const id = randomUUID(); return (await db.operationalConfig.create({ data: { id, requestKey: randomUUID(), payloadHash: code, plantId: plants[plant], code, kind: (payload as { kind: string }).kind, revision: 1, effectiveFrom: new Date("2026-09-01"), payload, evidence, makerId: maker.userId, verifiedBy: manager.userId, verificationStatus: "VERIFIED", assetRootId: (payload as { kind: string }).kind === "ASSET" ? id : undefined } })).id; };
    for (const [i, process] of ["SC", "BP", "AMP", "BLENDING"].entries()) await config(i === 3 ? 0 : i, `OUTPUT-${process}`, { kind: "PRODUCT", itemId: products[i], process });
    const mix = (process: string, output: string, outputUom: string) => ({ kind: "MIX", process, outputItemId: output, outputUomId: outputUom, components: [{ itemId: rawItem, uomId: ton, quantity: "2" }] });
    mixBP = await config(1, "MIX-BP", mix("BP", products[1], m3)); mixAMP = await config(2, "MIX-AMP", mix("AMP", products[2], ton)); mixBlend = await config(0, "MIX-BLEND", mix("BLENDING", products[3], m3));
    fuelPolicy = await config(2, "FUEL", { kind: "FUEL", itemId: fuelItem });
    asset = await config(2, "ASSET", { kind: "ASSET", name: "Fixture equipment", identity: "Fixture serial", ownership: "Fixture ownership", payer: "Fixture payer", costResponsibility: "Fixture cost", contract: "Fixture contract", eligibleProduction: true });
    excludedAsset = await config(2, "ASSET-EXCLUDED", { kind: "ASSET", name: "Fixture excluded equipment", identity: "Fixture excluded serial", ownership: "Fixture ownership", payer: "Fixture payer", costResponsibility: "Fixture cost", contract: "Fixture contract", eligibleProduction: false });
    for (const locationId of stores) {
      const doc = await createStockDocument(db, maker, { requestKey: randomUUID(), kind: "RECEIPT", effectiveAt: "2026-09-01T00:00:00Z", reason: evidence, evidence, sourceName: "Fixture quarry", sourceType: "QUARRY", lines: [{ itemId: rawItem, locationId, quantity: "100" }] }); await actStockDocument(db, maker, doc.id, { action: "post", reason: evidence });
    }
  });
  after(async () => {
    if (server?.pid && server.exitCode === null) { if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "pipe" }); else server.kill("SIGTERM"); }
    if (tsconfig) writeFileSync("tsconfig.json", tsconfig); if (nextEnv) writeFileSync("next-env.d.ts", nextEnv);
    const generated = path.resolve(distDir); assert.equal(path.dirname(generated), process.cwd()); assert.match(path.basename(generated), /^\.next-quarryflow_operations_test_[a-f0-9]{32}$/); rmSync(generated, { recursive: true, force: true });
    await db?.$disconnect(); if (created) { assert.match(schema, /^quarryflow_operations_test_[a-f0-9]{32}$/); await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); } await admin?.$disconnect();
  });
  test("verified versions require different Manager; stable equipment and immutable parameters", async () => {
    const raw = { requestKey: randomUUID(), plantId: plants[2], code: "NEW-ASSET", revision: 1, effectiveFrom: date, evidence, payload: { kind: "ASSET", name: "Fixture hired TM", identity: "Fixture stable serial", ownership: "Fixture rental", payer: "Fixture third party", costResponsibility: "Fixture written cost", contract: "Fixture signed contract", eligibleProduction: false } };
    const config = await createConfig(db, maker, raw); assert.equal(config.verificationStatus, "UNVERIFIED");
    await assert.rejects(verifyConfig(db, maker, config.id, { evidence }), /diizinkan/);
    await assert.rejects(verifyConfig(db, { ...manager, userId: maker.userId }, config.id, { evidence }), /sendiri/);
    await verifyConfig(db, manager, config.id, { evidence });
    excludedAsset = config.id;
    const revision = await createConfig(db, maker, { ...raw, requestKey: randomUUID(), revision: 2, payload: { ...raw.payload, eligibleProduction: true } }); assert.equal(revision.assetRootId, config.assetRootId);
    await assert.rejects(db.operationalConfig.update({ where: { id: config.id }, data: { evidence: "Tampered" } }));
    await assert.rejects(createConfig(db, technical, { ...raw, requestKey: randomUUID(), revision: 3 }), /diizinkan/);
  });
  test("SC concurrent posting is atomic, rejects negative stock and replays once", async () => {
    const payload = input("SC", 0, "1", "1"), original = await saveRun(db, maker, { payload, version: 0 });
    assert.equal((await saveRun(db, maker, { payload, version: 0 })).id, original.id);
    const edited = await saveRun(db, maker, { payload: { ...payload, reason: "Fixture edited draft reason" }, version: original.version }, original.id);
    await assert.rejects(saveRun(db, maker, { payload: { ...payload, reason: "Fixture stale draft reason" }, version: original.version }, original.id), /berubah/);
    assert.equal(edited.version, 2);
    const first = await ready(input("SC", 0, "60", "5")), second = await ready(input("SC", 0, "60", "5"));
    await assert.rejects(actRun(db, maker, first.id, action("verify", first.version)), /sendiri/);
    const attempts = await Promise.allSettled([post(first), post(second)]); assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(await balance(rawItem, stores[0]), "40"); assert.equal(await balance(products[0], stores[0]), "5");
    const winner = attempts.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof post>>>;
    await Promise.all([post({ id: winner.value.id, version: 1 }), post({ id: winner.value.id, version: 1 })]);
    assert.equal(await db.stockLedgerEntry.count({ where: { documentId: winner.value.stockDocumentId! } }), 2);
    const loser = await db.operationalRun.findUniqueOrThrow({ where: { id: winner.value.id === first.id ? second.id : first.id } }); assert.equal(loser.status, "VERIFIED"); assert.equal(loser.stockDocumentId, null);
    await assert.rejects(db.operationalRun.update({ where: { id: winner.value.id }, data: { payload: { tampered: true } } }));
    await assert.rejects(saveRun(db, { ...maker, plantIds: [plants[1]] }, { payload: input("SC"), version: 0 }), /diizinkan/);
    await assert.rejects(saveRun(db, maker, { payload: input("SC", 0, "1", "1", { outputs: [{ itemId: products[3], locationId: stores[0], uomId: m3, quantity: "1" }] }), version: 0 }).then(r => actRun(db, maker, r.id, action("submit", r.version))), /Blending|blending/);
  });
  test("BP mix is a comparator; blending is a separate consumption/output source", async () => {
    const bp = await ready(input("BP", 1, "5", "2", { mixVersionId: mixBP }));
    const snapshot = bp.snapshot as unknown as { comparison: { expected: string; actual: string; variance: string }[] }; assert.deepEqual(snapshot.comparison.map(c => [c.expected, c.actual, c.variance]), [["4", "5", "1"]]);
    await post(bp); assert.equal(await balance(rawItem, stores[1]), "95"); assert.equal(await balance(products[1], stores[1]), "2");
    const blending = await ready(input("BLENDING", 0, "6", "3", { mixVersionId: mixBlend })); const posted = await post(blending);
    assert.equal((await db.stockDocument.findUniqueOrThrow({ where: { id: posted.stockDocumentId! } })).kind, "BLENDING"); assert.equal(await balance(products[0], stores[0]), "5"); assert.equal(await balance(products[3], stores[0]), "3");
    const missingDensity = input("SC", 0, "1", "1", { inputs: [{ itemId: rawItem, locationId: stores[0], uomId: m3, quantity: "1" }] }); const draft = await saveRun(db, maker, { payload: missingDensity, version: 0 }); await assert.rejects(actRun(db, maker, draft.id, action("submit", draft.version)), /Density|density|Konversi/);
  });
  test("fuel liters, tank transfer and AMP usage reference never count twice; KPI zero=N/A", async () => {
    await post(await ready(fuel("FUEL_RECEIPT", "100", { sourceType: "SUPPLIER", sourceName: "Fixture fuel supplier" })));
    const usage = await post(await ready(fuel("FUEL_USAGE", "10", { assetId: asset, purpose: "PRODUCTION" })));
    const before = await operationData(db, maker, new URL("https://fixture.test/api/operations?domain=fuel&month=2026-09")); assert.equal(before.kpis.find(k => k.plantId === plants[2])!.ratio, null);
    await post(await ready(fuel("FUEL_USAGE", "5", { assetId: asset, purpose: "NON_PRODUCTION" })));
    await post(await ready(fuel("FUEL_USAGE", "3", { assetId: excludedAsset, purpose: "PRODUCTION" })));
    await post(await ready(fuel("FUEL_TRANSFER", "10", { destinationId: tankB })));
    await post(await ready(input("AMP", 2, "1", "0", { mixVersionId: mixAMP, fuelUsageId: usage.id })));
    const zero = await operationData(db, maker, new URL("https://fixture.test/api/operations?domain=fuel&month=2026-09")); assert.equal(zero.kpis.find(k => k.plantId === plants[2])!.ratio, null);
    const amp = await ready(input("AMP", 2, "10", "8", { mixVersionId: mixAMP, fuelUsageId: usage.id })); await post(amp);
    const ampSecond = await post(await ready(input("AMP", 2, "2", "2", { mixVersionId: mixAMP, fuelUsageId: usage.id })));
    assert.equal(await balance(fuelItem, tanks[2]), "72"); assert.equal(await balance(fuelItem, tankB), "10");
    assert.equal(await db.stockLedgerEntry.count({ where: { documentId: (await db.operationalRun.findUniqueOrThrow({ where: { id: amp.id } })).stockDocumentId!, itemId: fuelItem } }), 0);
    const data = await operationData(db, maker, new URL("https://fixture.test/api/operations?domain=fuel&month=2026-09")), kpi = data.kpis.find(k => k.plantId === plants[2])!; assert.equal(kpi.liters, "10"); assert.equal(kpi.output, "10"); assert.equal(kpi.ratio, "1"); assert.equal(kpi.unit, "liter/ton");
    const doubled = input("AMP", 2, "1", "1", { mixVersionId: mixAMP, inputs: [{ itemId: fuelItem, locationId: tanks[2], uomId: liter, quantity: "1" }] }); const draft = await saveRun(db, maker, { payload: doubled, version: 0 }); await assert.rejects(actRun(db, maker, draft.id, action("submit", draft.version)), /kedua kali/);
    const reversal = await createStockDocument(db, maker, { requestKey: randomUUID(), kind: "REVERSAL", effectiveAt: "2026-09-11T00:00:00Z", reason: evidence, evidence, reversalOfId: usage.stockDocumentId!, lines: [] }); await assert.rejects(actStockDocument(db, manager, reversal.id, { action: "approve", reason: evidence }), /turunan/);
    const ampSources = await db.operationalRun.findMany({ where: { kind: "AMP", status: "POSTED" }, orderBy: { createdAt: "desc" } });
    assert.equal(ampSources.length, 3); assert.ok(ampSources.some(r => r.id === ampSecond.id));
    for (const run of ampSources) {
      const reverse = await createStockDocument(db, maker, { requestKey: randomUUID(), kind: "REVERSAL", effectiveAt: "2026-09-11T00:00:00Z", reason: evidence, evidence, reversalOfId: run.stockDocumentId!, lines: [] }); await actStockDocument(db, manager, reverse.id, { action: "approve", reason: evidence }); assert.equal((await db.operationalRun.findUniqueOrThrow({ where: { id: run.id } })).status, "REVERSED");
    }
    await actStockDocument(db, manager, reversal.id, { action: "approve", reason: evidence }); assert.equal((await db.operationalRun.findUniqueOrThrow({ where: { id: usage.id } })).status, "REVERSED");
    const after = await operationData(db, maker, new URL("https://fixture.test/api/operations?domain=fuel&month=2026-09")); assert.equal(after.kpis.find(k => k.plantId === plants[2])!.liters, "0"); assert.equal(after.kpis.find(k => k.plantId === plants[2])!.ratio, null);
    await assert.rejects(createStockDocument(db, maker, { requestKey: randomUUID(), kind: "INTERNAL_ISSUE", effectiveAt: date, reason: evidence, evidence, lines: [{ itemId: fuelItem, locationId: tanks[2], quantity: "1" }] }), /workflow usage/);
    await assert.rejects(operationData(db, technical, new URL("https://fixture.test/api/operations?domain=fuel")), /diizinkan/);
  });
  test("scope, tank classification and closing include destination drafts", async () => {
    const water = await db.catalogItem.create({ data: { code: "FIXTURE-WATER", name: "Fixture water", kind: "MATERIAL", category: "Fixture nonfuel", primaryUomId: liter, verificationStatus: "VERIFIED", createdBy: maker.userId, verifiedBy: manager.userId, plants: { create: { plantId: plants[2] } } } });
    const receipt = await createStockDocument(db, maker, { requestKey: randomUUID(), kind: "RECEIPT", effectiveAt: date, reason: evidence, evidence, sourceName: "Fixture water supplier", sourceType: "SUPPLIER", lines: [{ itemId: water.id, locationId: tanks[2], quantity: "100" }] }); await actStockDocument(db, maker, receipt.id, { action: "post", reason: evidence });
    const payload = { ...fuel("FUEL_TRANSFER", "1", { destinationId: tanks[1] }), effectiveAt: "2026-10-01T00:00:00Z" };
    const pending = await saveRun(db, maker, { payload, version: 0 });
    const restricted = { ...maker, plantIds: [plants[2]] }, data = await operationData(db, restricted, new URL("https://fixture.test/api/operations?domain=fuel&month=2026-10"));
    assert.ok(!data.runs.some(r => r.id === pending.id)); assert.ok(!data.tankBalances.some(r => r.itemId === water.id));
    await assert.rejects(actRun(db, { ...checker, plantIds: [plants[2]] }, pending.id, action("reject", pending.version)), /diizinkan/);
    await assert.rejects(operationData(db, restricted, new URL(`https://fixture.test/api/operations?domain=fuel&plantId=${plants[1]}`)), /cakupan/);
    await actStockPeriod(db, maker, { plantId: plants[1], month: "2026-10", version: 0, action: "request-close", reason: evidence });
    await actStockPeriod(db, finance, { plantId: plants[1], month: "2026-10", version: 1, action: "finance", reason: evidence });
    await assert.rejects(actStockPeriod(db, manager, { plantId: plants[1], month: "2026-10", version: 2, action: "approve", reason: evidence }), /menunggu/);
    await actRun(db, checker, pending.id, action("reject", pending.version));
    await actStockPeriod(db, finance, { plantId: plants[1], month: "2026-10", version: 2, action: "finance", reason: evidence });
    await actStockPeriod(db, manager, { plantId: plants[1], month: "2026-10", version: 3, action: "approve", reason: evidence });
    await assert.rejects(saveRun(db, maker, { payload: { ...input("BP", 1, "5", "2", { mixVersionId: mixBP }), effectiveAt: "2026-10-01T00:00:00Z" }, version: 0 }), /Periode tertutup/);
    const stale = await ready(input("SC", 0, "1", "1"));
    await db.catalogItem.update({ where: { id: rawItem }, data: { name: "Fixture changed raw name" } });
    await assert.rejects(post(stale), /Master\/konversi berubah/);
    await actRun(db, checker, stale.id, action("reject", stale.version));
    assert.equal((await db.operationalRun.findUniqueOrThrow({ where: { id: stale.id } })).status, "REJECTED");
    assert.equal((await db.operationalRun.findUniqueOrThrow({ where: { id: stale.id } })).stockDocumentId, null);
  });
  test("Core scoped review, reconciliation/export and UUID sync conflicts", async () => {
    const payload = input("SC", 0, "1", "1"), packet = { clientDraftId: payload.requestKey, deviceId: randomUUID(), clientUpdatedAt: new Date().toISOString(), version: 0, payload };
    const first = await syncDraft(db, maker, packet), repeated = await Promise.all([syncDraft(db, maker, packet), syncDraft(db, maker, packet)]);
    assert.ok(repeated.every(r => r.sourceId === first.sourceId && r.version === first.version)); assert.equal(await db.operationalRun.count({ where: { requestKey: payload.requestKey } }), 1);
    const updated = await syncDraft(db, maker, { ...packet, sourceId: first.sourceId, version: first.version, payload: { ...payload, reason: "Fixture second sync edit" } });
    await assert.rejects(syncDraft(db, maker, { ...packet, sourceId: first.sourceId, version: first.version, payload: { ...payload, reason: "Fixture stale offline edit" } }), /berubah/);
    const submitted = await actRun(db, maker, first.sourceId, action("submit", updated.version));
    await assert.rejects(syncDraft(db, maker, { ...packet, sourceId: first.sourceId, version: submitted.version, payload: updated.payload }), /draft|DRAFT/i);
    const mine = (await approvalData(db, maker)).items.find(r => r.id === first.sourceId)!; assert.deepEqual(mine.actions, []); assert.ok(mine.history.length); assert.ok(mine.after);
    const peer = (await approvalData(db, checker)).items.find(r => r.id === first.sourceId)!;
    await assert.rejects(reviewAction(db, maker, { domain: mine.domain, id: mine.id, version: mine.version, reviewHash: mine.reviewHash, action: "verify", reason: evidence }), /tidak diizinkan/);
    const decision = { domain: peer.domain, id: peer.id, version: peer.version, reviewHash: peer.reviewHash, action: "verify", reason: evidence };
    await assert.rejects(reviewAction(db, checker, { ...decision, reviewHash: "0".repeat(64) }), /berubah/);
    const verified = await reviewAction(db, checker, decision); await post(verified as { id: string; version: number });
    assert.ok(!(await approvalData(db, { ...checker, plantIds: [plants[1]] })).items.some(r => r.id === first.sourceId));
    await assert.rejects(approvalData(db, technical), /diizinkan/);
    const filter = { category: "production" as const, from: "2026-09-01", to: "2026-09-30" }, report = await officialReport(db, maker, filter), dash = await dashboardData(db, maker, filter);
    assert.equal(dash.reports.find(r => r.category === "production")?.snapshotHash, report.snapshotHash);
    const directorDash = await dashboardData(db, director, filter); assert.equal(directorDash.focus, "Direktur"); assert.ok(directorDash.reports.some(r => r.category === "invoice"));
    const hseDash = await dashboardData(db, { ...hse, plantIds: [plants[0]] }, filter); assert.equal(hseDash.focus, "HSE"); assert.equal(hseDash.reports.length, 0); assert.equal(hseDash.plants.length, 1); assert.ok(hseDash.locations.every(l => l.plantId === plants[0]));
    await assert.rejects(officialReport(db, hse, filter), /diizinkan/);
    assert.ok((await officialReport(db, { ...maker, plantIds: [plants[1]] }, filter)).rows.every(r => r.plantId === plants[1]));
    for (const total of report.totals) { const matching = report.rows.filter(r => r.plant === total.plant && r.event === total.event && r.uom === total.uom); assert.equal(total.quantity, matching.reduce((n, r) => n.plus(r.quantity ?? "0"), new Prisma.Decimal(0)).toString()); }
    const fuelReport = await officialReport(db, maker, { ...filter, category: "fuel" }); assert.equal(fuelReport.kpis.find(k => k.plant === "Fixture AMP")?.ratio, null); assert.equal(fuelReport.kpis.find(k => k.plant === "Fixture AMP")?.liters, "0");
    assert.equal((await officialReport(db, maker, { ...filter, category: "production", to: "2026-09-10" })).totals.find(t => t.plant === "Fixture AMP")?.quantity, "10");
    const exported = await exportReport(db, maker, filter, report.snapshotHash); assert.ok(exported.csv.includes("sourceId")); assert.ok(exported.csv.includes("OUTPUT"));
    await assert.rejects(exportReport(db, maker, filter, "0".repeat(64)), /Data berubah/); await assert.rejects(officialReport(db, technical, filter), /diizinkan/);
    const closing = await closingData(db, maker, plants[1], "2026-10"); assert.equal(closing.periods[0].row?.closed, true); assert.equal(closing.periods[0].readiness.pending, 0);
    assert.ok(closing.periods[0].reviewReports.some(r => r.category === "inventory")); assert.ok(!closing.periods[0].reviewReports.some(r => r.category === "invoice"));
    const lockedPayload = { ...input("BP", 1, "1", "1", { mixVersionId: mixBP }), effectiveAt: "2026-10-01T00:00:00Z" };
    await assert.rejects(syncDraft(db, maker, { ...packet, clientDraftId: lockedPayload.requestKey, payload: lockedPayload }), /Periode tertutup/);
    const invalidUom = input("SC", 0, "1", "1"), invalidPacket = { ...packet, clientDraftId: invalidUom.requestKey, payload: { ...invalidUom, inputs: [{ ...invalidUom.inputs[0], uomId: randomUUID() }] } };
    await assert.rejects(syncDraft(db, maker, invalidPacket), /UOM transaksi belum verified/); assert.equal(await db.operationalRun.count({ where: { requestKey: invalidUom.requestKey } }), 0);
    await assert.rejects(syncDraft(db, { ...maker, permissions: maker.permissions.filter(p => p !== "production.create") }, packet), /diizinkan/);
    const fuelPayload = fuel("FUEL_RECEIPT", "5", { sourceType: "SUPPLIER", sourceName: evidence }), fuelPacket = { ...packet, clientDraftId: fuelPayload.requestKey, payload: fuelPayload };
    const ledgerBeforeSync = await db.stockLedgerEntry.count(), fuelDraft = await syncDraft(db, maker, fuelPacket);
    assert.equal((await syncDraft(db, maker, fuelPacket)).sourceId, fuelDraft.sourceId); assert.equal(await db.stockLedgerEntry.count(), ledgerBeforeSync);
    const closedTransfer = { ...fuel("FUEL_TRANSFER", "1", { destinationId: tanks[1] }), effectiveAt: "2026-10-01T00:00:00Z" };
    await assert.rejects(syncDraft(db, maker, { ...packet, clientDraftId: closedTransfer.requestKey, payload: closedTransfer }), /Periode tertutup/);
  });
  test("browser has three distinct workspaces, draft workflow, permissions and responsive forms", { skip: !process.env.OPERATIONS_PLAYWRIGHT_MODULE, timeout: 600000 }, async () => {
    const { chromium } = createRequire(path.resolve("package.json"))(process.env.OPERATIONS_PLAYWRIGHT_MODULE!);
    const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve)); const port = (listener.address() as { port: number }).port; await new Promise<void>(resolve => listener.close(() => resolve()));
    tsconfig = readFileSync("tsconfig.json"); nextEnv = readFileSync("next-env.d.ts");
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { env: { ...process.env, DATABASE_URL: url, QUARRYFLOW_TEST_DIST_DIR: distDir, NODE_ENV: "development" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let logs = ""; server.stdout?.on("data", c => { logs = (logs + c).slice(-8000); }); server.stderr?.on("data", c => { logs = (logs + c).slice(-8000); });
    const base = `http://localhost:${port}`; let readyServer = false;
    for (let n = 0; n < 120; n++) { try { if ((await fetch(`${base}/login`)).ok) { readyServer = true; break; } } catch { /* startup */ } await new Promise(r => setTimeout(r, 500)); }
    assert.ok(readyServer, logs.replace(/postgres(?:ql)?:\/\/\S+/g, "[database URL redacted]"));
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(); page.setDefaultTimeout(60000);
      const waitForShell = async (pathname: string) => { for (let i = 0; i < 600; i++) { if (await page.evaluate(async (route: string) => !!navigator.serviceWorker.controller && !!(await (await caches.open("quarryflow-shell-v1")).match(route)), pathname)) return; await new Promise(r => setTimeout(r, 100)); } assert.fail(`Offline shell was not prepared: ${pathname}`); };
      const login = async (actor: AccessActor) => { const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } }); await page.goto(`${base}/login`); await page.getByLabel("Email *").fill(user.email); await page.getByLabel("Kata sandi *").fill("Fixture-operations-password-2026"); await page.getByRole("button", { name: "Masuk ke StoneCrusher" }).click(); await page.waitForURL((u: URL) => u.pathname !== "/login"); };
      await login(maker);
      for (const [route, title] of [["production", "Produksi SC / BP / AMP"], ["blending", "Blending"], ["fuel", "BBM"]]) {
        await page.goto(`${base}/${route}`); await page.getByRole("heading", { name: title, exact: true }).waitFor(); await page.getByRole("status").filter({ hasText: "Memuat transaksi" }).waitFor({ state: "detached" });
        for (const width of [1440, 1024, 768, 390, 360]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); }
      }
      await page.goto(`${base}/production`); await page.getByRole("button", { name: "SC · input harian baru", exact: true }).click(); const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Plant transaksi", { exact: true }).selectOption(plants[0]); await dialog.getByLabel("PIC lapangan", { exact: true }).fill("Browser source PIC");
      const inputs = dialog.getByRole("group", { name: "Konsumsi bahan aktual", exact: true }), outputs = dialog.getByRole("group", { name: "Hasil ukur harian (M3)", exact: true });
      await inputs.getByLabel("Material", { exact: true }).selectOption(rawItem); await inputs.getByLabel("Lokasi bahan", { exact: true }).selectOption(stores[0]); await inputs.getByLabel("Quantity terukur", { exact: true }).fill("1");
      await outputs.getByLabel("Material", { exact: true }).selectOption(products[0]); await outputs.getByLabel("Lokasi hasil", { exact: true }).selectOption(stores[0]); await outputs.getByLabel("UOM aktual", { exact: true }).selectOption(m3); await outputs.getByLabel("Quantity terukur", { exact: true }).fill("1");
      for (const label of ["Metode ukur / alat ukur", "Bukti / dokumen sumber", "Tujuan / alasan"]) await dialog.getByLabel(label, { exact: true }).fill("Browser production evidence fixture");
      await dialog.getByRole("button", { name: "Simpan draft", exact: true }).click(); await dialog.waitFor({ state: "detached" });
      const saved = await db.operationalRun.findFirstOrThrow({ where: { payload: { path: ["pic"], equals: "Browser source PIC" } } }); assert.equal(saved.status, "DRAFT");
      await page.getByRole("status").filter({ hasText: "Memuat transaksi" }).waitFor({ state: "detached" }); await page.getByRole("row").filter({ hasText: saved.number }).getByRole("button", { name: "Buka", exact: true }).click();
      await page.getByRole("button", { name: "Submit", exact: true }).click(); const decision = page.getByRole("dialog"); await decision.getByLabel("Alasan / bukti pemeriksaan").fill(evidence); await decision.getByRole("button", { name: "Konfirmasi tindakan" }).click(); await decision.waitFor({ state: "detached" });
      await login(checker); await page.goto(`${base}/production`); await page.getByRole("status").filter({ hasText: "Memuat transaksi" }).waitFor({ state: "detached" }); await page.getByRole("row").filter({ hasText: saved.number }).getByRole("button", { name: "Buka", exact: true }).click();
      for (const label of ["Verifikasi PC", "Post ke ledger"]) { await page.getByRole("button", { name: label, exact: true }).click(); const d = page.getByRole("dialog"); await d.getByLabel("Alasan / bukti pemeriksaan").fill(evidence); await d.getByRole("button", { name: "Konfirmasi tindakan" }).click(); await d.waitFor({ state: "detached" }); await page.getByRole("status").filter({ hasText: "Memuat transaksi" }).waitFor({ state: "detached" }); }
      assert.equal((await db.operationalRun.findUniqueOrThrow({ where: { id: saved.id } })).status, "POSTED");
      await page.goto(`${base}/fuel`); await page.getByRole("button", { name: "Pemakaian BBM baru", exact: true }).click(); await page.getByRole("dialog").getByLabel("Plant transaksi", { exact: true }).selectOption(plants[2]); await page.getByRole("dialog").getByLabel("Liter aktual").fill("5"); await page.getByRole("dialog").getByLabel("Alat / kendaraan verified").selectOption(asset);
      assert.equal(await page.getByRole("dialog").getByLabel("Material", { exact: true }).count(), 0); await page.getByRole("button", { name: "Batal", exact: true }).click();
      // The Core pages use the same official report projection and stay within the viewport.
      for (const route of ["", "reports", "approvals"]) {
        await page.goto(`${base}/${route}`); await page.locator("h1").waitFor();
        await page.getByRole("status").filter({ hasText: /Memuat sumber resmi|Memuat review/ }).waitFor({ state: "detached" });
        for (const width of [1440, 1024, 768, 390, 360]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Core ${route} overflow ${width}`); }
      }
      await page.getByRole("button", { name: "Closing / reopen", exact: true }).click(); await page.getByLabel("Periode WIB", { exact: true }).fill("2026-10");
      await page.getByRole("button").filter({ hasText: "Fixture BP" }).click(); await page.getByText("Periode closed:", { exact: false }).waitFor();
      await page.goto(`${base}/reports`); await page.getByLabel("Mulai (WIB)").fill("2026-09-01"); await page.getByLabel("Sampai / as-of (WIB)").fill("2026-09-30");
      await page.getByRole("status").filter({ hasText: "Memuat sumber resmi" }).waitFor({ state: "detached" });
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV sesuai layar" }).click()]); assert.equal(await download.failure(), null);
      // A complete draft is kept on the device across a real offline page reload.
      await page.goto(`${base}/production`); await page.getByRole("button", { name: /^SC .* input harian baru$/ }).click(); const offlineForm = page.getByRole("dialog");
      await offlineForm.getByLabel("Plant transaksi", { exact: true }).selectOption(plants[0]); await offlineForm.getByLabel("PIC lapangan", { exact: true }).fill("Offline device fixture PIC");
      const localInputs = offlineForm.getByRole("group", { name: "Konsumsi bahan aktual", exact: true }), localOutputs = offlineForm.getByRole("group", { name: "Hasil ukur harian (M3)", exact: true });
      await localInputs.getByLabel("Material", { exact: true }).selectOption(rawItem); await localInputs.getByLabel("Lokasi bahan", { exact: true }).selectOption(stores[0]); await localInputs.getByLabel("Quantity terukur", { exact: true }).fill("1");
      await localOutputs.getByLabel("Material", { exact: true }).selectOption(products[0]); await localOutputs.getByLabel("Lokasi hasil", { exact: true }).selectOption(stores[0]); await localOutputs.getByLabel("UOM aktual", { exact: true }).selectOption(m3); await localOutputs.getByLabel("Quantity terukur", { exact: true }).fill("1");
      for (const label of ["Metode ukur / alat ukur", "Bukti / dokumen sumber", "Tujuan / alasan"]) await offlineForm.getByLabel(label, { exact: true }).fill("Offline measured source fixture");
      await waitForShell("/production");
      await context.setOffline(true); await offlineForm.getByRole("button", { name: "Simpan draft perangkat", exact: true }).click(); await offlineForm.waitFor({ state: "detached" });
      assert.equal(await db.operationalRun.count({ where: { payload: { path: ["pic"], equals: "Offline device fixture PIC" } } }), 0);
      await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText("Offline: referensi terakhir tersimpan", { exact: false }).waitFor();
      const deviceDraft = page.locator("article").filter({ hasText: "Offline device fixture PIC" }); await deviceDraft.getByRole("button", { name: "Edit perangkat" }).click(); assert.equal(await page.getByRole("dialog").getByLabel("PIC lapangan", { exact: true }).inputValue(), "Offline device fixture PIC"); await page.getByRole("button", { name: "Batal", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "Submit", exact: true }).count(), 0); assert.equal(await deviceDraft.getByRole("button", { name: "Sync draft", exact: true }).isDisabled(), true);
      await context.setOffline(false); await page.getByRole("button", { name: "Muat ulang", exact: true }).click();
      const [syncResponse] = await Promise.all([page.waitForResponse((response: { url: () => string; request: () => { method: () => string } }) => response.url().endsWith("/api/operations/sync") && response.request().method() === "POST"), deviceDraft.getByRole("button", { name: "Sync draft", exact: true }).click()]);
      assert.equal(syncResponse.status(), 200, await syncResponse.text()); await deviceDraft.getByText(/^SYNCED \u00b7 UUID/).waitFor();
      const synced = await db.operationalRun.findFirstOrThrow({ where: { payload: { path: ["pic"], equals: "Offline device fixture PIC" } } }); assert.equal(synced.status, "DRAFT"); const ledgerCount = await db.stockLedgerEntry.count();
      await deviceDraft.getByRole("button", { name: "Sync draft", exact: true }).click(); await page.getByRole("status").filter({ hasText: "Memuat transaksi" }).waitFor({ state: "detached" });
      assert.equal(await db.operationalRun.count({ where: { requestKey: synced.requestKey } }), 1); assert.equal(await db.stockLedgerEntry.count(), ledgerCount);
      await deviceDraft.getByRole("button", { name: "Edit perangkat" }).click(); await page.getByRole("dialog").getByLabel("Tujuan / alasan").fill("Offline conflicting edit fixture"); await page.getByRole("dialog").getByRole("button", { name: "Simpan draft perangkat", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "detached" });
      await saveRun(db, checker, { payload: { ...synced.payload as object, reason: "Server newer source fixture" }, version: synced.version }, synced.id);
      await deviceDraft.getByRole("button", { name: "Sync draft", exact: true }).click(); await deviceDraft.getByText(/CONFLICT/).waitFor(); assert.equal((await db.operationalRun.findUniqueOrThrow({ where: { id: synced.id } })).payload && (await db.operationalRun.findUniqueOrThrow({ where: { id: synced.id } })).version, synced.version + 1);
      await page.goto(`${base}/fuel`); await page.getByRole("button", { name: "Receipt BBM baru", exact: true }).click(); const fuelForm = page.getByRole("dialog");
      await fuelForm.getByLabel("Plant transaksi", { exact: true }).selectOption(plants[2]); await fuelForm.getByLabel("PIC lapangan", { exact: true }).fill("Offline fuel fixture PIC"); await fuelForm.getByLabel("Definisi BBM verified").selectOption(fuelPolicy); await fuelForm.getByLabel("Tangki sumber / penerimaan").selectOption(tanks[2]); await fuelForm.getByLabel("Liter aktual").fill("2"); await fuelForm.getByLabel("Jenis sumber BBM").selectOption("SUPPLIER"); await fuelForm.getByLabel("Nama / dokumen sumber").fill("Offline fixture supplier");
      for (const label of ["Metode ukur / alat ukur", "Bukti / dokumen sumber", "Tujuan / alasan"]) await fuelForm.getByLabel(label, { exact: true }).fill("Offline fuel measured fixture");
      await waitForShell("/fuel"); await context.setOffline(true); await fuelForm.getByRole("button", { name: "Simpan draft perangkat", exact: true }).click(); await fuelForm.waitFor({ state: "detached" });
      await page.reload({ waitUntil: "domcontentloaded" }); const fuelDevice = page.locator("article").filter({ hasText: "Offline fuel fixture PIC" }); await fuelDevice.waitFor(); assert.equal(await db.operationalRun.count({ where: { payload: { path: ["pic"], equals: "Offline fuel fixture PIC" } } }), 0);
      await context.setOffline(false); await page.getByRole("button", { name: "Muat ulang", exact: true }).click();
      const [fuelSyncResponse] = await Promise.all([page.waitForResponse((r: { url: () => string }) => r.url().endsWith("/api/operations/sync")), fuelDevice.getByRole("button", { name: "Sync draft", exact: true }).click()]); assert.equal(fuelSyncResponse.status(), 200, await fuelSyncResponse.text()); await fuelDevice.getByText(/^SYNCED \u00b7 UUID/).waitFor();
      assert.equal((await db.operationalRun.findFirstOrThrow({ where: { payload: { path: ["pic"], equals: "Offline fuel fixture PIC" } } })).status, "DRAFT"); assert.equal(await db.stockLedgerEntry.count(), ledgerCount);
      const apiCached = await page.evaluate(async () => { for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) if (new URL(request.url).pathname.startsWith("/api/")) return true; return false; }); assert.equal(apiCached, false);
      await page.getByRole("button", { name: /^Buka menu akun/ }).click(); await page.getByRole("button", { name: "Logout", exact: true }).click(); await page.waitForURL(`${base}/login`); assert.equal(await page.evaluate(async () => new Promise<boolean>(resolve => { const open = indexedDB.open("quarryflow-drafts-v1", 1); open.onsuccess = () => { const db = open.result, count = db.transaction("drafts").objectStore("drafts").count(); count.onsuccess = () => { resolve(count.result === 0); db.close(); }; }; })), true); assert.equal(await page.evaluate(async () => (await caches.keys()).some(key => key.startsWith("quarryflow-shell-"))), false);
      await login(technical); assert.equal((await page.request.get(`${base}/api/operations?domain=production`)).status(), 403); assert.equal((await page.request.get(`${base}/api/operations?domain=fuel`)).status(), 403); await page.goto(`${base}/fuel`); await page.getByRole("heading", { name: "Akses ditolak", exact: true }).waitFor();
    } finally { await browser.close(); }
  });
});
