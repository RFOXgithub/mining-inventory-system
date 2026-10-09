import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { hash } from "bcryptjs";
import { PrismaClient, CommerceRecord, Prisma } from "@prisma/client";
import { AccessActor, allowedActions } from "../src/lib/access";
import { actCommerceConfig, actCommerceRecord, createCommerceConfig, saveCommerceRecord, recordSnapshot } from "../src/features/commerce/service";
import { commerceData } from "../src/features/commerce/query";
import { createStockDocument, actStockDocument, actStockPeriod } from "../src/features/inventory/ledger-service";

describe("quotation, PO and delivery on isolated PostgreSQL", { skip: process.env.RUN_COMMERCE_DB_TESTS !== "1", concurrency: false }, () => {
  const schema = `quarryflow_commerce_test_${randomUUID().replaceAll("-", "")}`, distDir = `.next-${schema}`;
  const plants = [randomUUID(), randomUUID()], store = randomUUID(), storeB = randomUUID(), goods = randomUUID(), service = randomUUID();
  const date = "2026-09-10T00:00:00Z", evidence = "Fictional fixture signed and measured evidence", freight = { mode: "PICKUP", term: "Fixture LOCO explicit zero freight", basis: "NONE", rate: "0", internalRate: "0" };
  let admin: PrismaClient, db: PrismaClient, url: string, created = false, server: ChildProcess | undefined, tsconfig: Buffer | undefined, nextEnv: Buffer | undefined;
  let maker: AccessActor, checker: AccessActor, manager: AccessActor, finance: AccessActor, technical: AccessActor;
  let uom: string, serviceUom: string, partyId: string, priceId: string, servicePrice: string, policyId: string, price = "100";
  const action = (action: string, row: { version: number }, extra = {}) => ({ action, version: row.version, reason: evidence, ...extra });
  const balance = async (locationId = store) => ((await db.stockLedgerEntry.aggregate({ where: { itemId: goods, locationId }, _sum: { quantity: true } }))._sum.quantity ?? new Prisma.Decimal(0)).toString();
  const sale = (kind = "SO", quantity = "10", extra = {}) => ({ kind, requestKey: randomUUID(), plantId: plants[0], effectiveAt: "2026-09-02T00:00:00Z", partyId, payment: "CASH", paymentTerm: evidence, evidence, reason: evidence, freight, lines: [{ key: randomUUID(), itemId: goods, uomId: uom, priceId, quantity, unitPrice: price }], ...extra });
  const completion = (row: CommerceRecord, accepted: string, rejected = "0") => ({ effectiveAt: "2026-09-10T01:00:00Z", receiver: "Fixture receiver", evidence, lines: recordSnapshot(row).dispatchLines!.map(l => ({ orderLineKey: l.orderLineKey, accepted, rejected })) });
  async function approved(payload: unknown) {
    const draft = await saveCommerceRecord(db, maker, { payload, version: 0 }), submitted = await actCommerceRecord(db, maker, draft.id, action("submit", draft)), verified = await actCommerceRecord(db, checker, draft.id, action("verify", submitted));
    return verified.status === "VERIFIED" ? actCommerceRecord(db, manager, verified.id, action("approve", verified)) : verified;
  }
  const deliveryInput = (order: CommerceRecord, quantity: string, extra = {}) => ({ kind: "DELIVERY", requestKey: randomUUID(), plantId: plants[0], salesOrderId: order.id, effectiveAt: date, evidence, reason: evidence, destination: "Fixture project site", mode: "PICKUP", customerVehicle: "Fixture customer vehicle identity", driver: "Fixture authorized driver", trips: 1, method: evidence, lines: [{ orderLineKey: recordSnapshot(order).lines[0].key, locationId: store, quantity }], ...extra });
  const ready = (order: CommerceRecord, quantity: string, extra = {}) => approved(deliveryInput(order, quantity, extra));
  const config = async (code: string, payload: object, revision = 1) => {
    const c = await createCommerceConfig(db, maker, { requestKey: randomUUID(), plantId: plants[0], code, revision, effectiveFrom: "2026-09-01T00:00:00Z", evidence, payload });
    return (await actCommerceConfig(db, manager, c.id, { action: "verify", evidence })).id;
  };
  before(async () => {
    if (!process.env.DATABASE_URL) process.loadEnvFile();
    const connection = new URL(process.env.DATABASE_URL!); connection.searchParams.set("connection_limit", "1"); connection.searchParams.set("pool_timeout", "30"); connection.searchParams.set("connect_timeout", "20");
    if (process.env.QUARRYFLOW_TEST_DIRECT_CONNECTION === "1" && connection.hostname.endsWith(".neon.tech")) connection.hostname = connection.hostname.replace("-pooler.", ".");
    admin = new PrismaClient({ datasourceUrl: connection.toString() }); assert.match(schema, /^quarryflow_commerce_test_[a-f0-9]{32}$/); console.info(`Owned fixture schema: ${schema}`);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    const source = new URL(connection); source.searchParams.set("connection_limit", "5"); source.searchParams.set("schema", schema); url = source.toString();
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" }, stdio: "pipe", timeout: 180000 });
    const scopedClient = new PrismaClient({ datasourceUrl: url, log: [{ emit: "event", level: "query" }] }); db = scopedClient;
    let scopedModel = false; scopedClient.$on("query", event => { if (event.query.includes(`"${schema}"."User"`)) scopedModel = true; });
    const tables = await db.$queryRaw<{ table_schema: string }[]>`SELECT table_schema FROM information_schema.tables WHERE table_schema=${schema} AND table_name='User'`;
    assert.deepEqual(tables.map(t => t.table_schema), [schema]); await db.user.count(); assert.ok(scopedModel, "Model writes must target the owned fixture schema");
    const passwordHash = await hash("Fixture-commerce-password-2026", 10);
    async function actor(role: string, functions: string[]): Promise<AccessActor> {
      const id = randomUUID(), roleRow = await db.role.findUniqueOrThrow({ where: { code: role } }), permissions = allowedActions(role, functions);
      await db.user.create({ data: { id, name: `${role} commerce fixture`, email: `${id}@example.test`, passwordHash, functions: functions as "PC"[], actionPermissions: permissions, roles: { create: { roleId: roleRow.id } } } });
      return { userId: id, roles: [role], functions, permissions, allPlants: false, plantIds: plants };
    }
    maker = await actor("ADMIN", ["PC"]); checker = await actor("ADMIN", ["PC"]); manager = await actor("MANAGER", []); finance = await actor("ADMIN", ["FINANCE"]); technical = await actor("SUPERADMIN", []);
    await db.plant.createMany({ data: plants.map((id, i) => ({ id, code: `COM-P${i}`, name: `Fixture commercial plant ${i}`, kind: "SC", createdBy: maker.userId, verificationStatus: "VERIFIED", verifiedBy: manager.userId })) });
    await db.userPlantScope.createMany({ data: [maker, checker, manager, finance].flatMap(a => plants.map(plantId => ({ userId: a.userId, plantId }))) });
    uom = (await db.uom.findUniqueOrThrow({ where: { code: "M3" } })).id;
    serviceUom = (await db.uom.create({ data: { code: "FIXTURE-HOUR", name: "Fixture hour", dimension: "TIME", verificationStatus: "VERIFIED", createdBy: maker.userId, verifiedBy: manager.userId } })).id;
    for (const [id, kind, primaryUomId] of [[goods, "PRODUCT", uom], [service, "SERVICE", serviceUom]]) await db.catalogItem.create({ data: { id, code: `COM-I-${kind}`, name: `Fixture ${kind}`, kind: kind as "PRODUCT", primaryUomId, category: "Fixture", createdBy: maker.userId, verificationStatus: "VERIFIED", verifiedBy: manager.userId, plants: { create: plants.map(plantId => ({ plantId })) } } });
    await db.plantLocation.createMany({ data: [store, storeB].map((id, i) => ({ id, code: `COM-STORE${i}`, name: `Fixture store ${i}`, plantId: plants[0], kind: "STOCKPILE", createdBy: maker.userId, verificationStatus: "VERIFIED", verifiedBy: manager.userId })) });
    for (const [locationId, quantity] of [[store, "100"], [storeB, "10"]]) {
      const receipt = await createStockDocument(db, maker, { requestKey: randomUUID(), kind: "RECEIPT", effectiveAt: "2026-09-01T00:00:00Z", evidence, reason: evidence, sourceType: "QUARRY", sourceName: "Fixture quarry", lines: [{ itemId: goods, locationId, quantity }] }); await actStockDocument(db, maker, receipt.id, { action: "post", reason: evidence });
    }
    partyId = await config("FIXTURE-PARTY", { kind: "PARTY", customerCode: "FIXTURE-CUSTOMER", customerName: "Fixture customer", projectCode: "FIXTURE-PROJECT", projectName: "Fixture project", address: "Fixture site", contact: "Fixture contact", taxReference: evidence });
    priceId = await config("FIXTURE-PRICE", { kind: "PRICE", partyCode: "FIXTURE-PARTY", itemId: goods, uomId: uom, unitPrice: price, currency: "IDR", taxTreatment: evidence, minimumOrder: "0", validUntil: "2026-12-31T00:00:00Z", freight });
    servicePrice = await config("FIXTURE-SERVICE", { kind: "PRICE", partyCode: "FIXTURE-PARTY", itemId: service, uomId: serviceUom, unitPrice: "250", currency: "IDR", taxTreatment: evidence, minimumOrder: "0", validUntil: "2026-12-31T00:00:00Z", freight });
  });
  after(async () => {
    if (server?.pid && server.exitCode === null) { if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "pipe" }); else server.kill("SIGTERM"); }
    if (tsconfig) writeFileSync("tsconfig.json", tsconfig); if (nextEnv) writeFileSync("next-env.d.ts", nextEnv);
    const generated = path.resolve(distDir); assert.equal(path.dirname(generated), process.cwd()); assert.match(path.basename(generated), /^\.next-quarryflow_commerce_test_[a-f0-9]{32}$/); rmSync(generated, { recursive: true, force: true });
    await db?.$disconnect(); if (created) { assert.match(schema, /^quarryflow_commerce_test_[a-f0-9]{32}$/); await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); } await admin?.$disconnect();
  });
  test("physical dispatch/pickup remains gated until PC, Finance and Manager attest", async () => {
    const order = await approved(sale("SO", "2")), plan = await ready(order, "2"), proof = completion(plan, "2");
    await assert.rejects(actCommerceRecord(db, maker, plan.id, action("pickup", plan, { completion: proof })), /Activation gate/);
    assert.equal(await balance(), "100"); assert.equal(await db.commerceFulfillment.count(), 0); assert.equal(await db.stockDocument.count({ where: { kind: "DELIVERY" } }), 0);
    const c = await createCommerceConfig(db, maker, { requestKey: randomUUID(), plantId: plants[0], code: "FIXTURE-EVENT", revision: 1, effectiveFrom: "2026-09-01T00:00:00Z", evidence, payload: { kind: "EVENT_POLICY", stockOutEvent: "VERIFIED_DISPATCH", completionRule: "ACCEPTED_WITH_PROOF", serviceRule: "VERIFIED_SERVICE_PROOF", pickupCombined: true } }); policyId = c.id;
    await assert.rejects(actCommerceConfig(db, manager, c.id, { action: "verify", evidence }), /sign-off/);
    await actCommerceConfig(db, maker, c.id, { action: "attest-pc", evidence });
    await assert.rejects(actCommerceConfig(db, { ...finance, userId: maker.userId }, c.id, { action: "attest-finance", evidence }), /berbeda/);
    await actCommerceConfig(db, finance, c.id, { action: "attest-finance", evidence }); await actCommerceConfig(db, manager, c.id, { action: "verify", evidence });
    await assert.rejects(actCommerceRecord(db, maker, plan.id, action("pickup", plan, { completion: completion(plan, "3") })), /Accepted/);
    assert.equal(await balance(), "100"); assert.equal(await db.commerceFulfillment.count(), 0); assert.equal(await db.stockDocument.count({ where: { kind: "DELIVERY" } }), 0);
    const posted = await actCommerceRecord(db, maker, plan.id, action("pickup", plan, { completion: proof })); assert.equal(posted.status, "COMPLETED"); assert.ok(posted.number.startsWith("DO-")); assert.ok(posted.stockDocumentId);
    await Promise.all([actCommerceRecord(db, maker, plan.id, action("pickup", plan, { completion: proof })), actCommerceRecord(db, checker, plan.id, action("dispatch", plan))]);
    assert.equal(await balance(), "98"); assert.equal(await db.commerceFulfillment.count({ where: { deliveryId: plan.id } }), 1); assert.equal(await db.stockLedgerEntry.count({ where: { documentId: posted.stockDocumentId! } }), 1);
    await assert.rejects(actCommerceRecord(db, maker, plan.id, action("pickup", plan, { completion: { ...proof, receiver: "Different receiver" } })), /replay berbeda/);
    await assert.rejects(db.commerceConfig.update({ where: { id: policyId }, data: { evidence: "Tampered evidence" } }));
  });
  test("optional quotation, price snapshots/deviation/minimum and immutable sources", async () => {
    const payload = sale("SO", "3"), draft = await saveCommerceRecord(db, maker, { payload, version: 0 }); assert.equal((await saveCommerceRecord(db, maker, { payload, version: 0 })).id, draft.id);
    const edited = await saveCommerceRecord(db, maker, { payload: { ...payload, reason: "Fixture edited reason" }, version: draft.version }, draft.id);
    await assert.rejects(saveCommerceRecord(db, maker, { payload, version: draft.version }, draft.id), /berubah/);
    const submitted = await actCommerceRecord(db, maker, draft.id, action("submit", edited)); await assert.rejects(actCommerceRecord(db, maker, draft.id, action("verify", submitted)), /sendiri/);
    const oldOrder = await actCommerceRecord(db, checker, draft.id, action("verify", submitted)); assert.equal(oldOrder.status, "APPROVED");
    const deviated = await saveCommerceRecord(db, maker, { payload: sale("SO", "3", { lines: [{ ...payload.lines[0], unitPrice: "99" }] }), version: 0 }), s = await actCommerceRecord(db, maker, deviated.id, action("submit", deviated)), v = await actCommerceRecord(db, checker, deviated.id, action("verify", s)); assert.equal(v.status, "VERIFIED");
    await assert.rejects(actCommerceRecord(db, checker, v.id, action("approve", v)), /diizinkan/); await actCommerceRecord(db, manager, v.id, action("approve", v));
    const quote = await approved(sale("QUOTATION", "3", { validUntil: "2026-12-31T00:00:00Z" })); assert.equal((await approved(sale("SO", "3", { quotationId: quote.id }))).status, "APPROVED");
    const generalPrice = await config("FIXTURE-GENERAL", { kind: "PRICE", partyCode: null, itemId: goods, uomId: uom, unitPrice: "110", currency: "IDR", taxTreatment: evidence, minimumOrder: "0", validUntil: "2026-12-31T00:00:00Z", freight });
    const bypass = await saveCommerceRecord(db, maker, { payload: sale("SO", "3", { lines: [{ ...payload.lines[0], priceId: generalPrice, unitPrice: "110" }] }), version: 0 }), bs = await actCommerceRecord(db, maker, bypass.id, action("submit", bypass)), bv = await actCommerceRecord(db, checker, bypass.id, action("verify", bs)); assert.equal(bv.status, "VERIFIED"); assert.equal(recordSnapshot(bv).lines[0].contractPrice, "100"); assert.equal((await actCommerceRecord(db, manager, bv.id, action("reject", bv))).status, "REJECTED");
    priceId = await config("FIXTURE-PRICE", { kind: "PRICE", partyCode: "FIXTURE-PARTY", itemId: goods, uomId: uom, unitPrice: "150", currency: "IDR", taxTreatment: evidence, minimumOrder: "0", validUntil: "2026-12-31T00:00:00Z", freight }, 2); price = "150";
    const stale = await saveCommerceRecord(db, maker, { payload: sale("SO", "3", { lines: payload.lines }), version: 0 }); await assert.rejects(actCommerceRecord(db, maker, stale.id, action("submit", stale)), /Version telah digantikan/);
    const plan = await ready(oldOrder, "1"); assert.equal(recordSnapshot(plan).dispatchLines![0].unitPrice, "100");
    const minimumPrice = await config("FIXTURE-MINIMUM", { kind: "PRICE", partyCode: "FIXTURE-PARTY", itemId: goods, uomId: uom, unitPrice: "150", currency: "IDR", taxTreatment: evidence, minimumOrder: "20", validUntil: "2026-12-31T00:00:00Z", freight });
    const below = await saveCommerceRecord(db, maker, { payload: sale("SO", "19", { lines: [{ ...payload.lines[0], quantity: "19", priceId: minimumPrice, unitPrice: price }] }), version: 0 }); await assert.rejects(actCommerceRecord(db, maker, below.id, action("submit", below)), /minimum/);
    const order = await approved(sale("SO", "20", { lines: [{ ...payload.lines[0], quantity: "20", priceId: minimumPrice, unitPrice: price }] })); assert.equal((await ready(order, "1")).status, "APPROVED");
    await assert.rejects(db.commerceRecord.update({ where: { id: oldOrder.id }, data: { payloadHash: "Tampered", version: { increment: 1 } } }));
    await assert.rejects(saveCommerceRecord(db, technical, { payload: sale(), version: 0 }), /diizinkan/);
  });
  test("PO amendment preserves line identity/history and cannot reduce realized commitment", async () => {
    const po = await approved(sale("PO", "10", { payment: "CONTRACT", externalNumber: "Fixture external PO amendment" })), original = recordSnapshot(po), line = original.lines[0];
    const duplicate = await saveCommerceRecord(db, maker, { payload: sale("PO", "10", { payment: "CONTRACT", externalNumber: "Fixture external PO amendment" }), version: 0 }); await assert.rejects(actCommerceRecord(db, maker, duplicate.id, action("submit", duplicate)), /gandakan commitment/); await actCommerceRecord(db, checker, duplicate.id, action("reject", duplicate));
    const order = await approved(sale("SO", "10", { payment: "CONTRACT", poId: po.id, lines: [{ key: randomUUID(), poLineKey: line.key, itemId: goods, uomId: uom, priceId, quantity: "10", unitPrice: price }] })), dispatched = await ready(order, "8"); await actCommerceRecord(db, checker, dispatched.id, action("dispatch", dispatched));
    const amendmentPayload = { ...(po.payload as object), requestKey: randomUUID(), previousId: po.id, lines: [{ ...(po.payload as { lines: object[] }).lines[0], quantity: "15" }], reason: "Fixture approved volume increase" };
    const amendedDraft = await saveCommerceRecord(db, maker, { payload: amendmentPayload, version: 0 });
    assert.equal((await commerceData(db, maker, new URL("https://fixture.test/api/commerce?domain=po"))).commitments.find(c => c.rootId === po.rootId)!.lines[0].remaining, "2");
    const amendedSubmitted = await actCommerceRecord(db, maker, amendedDraft.id, action("submit", amendedDraft)), amendedVerified = await actCommerceRecord(db, checker, amendedDraft.id, action("verify", amendedSubmitted));
    await assert.rejects(actCommerceRecord(db, maker, amendedDraft.id, action("approve", amendedVerified)), /diizinkan/);
    const amended = await actCommerceRecord(db, manager, amendedDraft.id, action("approve", amendedVerified)); assert.equal(amended.revision, 2); assert.equal(recordSnapshot(amended).lines[0].key, line.key); assert.equal(recordSnapshot(await db.commerceRecord.findUniqueOrThrow({ where: { id: po.id } })).lines[0].quantity, "10");
    const c = (await commerceData(db, maker, new URL("https://fixture.test/api/commerce?domain=po"))).commitments.find(c => c.rootId === po.rootId)!; assert.equal(c.lines[0].realized, "8"); assert.equal(c.lines[0].remaining, "7");
    const reduction = await saveCommerceRecord(db, maker, { payload: { ...amendmentPayload, requestKey: randomUUID(), previousId: amended.id, lines: [{ ...(po.payload as { lines: object[] }).lines[0], quantity: "7" }] }, version: 0 }); await assert.rejects(actCommerceRecord(db, maker, reduction.id, action("submit", reduction)), /Over-delivery/);
    const mutatedKey = await saveCommerceRecord(db, maker, { payload: { ...amendmentPayload, requestKey: randomUUID(), previousId: amended.id, lines: [{ ...(po.payload as { lines: object[] }).lines[0], key: randomUUID(), quantity: "15" }] }, version: 0 }).catch(e => e); assert.match(mutatedKey.message ?? "", /Amendment lain/);
    await actCommerceRecord(db, checker, reduction.id, action("reject", reduction));
    const changedKey = await saveCommerceRecord(db, maker, { payload: { ...amendmentPayload, requestKey: randomUUID(), previousId: amended.id, lines: [{ ...(po.payload as { lines: object[] }).lines[0], key: randomUUID(), quantity: "15" }] }, version: 0 }); await assert.rejects(actCommerceRecord(db, maker, changedKey.id, action("submit", changedKey)), /Identitas baris/); await actCommerceRecord(db, checker, changedKey.id, action("reject", changedKey));
    const order2 = await approved(sale("SO", "15", { payment: "CONTRACT", poId: amended.id, lines: [{ key: randomUUID(), poLineKey: line.key, itemId: goods, uomId: uom, priceId, quantity: "15", unitPrice: price }] }));
    const excess = await saveCommerceRecord(db, maker, { payload: deliveryInput(order2, "8"), version: 0 }); await assert.rejects(actCommerceRecord(db, maker, excess.id, action("submit", excess)), /Over-delivery/);
    const remainingDelivery = await ready(order2, "7"); assert.equal(recordSnapshot(remainingDelivery).poVersionId, amended.id);
    const history = (await commerceData(db, maker, new URL("https://fixture.test/api/commerce?domain=po"))).histories.filter(h => h.rootId === po.rootId); assert.equal(history.length, 4); assert.equal(history[1].previousId, po.id);
  });
  test("concurrent dispatch enforces both PO remaining and stock; failed posting rolls back", async () => {
    const po = await approved(sale("PO", "10", { payment: "CREDIT", externalNumber: "Fixture concurrent PO" })), l = recordSnapshot(po).lines[0];
    const orders = await Promise.all([0, 1].map(() => approved(sale("SO", "10", { payment: "CREDIT", poId: po.id, lines: [{ key: randomUUID(), poLineKey: l.key, itemId: goods, uomId: uom, priceId, quantity: "10", unitPrice: price }] }))));
    const plans = await Promise.all(orders.map(o => ready(o, "8"))), before = await balance();
    const results = await Promise.allSettled(plans.map(r => actCommerceRecord(db, checker, r.id, action("dispatch", r)))); assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(await balance(), new Prisma.Decimal(before).minus(8).toString());
    assert.equal((await db.commerceFulfillment.aggregate({ where: { poRootId: po.rootId }, _sum: { quantity: true } }))._sum.quantity!.toString(), "8");
    const winner = (results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<CommerceRecord>).value; await actCommerceRecord(db, checker, winner.id, action("dispatch", winner));
    const cashOrders = await Promise.all([0, 1].map(() => approved(sale("SO", "10")))), cashPlans = await Promise.all(cashOrders.map(o => ready(o, "8", { lines: [{ orderLineKey: recordSnapshot(o).lines[0].key, locationId: storeB, quantity: "8" }] })));
    const stockAttempts = await Promise.allSettled(cashPlans.map(r => actCommerceRecord(db, checker, r.id, action("dispatch", r)))); assert.equal(stockAttempts.filter(r => r.status === "fulfilled").length, 1); assert.equal(await balance(storeB), "2");
    const failed = cashPlans.find(r => !stockAttempts.some(a => a.status === "fulfilled" && a.value.id === r.id))!; assert.equal(await db.commerceFulfillment.count({ where: { deliveryId: failed.id } }), 0); assert.equal((await db.commerceRecord.findUniqueOrThrow({ where: { id: failed.id } })).stockDocumentId, null);
  });
  test("completion eligibility uses accepted proof without a second stock-out/PO event", async () => {
    const order = await approved(sale("SO", "4")), plan = await ready(order, "4"), dispatched = await actCommerceRecord(db, checker, plan.id, action("dispatch", plan));
    const before = await balance(), data = await commerceData(db, finance, new URL("https://fixture.test/api/commerce?domain=delivery")); assert.equal(data.eligibility.find(e => e.id === plan.id)!.lines[0].invoiceEligible, "0");
    await assert.rejects(actCommerceRecord(db, maker, plan.id, action("complete", dispatched, { completion: completion(plan, "5") })), /Accepted/);
    const proof = completion(plan, "3", "1"), completed = await actCommerceRecord(db, maker, plan.id, action("complete", dispatched, { completion: proof })); assert.equal(completed.status, "COMPLETED");
    await actCommerceRecord(db, checker, plan.id, action("complete", dispatched, { completion: proof })); assert.equal(await balance(), before); assert.equal(await db.commerceFulfillment.count({ where: { deliveryId: plan.id } }), 1);
    const eligible = (await commerceData(db, finance, new URL("https://fixture.test/api/commerce?domain=delivery"))).eligibility.find(e => e.id === plan.id)!; assert.equal(eligible.eligible, true); assert.equal(eligible.lines[0].dispatched, "4"); assert.equal(eligible.lines[0].invoiceEligible, "3");
    await assert.rejects(actStockDocument(db, maker, completed.stockDocumentId!, { action: "post", reason: evidence }), /workflow sumber DO/);
    await assert.rejects(createStockDocument(db, maker, { requestKey: randomUUID(), kind: "REVERSAL", effectiveAt: date, evidence, reason: evidence, reversalOfId: completed.stockDocumentId!, lines: [] }), /retur fisik/);
    const realization = await db.commerceFulfillment.findFirstOrThrow({ where: { deliveryId: plan.id } }); await assert.rejects(db.commerceFulfillment.update({ where: { id: realization.id }, data: { quantity: "1" } })); await assert.rejects(db.commerceRecord.delete({ where: { id: completed.id } }));
  });
  test("service/rental completion realizes commitments without inventory and refuses goods dispatch", async () => {
    const line = { key: randomUUID(), itemId: service, uomId: serviceUom, priceId: servicePrice, quantity: "5", unitPrice: "250" }, order = await approved(sale("SO", "5", { lines: [line] }));
    const plan = await ready(order, "5", { mode: "SERVICE", customerVehicle: undefined, lines: [{ orderLineKey: line.key, quantity: "5" }] }), before = await db.stockLedgerEntry.count();
    await assert.rejects(actCommerceRecord(db, maker, plan.id, action("dispatch", plan)), /Status\/action/);
    const proof = completion(plan, "5"), completed = await actCommerceRecord(db, maker, plan.id, action("complete", plan, { completion: proof })); assert.equal(completed.stockDocumentId, null); assert.equal(await db.stockLedgerEntry.count(), before); assert.equal(await db.commerceFulfillment.count({ where: { deliveryId: plan.id } }), 1);
    await actCommerceRecord(db, maker, plan.id, action("complete", plan, { completion: proof })); assert.equal(await db.commerceFulfillment.count({ where: { deliveryId: plan.id } }), 1);
    const goodsPlan = await saveCommerceRecord(db, maker, { payload: deliveryInput(order, "1"), version: 0 }); await assert.rejects(actCommerceRecord(db, maker, goodsPlan.id, action("submit", goodsPlan)), /Jasa\/sewa/);
  });
  test("company delivery snapshots verified assignment and separates billed/internal freight", async () => {
    const shipping = { mode: "DELIVERY", term: "Fixture delivered project term", basis: "PER_TRIP", rate: "50", internalRate: "30" }, shippingPrice = await config("FIXTURE-SHIPPING", { kind: "PRICE", partyCode: "FIXTURE-PARTY", itemId: goods, uomId: uom, unitPrice: price, currency: "IDR", taxTreatment: evidence, minimumOrder: "0", validUntil: "2026-12-31T00:00:00Z", freight: shipping });
    const vehicleId = await config("FIXTURE-VEHICLE", { kind: "VEHICLE", name: "Fixture verified truck", identity: "Fixture verified plate", ownership: "Fixture rental contract", driver: "Fixture verified driver" });
    const order = await approved(sale("SO", "2", { freight: shipping, lines: [{ key: randomUUID(), itemId: goods, uomId: uom, priceId: shippingPrice, quantity: "2", unitPrice: price }] }));
    const wrong = await saveCommerceRecord(db, maker, { payload: deliveryInput(order, "1", { mode: "DELIVERY", customerVehicle: undefined, vehicleId, driver: "Unverified assignment" }), version: 0 }); await assert.rejects(actCommerceRecord(db, maker, wrong.id, action("submit", wrong)), /assignment/);
    const plan = await ready(order, "1", { mode: "DELIVERY", customerVehicle: undefined, vehicleId, driver: "Fixture verified driver", trips: 2 }); assert.equal(recordSnapshot(plan).freightCharge, "100"); assert.equal(recordSnapshot(plan).internalFreight, "60"); assert.equal((recordSnapshot(plan).vehicle as { id: string }).id, vehicleId);
    const dispatched = await actCommerceRecord(db, checker, plan.id, action("dispatch", plan)); assert.equal(dispatched.status, "DISPATCHED"); await actCommerceRecord(db, maker, plan.id, action("complete", dispatched, { completion: completion(plan, "1") }));
  });
  test("all references and retry remain scoped; pending delivery blocks inventory closing", async () => {
    const restricted = { ...maker, plantIds: [plants[1]] }; await assert.rejects(commerceData(db, restricted, new URL(`https://fixture.test/api/commerce?plantId=${plants[0]}`)), /cakupan/);
    const order = await approved(sale("SO", "2")); await assert.rejects(saveCommerceRecord(db, restricted, { payload: deliveryInput(order, "1", { plantId: plants[1] }), version: 0 }), /diizinkan/);
    const plan = await saveCommerceRecord(db, maker, { payload: deliveryInput(order, "1", { effectiveAt: "2026-11-01T00:00:00Z" }), version: 0 });
    await actStockPeriod(db, maker, { plantId: plants[0], month: "2026-11", version: 0, action: "request-close", reason: evidence }); await actStockPeriod(db, finance, { plantId: plants[0], month: "2026-11", version: 1, action: "finance", reason: evidence }); await assert.rejects(actStockPeriod(db, manager, { plantId: plants[0], month: "2026-11", version: 2, action: "approve", reason: evidence }), /menunggu/);
    await actCommerceRecord(db, checker, plan.id, action("reject", plan));
    // Earlier undelivered/in-transit sources also block the cut-off; resolve them explicitly.
    await actStockPeriod(db, finance, { plantId: plants[0], month: "2026-11", version: 2, action: "finance", reason: evidence });
    await assert.rejects(actStockPeriod(db, manager, { plantId: plants[0], month: "2026-11", version: 3, action: "approve", reason: evidence }), /menunggu/);
    const carryover = await db.commerceRecord.findMany({ where: { plantId: plants[0], kind: "DELIVERY", status: { in: ["DRAFT", "SUBMITTED", "VERIFIED", "APPROVED", "DISPATCHED"] }, effectiveAt: { lt: new Date("2026-12-01T00:00:00+07:00") } } }); assert.ok(carryover.length);
    for (const row of carryover) { if (row.status === "DISPATCHED") await actCommerceRecord(db, maker, row.id, action("complete", row, { completion: completion(row, recordSnapshot(row).dispatchLines![0].quantity) })); else await actCommerceRecord(db, checker, row.id, action("reject", row)); }
    await actStockPeriod(db, finance, { plantId: plants[0], month: "2026-11", version: 3, action: "finance", reason: evidence }); await actStockPeriod(db, manager, { plantId: plants[0], month: "2026-11", version: 4, action: "approve", reason: evidence });
    const denied = await saveCommerceRecord(db, maker, { payload: sale("SO", "1", { payment: "CREDIT", poId: randomUUID() }), version: 0 }).catch(e => e); assert.match(denied.message, /tidak ditemukan/);
    assert.equal((await commerceData(db, restricted, new URL("https://fixture.test/api/commerce"))).records.length, 0);
  });
  test("browser composers, PO commitments and delivery workspace are responsive and scoped", { skip: !process.env.COMMERCE_PLAYWRIGHT_MODULE, timeout: 600000 }, async () => {
    const { chromium } = createRequire(path.resolve("package.json"))(process.env.COMMERCE_PLAYWRIGHT_MODULE!);
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
      const login = async (actor: AccessActor) => { const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } }); await page.goto(`${base}/login`); await page.getByLabel("Email *").fill(user.email); await page.getByLabel("Kata sandi *").fill("Fixture-commerce-password-2026"); await page.getByRole("button", { name: "Masuk ke StoneCrusher" }).click(); await page.waitForURL((u: URL) => u.pathname !== "/login"); };
      const loaded = async () => page.getByRole("status").filter({ hasText: "Memuat transaksi" }).waitFor({ state: "detached" });
      await login(maker);
      for (const [route, title] of [["sales-orders", "Quotation / Sales Order"], ["customer-pos", "Customer PO & Amendment"], ["deliveries", "Delivery / DO / Pickup"]]) {
        await page.goto(`${base}/${route}`); await page.getByRole("heading", { name: title, exact: true }).waitFor(); await loaded();
        for (const width of [1440, 1024, 768, 390, 360]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); }
      }
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(`${base}/sales-orders`); await loaded(); await page.getByRole("button", { name: "SO baru", exact: true }).click(); const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Plant", { exact: true }).selectOption(plants[0]); await dialog.getByLabel("Customer / proyek verified", { exact: true }).selectOption(partyId); await dialog.getByLabel("Term pembayaran / sumber persetujuan").fill(evidence); await dialog.getByLabel("Tambah item dari harga verified").selectOption(priceId); await dialog.getByLabel("Quantity item 1").fill("1"); await dialog.getByLabel("Referensi bukti / lampiran").fill("Browser commerce fixture evidence"); await dialog.getByLabel("Catatan / alasan sumber").fill(evidence);
      for (const width of [1440, 1024, 768, 390, 360]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await dialog.evaluate((element: HTMLElement) => element.scrollWidth <= element.clientWidth + 1)); }
      await dialog.getByRole("button", { name: "Simpan draft", exact: true }).click(); await dialog.waitFor({ state: "detached" }); await loaded();
      const saved = await db.commerceRecord.findFirstOrThrow({ where: { payload: { path: ["evidence"], equals: "Browser commerce fixture evidence" } } }); await page.getByRole("button").filter({ hasText: saved.number }).click();
      await page.getByRole("button", { name: "Submit", exact: true }).click(); const d = page.getByRole("dialog"); await d.getByLabel("Alasan / sumber bukti keputusan").fill(evidence); await d.getByRole("button", { name: "Konfirmasi", exact: true }).click(); await d.waitFor({ state: "detached" }); await loaded();
      await login(checker); await page.goto(`${base}/sales-orders`); await loaded(); await page.getByRole("button").filter({ hasText: saved.number }).click(); await page.getByRole("button", { name: "Verifikasi PC", exact: true }).click(); const check = page.getByRole("dialog"); await check.getByLabel("Alasan / sumber bukti keputusan").fill(evidence); await check.getByRole("button", { name: "Konfirmasi", exact: true }).click(); await check.waitFor({ state: "detached" }); await loaded(); assert.equal((await db.commerceRecord.findUniqueOrThrow({ where: { id: saved.id } })).status, "APPROVED");
      await page.goto(`${base}/deliveries`); await loaded(); await page.getByRole("button", { name: "Rencana DO / layanan", exact: true }).click(); const plan = page.getByRole("dialog"); await plan.getByLabel("Plant", { exact: true }).selectOption(plants[0]); await plan.getByLabel("SO approved").selectOption(saved.id); await plan.getByLabel("Jalur delivery").selectOption("PICKUP"); await plan.getByLabel("Tujuan / lokasi layanan").fill("Browser fixture project"); await plan.getByLabel("Identitas kendaraan customer").fill("Browser fixture pickup plate"); await plan.getByLabel("Driver / PIC layanan").fill("Browser fixture driver"); await plan.getByLabel("Metode ukur / bukti aktual").fill(evidence); await plan.getByRole("checkbox").check(); await plan.getByLabel("Quantity keluar Fixture PRODUCT").fill("1"); await plan.getByLabel("Lokasi Fixture PRODUCT").selectOption(store); await plan.getByLabel("Referensi bukti / lampiran").fill("Browser delivery fixture evidence"); await plan.getByLabel("Catatan / alasan sumber").fill(evidence);
      await plan.getByRole("button", { name: "Simpan draft", exact: true }).click(); await plan.waitFor({ state: "detached" }); await loaded();
      const delivery = await db.commerceRecord.findFirstOrThrow({ where: { payload: { path: ["evidence"], equals: "Browser delivery fixture evidence" } } }); assert.ok(delivery.number.startsWith("DO-"));
      const decide = async (label: string) => { await page.getByRole("button", { name: label, exact: true }).click(); const decision = page.getByRole("dialog"); await decision.getByLabel("Alasan / sumber bukti keputusan").fill(evidence); await decision.getByRole("button", { name: "Konfirmasi", exact: true }).click(); await decision.waitFor({ state: "detached" }); await loaded(); };
      await page.getByRole("button").filter({ hasText: delivery.number }).click(); await decide("Submit");
      await login(maker); await page.goto(`${base}/deliveries`); await loaded(); await page.getByRole("button").filter({ hasText: delivery.number }).click(); await decide("Verifikasi PC");
      const verified = await db.commerceRecord.findUniqueOrThrow({ where: { id: delivery.id } }), stockBefore = await balance();
      await page.getByRole("button", { name: "Pickup: dispatch + complete", exact: true }).click(); const pickup = page.getByRole("dialog"); await pickup.getByLabel("Penerima / PIC customer").fill("Browser fixture receiver"); await pickup.getByLabel("Accepted Fixture PRODUCT").fill("1"); await pickup.getByLabel("Rejected Fixture PRODUCT").fill("0"); await pickup.getByLabel("Bukti serah terima / layanan").fill(evidence); await pickup.getByLabel("Catatan completion").fill(evidence); await pickup.getByRole("button", { name: "Post completion", exact: true }).click(); await pickup.waitFor({ state: "detached" }); await loaded();
      const completed = await db.commerceRecord.findUniqueOrThrow({ where: { id: delivery.id } }); assert.equal(completed.status, "COMPLETED"); assert.equal(await balance(), new Prisma.Decimal(stockBefore).minus(1).toString());
      const retry = await page.request.post(`${base}/api/commerce/records/${delivery.id}`, { headers: { origin: base }, data: { action: "pickup", version: verified.version, reason: evidence, completion: completed.completion } }); assert.equal(retry.status(), 200); assert.equal(await db.commerceFulfillment.count({ where: { deliveryId: delivery.id } }), 1);
      await login(technical); assert.equal((await page.request.get(`${base}/api/commerce?domain=delivery`)).status(), 403); await page.goto(`${base}/customer-pos`); await page.getByRole("heading", { name: "Akses ditolak", exact: true }).waitFor();
    } finally { await browser.close(); }
  });
});
