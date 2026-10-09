import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { hash } from "bcryptjs";
import { FinancialRecord, Prisma, PrismaClient } from "@prisma/client";
import { AccessActor, allowedActions } from "../src/lib/access";
import { actCommerceConfig, actCommerceRecord, createCommerceConfig, saveCommerceRecord, recordSnapshot } from "../src/features/commerce/service";
import { commerceData } from "../src/features/commerce/query";
import { createStockDocument, actStockDocument, actStockPeriod } from "../src/features/inventory/ledger-service";
import { actFinancialConfig, actFinancialRecord, createFinancialConfig, saveFinancialRecord } from "../src/features/finance/service";
import { financeData } from "../src/features/finance/query";
import { officialReport, dashboardData, exportReport } from "../src/features/core/reports";
import { createConfig as createStageConfig, actConfig as actStageConfig } from "../src/features/stage2/configs";
import { saveRecord as saveStageRecord, actRecord as actStageRecord } from "../src/features/stage2/documents";
import { uploadFile, downloadFile } from "../src/features/stage2/files";
import { stageData } from "../src/features/stage2/query";

describe("financial ledger on isolated PostgreSQL", { skip: process.env.RUN_FINANCE_DB_TESTS !== "1", concurrency: false }, () => {
  const schema = `quarryflow_finance_test_${randomUUID().replaceAll("-", "")}`, distDir = `.next-${schema}`, plants = [randomUUID(), randomUUID()], store = randomUUID(), goods = randomUUID(), service = randomUUID();
  const evidence = "Fictional fixture verified evidence, not company parameters", freight = { mode: "PICKUP", term: "Fixture freight policy", basis: "PER_TRIP", rate: "5", internalRate: "3" };
  const date = (day: number) => `2026-09-${String(day).padStart(2, "0")}T02:00:00Z`;
  let admin: PrismaClient, db: PrismaClient, url: string, created = false, server: ChildProcess | undefined, tsconfig: Buffer | undefined, nextEnv: Buffer | undefined;
  let pc: AccessActor, pcPeer: AccessActor, finance: AccessActor, financePeer: AccessActor, manager: AccessActor, technical: AccessActor;
  let uom: string, hours: string, partyId: string, priceId: string, servicePrice: string, accountId: string, taxId: string, termId: string;
  const action = (action: string, row: { version: number }) => ({ action, version: row.version, reason: evidence });
  const financial = (kind: string, extra = {}, day = 12) => ({ kind, requestKey: randomUUID(), plantId: plants[0], effectiveAt: date(day), evidence, reason: evidence, ...extra });
  const save = (payload: unknown) => saveFinancialRecord(db, finance, { payload, version: 0 });
  const act = (row: FinancialRecord, name: string, actor = finance) => actFinancialRecord(db, actor, row.id, action(name, row));
  const report = (asOf = "2026-09-30", actor = finance) => financeData(db, actor, new URL(`https://fixture.test/api/finance?asOf=${asOf}`));
  const balance = async () => ((await db.stockLedgerEntry.aggregate({ where: { itemId: goods, locationId: store }, _sum: { quantity: true } }))._sum.quantity!.toString());
  async function commerceConfig(code: string, payload: object) {
    const c = await createCommerceConfig(db, pc, { requestKey: randomUUID(), plantId: plants[0], code, revision: 1, effectiveFrom: date(1), evidence, payload });
    return (await actCommerceConfig(db, manager, c.id, { action: "verify", evidence })).id;
  }
  async function config(code: string, payload: object, revision = 1, effectiveFrom = date(1)) {
    const c = await createFinancialConfig(db, finance, { requestKey: randomUUID(), plantId: plants[0], code, revision, effectiveFrom, evidence, payload });
    await actFinancialConfig(db, financePeer, c.id, { action: "finance", evidence }); return actFinancialConfig(db, manager, c.id, { action: "verify", evidence });
  }
  async function approved(payload: unknown) {
    const draft = await saveCommerceRecord(db, pc, { payload, version: 0 }), submitted = await actCommerceRecord(db, pc, draft.id, action("submit", draft)), verified = await actCommerceRecord(db, pcPeer, draft.id, action("verify", submitted));
    return verified.status === "VERIFIED" ? actCommerceRecord(db, manager, draft.id, action("approve", verified)) : verified;
  }
  async function completed(quantity = "2", accepted = quantity, isService = false, credit = false) {
    const line = { key: randomUUID(), itemId: isService ? service : goods, uomId: isService ? hours : uom, priceId: isService ? servicePrice : priceId, quantity, unitPrice: "100" };
    const base = { requestKey: randomUUID(), plantId: plants[0], effectiveAt: date(2), partyId, payment: credit ? "CREDIT" : "CASH", paymentTerm: evidence, evidence, reason: evidence, freight, lines: [line] };
    const po = credit ? await approved({ ...base, kind: "PO", externalNumber: randomUUID() }) : undefined;
    const order = await approved({ ...base, requestKey: randomUUID(), kind: "SO", ...(po ? { poId: po.id, lines: [{ ...line, key: randomUUID(), poLineKey: line.key }] } : {}) });
    const plan = await approved({ kind: "DELIVERY", requestKey: randomUUID(), plantId: plants[0], effectiveAt: date(10), salesOrderId: order.id, mode: isService ? "SERVICE" : "PICKUP", customerVehicle: isService ? undefined : "Fixture pickup vehicle", destination: "Fixture project", driver: "Fixture driver/PIC", trips: 1, method: evidence, evidence, reason: evidence, lines: [{ orderLineKey: recordSnapshot(order).lines[0].key, quantity, ...(isService ? {} : { locationId: store }) }] });
    return actCommerceRecord(db, pc, plan.id, { ...action(isService ? "complete" : "pickup", plan), completion: { effectiveAt: date(11), receiver: "Fixture customer", evidence, lines: [{ orderLineKey: recordSnapshot(order).lines[0].key, accepted, rejected: new Prisma.Decimal(quantity).minus(accepted).toString() }] } });
  }
  const invoicePayload = (delivery: Awaited<ReturnType<typeof completed>>, quantity: string, extra = {}, day = 12) => financial("INVOICE", { billingMonth: "2026-09", taxId, lines: [{ role: "ITEM", deliveryId: delivery.id, sourceKey: recordSnapshot(delivery).dispatchLines![0].orderLineKey, quantity }], ...extra }, day);
  const issue = async (quantity = "2", credit = false) => { const delivery = await completed(quantity, quantity, false, credit); const draft = await save(invoicePayload(delivery, quantity, credit ? { termId } : {})); return act(draft, "issue"); };
  const receipt = async (money = "300", day = 13) => act(await save(financial("RECEIPT", { partyId, accountId, currency: "IDR", amount: money, bankReference: randomUUID() }, day)), "post");
  const allocation = async (invoice: FinancialRecord, receipt: FinancialRecord, money: string, day = 15) => act(await save(financial("ALLOCATION", { receiptId: receipt.id, lines: [{ invoiceId: invoice.id, amount: money }] }, day)), "post");
  const withholding = async (invoice: FinancialRecord, money: string, day = 16, extra = {}) => { const draft = await save(financial("PPH", { invoiceId: invoice.id, amount: money, certificateNumber: randomUUID(), certificateDate: date(day).slice(0, 10), payerTaxIdentity: "Fixture payer tax identity", ...extra }, day)); return act(draft, "submit"); };
  const correction = async (target: FinancialRecord, day = 20) => act(await save(financial("CORRECTION", { targetId: target.id }, day)), "submit");
  before(async () => {
    if (!process.env.DATABASE_URL) process.loadEnvFile(); const connection = new URL(process.env.DATABASE_URL!); connection.searchParams.set("connection_limit", "1");
    admin = new PrismaClient({ datasourceUrl: connection.toString() }); assert.match(schema, /^quarryflow_finance_test_[a-f0-9]{32}$/); console.info(`Owned fixture schema: ${schema}`); await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    const source = new URL(connection); source.searchParams.set("schema", schema); source.searchParams.set("connection_limit", "5"); url = source.toString();
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" }, stdio: "pipe", timeout: 180000 });
    const client = new PrismaClient({ datasourceUrl: url, log: [{ emit: "event", level: "query" }] }); db = client; let scoped = false; client.$on("query", e => { if (e.query.includes(`"${schema}"."User"`)) scoped = true; });
    const tables = await db.$queryRaw<{ table_schema: string }[]>`SELECT table_schema FROM information_schema.tables WHERE table_schema=${schema} AND table_name='FinancialEvent'`;
    assert.deepEqual(tables.map(t => t.table_schema), [schema]); await db.user.count(); assert.ok(scoped);
    const passwordHash = await hash("Fixture-finance-password-2026", 10);
    async function actor(role: string, functions: string[]): Promise<AccessActor> {
      const id = randomUUID(), permissions = allowedActions(role, functions), roleRow = await db.role.findUniqueOrThrow({ where: { code: role } });
      await db.user.create({ data: { id, name: `${role} finance fixture`, email: `${id}@example.test`, passwordHash, functions: functions as "PC"[], actionPermissions: permissions, roles: { create: { roleId: roleRow.id } } } }); return { userId: id, roles: [role], functions, permissions, plantIds: plants, allPlants: false };
    }
    pc = await actor("ADMIN", ["PC"]); pcPeer = await actor("ADMIN", ["PC"]); finance = await actor("ADMIN", ["FINANCE"]); financePeer = await actor("ADMIN", ["FINANCE"]); manager = await actor("MANAGER", []); technical = await actor("SUPERADMIN", []);
    await db.plant.createMany({ data: plants.map((id, i) => ({ id, code: `FIN-P${i}`, name: `Fixture finance plant ${i}`, kind: "SC", verificationStatus: "VERIFIED", createdBy: pc.userId, verifiedBy: manager.userId })) });
    await db.userPlantScope.createMany({ data: [pc, pcPeer, finance, financePeer, manager].flatMap(a => plants.map(plantId => ({ userId: a.userId, plantId }))) });
    uom = (await db.uom.findUniqueOrThrow({ where: { code: "M3" } })).id; hours = (await db.uom.create({ data: { code: "FIX-HOUR", name: "Fixture hour", dimension: "TIME", verificationStatus: "VERIFIED", createdBy: pc.userId, verifiedBy: manager.userId } })).id;
    for (const [id, kind, primaryUomId] of [[goods, "PRODUCT", uom], [service, "SERVICE", hours]]) await db.catalogItem.create({ data: { id, code: `FIN-${kind}`, name: `Fixture ${kind}`, kind: kind as "PRODUCT", primaryUomId, category: "Fixture", verificationStatus: "VERIFIED", createdBy: pc.userId, verifiedBy: manager.userId, plants: { create: plants.map(plantId => ({ plantId })) } } });
    await db.plantLocation.create({ data: { id: store, code: "FIN-STORE", name: "Fixture store", plantId: plants[0], kind: "STOCKPILE", verificationStatus: "VERIFIED", createdBy: pc.userId, verifiedBy: manager.userId } });
    const initial = await createStockDocument(db, pc, { requestKey: randomUUID(), kind: "RECEIPT", effectiveAt: date(1), evidence, reason: evidence, sourceType: "QUARRY", sourceName: "Fixture quarry", lines: [{ itemId: goods, locationId: store, quantity: "1000" }] }); await actStockDocument(db, pc, initial.id, { action: "post", reason: evidence });
    partyId = await commerceConfig("FIX-PARTY", { kind: "PARTY", customerCode: "FIX-CUSTOMER", customerName: "Fixture customer", projectCode: "FIX-PROJECT", projectName: "Fixture project", address: "Fixture site", contact: "Fixture contact", taxReference: evidence });
    priceId = await commerceConfig("FIX-PRICE", { kind: "PRICE", partyCode: "FIX-PARTY", itemId: goods, uomId: uom, unitPrice: "100", currency: "IDR", taxTreatment: evidence, minimumOrder: "0", validUntil: "2026-12-31T00:00:00Z", freight });
    servicePrice = await commerceConfig("FIX-SERVICE", { kind: "PRICE", partyCode: "FIX-PARTY", itemId: service, uomId: hours, unitPrice: "100", currency: "IDR", taxTreatment: evidence, minimumOrder: "0", validUntil: "2026-12-31T00:00:00Z", freight });
    const gate = await createCommerceConfig(db, pc, { requestKey: randomUUID(), plantId: plants[0], code: "FIX-EVENT", revision: 1, effectiveFrom: date(1), evidence, payload: { kind: "EVENT_POLICY", stockOutEvent: "VERIFIED_DISPATCH", completionRule: "ACCEPTED_WITH_PROOF", serviceRule: "VERIFIED_SERVICE_PROOF", pickupCombined: true } });
    await actCommerceConfig(db, pc, gate.id, { action: "attest-pc", evidence }); await actCommerceConfig(db, finance, gate.id, { action: "attest-finance", evidence }); await actCommerceConfig(db, manager, gate.id, { action: "verify", evidence });
    accountId = (await config("FIX-ACCOUNT", { kind: "ACCOUNT", bank: "Fixture bank", number: "Fixture account number", holder: "Fixture company", ownership: "COMPANY", currency: "IDR", receiptAllowed: true, settlementTreatment: evidence })).id;
    taxId = (await config("FIX-TAX", { kind: "TAX", commercialTreatment: evidence, currency: "IDR", rate: "0", calculation: "NONE", base: "ITEMS_FREIGHT", rounding: "HALF_UP", roundAt: "TOTAL" })).id;
    termId = (await config("FIX-TERM", { kind: "TERM", partyCode: "FIX-PARTY", basis: "INVOICE", days: 2, deliveryBasis: "LAST_COMPLETION", schedule: "PERIODIC" })).id;
  });
  after(async () => {
    if (server?.pid && server.exitCode === null) { if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "pipe" }); else server.kill("SIGTERM"); }
    if (tsconfig) writeFileSync("tsconfig.json", tsconfig); if (nextEnv) writeFileSync("next-env.d.ts", nextEnv);
    const generated = path.resolve(distDir); assert.equal(path.dirname(generated), process.cwd()); assert.match(path.basename(generated), /^\.next-quarryflow_finance_test_[a-f0-9]{32}$/); rmSync(generated, { recursive: true, force: true });
    await db?.$disconnect(); if (created) { assert.match(schema, /^quarryflow_finance_test_[a-f0-9]{32}$/); await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); } await admin?.$disconnect();
  });
  test("parameter versions require separate Finance attest and Manager; only dependent posting is gated", async () => {
    const c = await createFinancialConfig(db, finance, { requestKey: randomUUID(), plantId: plants[0], code: "FIX-GATED", revision: 1, effectiveFrom: date(1), evidence, payload: { kind: "ACCOUNT", bank: "Fixture bank", number: "Fixture pending", holder: "Fixture third party", ownership: "THIRD_PARTY", currency: "IDR", receiptAllowed: true, settlementTreatment: evidence } });
    await assert.rejects(actFinancialConfig(db, manager, c.id, { action: "verify", evidence }), /attest/); await assert.rejects(actFinancialConfig(db, finance, c.id, { action: "finance", evidence }), /berbeda/);
    const draft = await save(financial("RECEIPT", { partyId, currency: "IDR", amount: "10", bankReference: "Fixture bank actual" })); await assert.rejects(act(draft, "post"), /rekening verified/);
    await actFinancialConfig(db, financePeer, c.id, { action: "finance", evidence }); await actFinancialConfig(db, manager, c.id, { action: "verify", evidence });
    const corrected = await saveFinancialRecord(db, finance, { payload: { ...draft.payload as object, accountId: c.id }, version: draft.version }, draft.id); await act(corrected, "post");
    await assert.rejects(db.financialConfig.update({ where: { id: c.id }, data: { code: "tamper" } })); await assert.rejects(saveFinancialRecord(db, pc, { payload: financial("RECEIPT", { partyId, amount: "1", currency: "IDR", bankReference: "Fixture" }), version: 0 }), /diizinkan/);
  });
  test("accepted partial billing and customer freight snapshots never post inventory again", async () => {
    const delivery = await completed("3", "2"), stock = await balance(); await assert.rejects(save(invoicePayload(delivery, "2.000001")), /Double-billing/);
    const draft = await save(invoicePayload(delivery, "1", { lines: [{ role: "ITEM", deliveryId: delivery.id, sourceKey: recordSnapshot(delivery).dispatchLines![0].orderLineKey, quantity: "1" }, { role: "FREIGHT", deliveryId: delivery.id, amount: "5" }] }));
    const posted = await act(draft, "issue"); assert.equal((posted.snapshot as { total: string }).total, "105"); assert.equal(await balance(), stock);
    const second = await act(await save(invoicePayload(delivery, "1")), "issue"); assert.equal((second.snapshot as { total: string }).total, "100"); await assert.rejects(save(invoicePayload(delivery, "0.1")), /Double-billing/);
    await assert.rejects(save(invoicePayload(delivery, "1", { lines: [{ role: "FREIGHT", deliveryId: delivery.id, amount: "3" }] })), /Freight/);
    const d = await commerceData(db, finance, new URL("https://fixture.test/api/commerce?domain=delivery")); assert.equal(d.eligibility.find(e => e.id === delivery.id)?.lines[0].invoiceEligible, "0");
  });
  test("concurrent double-billing has one winner and issue retries do not duplicate claims/events", async () => {
    const delivery = await completed(), a = await save(invoicePayload(delivery, "2")), b = await save(invoicePayload(delivery, "2"));
    const results = await Promise.allSettled([act(a, "issue"), act(b, "issue")]); assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const posted = (results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<FinancialRecord>).value, before = [a, b].find(r => r.id === posted.id)!;
    await Promise.all([act(before, "issue"), act(before, "issue")]); assert.equal(await db.financialEvent.count({ where: { recordId: posted.id } }), 1); assert.equal(await db.financialInvoiceLine.count({ where: { invoiceId: posted.id } }), 1);
    await assert.rejects(db.financialEvent.deleteMany({ where: { recordId: posted.id } })); await assert.rejects(db.financialInvoiceLine.updateMany({ where: { invoiceId: posted.id }, data: { amount: new Prisma.Decimal(1) } }));
  });
  test("credit needs verified term/tax; cash may lack due date; service billing preserves inventory", async () => {
    const delivery = await completed("2", "2", true, true), stock = await balance(); let draft = await save(invoicePayload(delivery, "2", { taxId: undefined })); await assert.rejects(act(draft, "issue"), /Pilih pajak/);
    draft = await saveFinancialRecord(db, finance, { payload: { ...draft.payload as object, taxId }, version: draft.version }, draft.id); await assert.rejects(act(draft, "issue"), /term verified/);
    draft = await saveFinancialRecord(db, finance, { payload: { ...draft.payload as object, termId }, version: draft.version }, draft.id); const posted = await act(draft, "issue"); assert.equal(posted.dueDate, "2026-09-14"); assert.equal(await balance(), stock);
    const cash = await issue(); assert.equal(cash.dueDate, null); assert.ok((await report()).exceptions.some(e => e.id === cash.id && e.kind === "MISSING_DUE_DATE"));
  });
  test("receipt overpayment remains unallocated and PPh affects outstanding only after peer verification", async () => {
    const invoice = await issue(), funds = await receipt(), alloc = await allocation(invoice, funds, "100"), pph = await withholding(invoice, "30");
    let view = await report(); assert.equal(view.invoices.find(i => i.id === invoice.id)?.outstanding, "100"); assert.equal(view.receipts.find(i => i.id === funds.id)?.unallocated, "200");
    await assert.rejects(act(pph, "verify"), /berbeda/); await act(pph, "verify", financePeer); view = await report(); assert.equal(view.invoices.find(i => i.id === invoice.id)?.outstanding, "70"); assert.equal(view.invoices.find(i => i.id === invoice.id)?.paymentStatus, "Partially Paid");
    const duplicate = pph.payload as { certificateNumber: string }; await assert.rejects(withholding(invoice, "1", 16, { certificateNumber: duplicate.certificateNumber }), /Certificate/);
    const over = await save(financial("ALLOCATION", { receiptId: funds.id, lines: [{ invoiceId: invoice.id, amount: "70.01" }] }, 17)); await assert.rejects(act(over, "post"), /over-allocation/); assert.equal(await db.financialEvent.count({ where: { recordId: over.id } }), 0); assert.ok(alloc.id);
  });
  test("multi-invoice posting is atomic; concurrent allocation cannot overspend a receipt", async () => {
    const a = await issue(), b = await issue(), funds = await receipt("100"), multi = await save(financial("ALLOCATION", { receiptId: funds.id, lines: [{ invoiceId: a.id, amount: "60" }, { invoiceId: b.id, amount: "60" }] }, 15));
    await assert.rejects(act(multi, "post"), /over-allocation/); assert.equal(await db.financialEvent.count({ where: { recordId: multi.id } }), 0);
    const x = await save(financial("ALLOCATION", { receiptId: funds.id, lines: [{ invoiceId: a.id, amount: "80" }] }, 15)), y = await save(financial("ALLOCATION", { receiptId: funds.id, lines: [{ invoiceId: b.id, amount: "80" }] }, 15));
    const winners = await Promise.allSettled([act(x, "post"), act(y, "post")]); assert.equal(winners.filter(r => r.status === "fulfilled").length, 1); assert.equal((await report()).receipts.find(r => r.id === funds.id)?.unallocated, "20");
  });
  test("PPh verification and allocation concurrently compete for the same outstanding", async () => {
    const invoice = await issue(), funds = await receipt("200"), alloc = await save(financial("ALLOCATION", { receiptId: funds.id, lines: [{ invoiceId: invoice.id, amount: "170" }] }, 15)), pph = await withholding(invoice, "50");
    const attempts = await Promise.allSettled([act(alloc, "post"), act(pph, "verify", financePeer)]); assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1);
    const settled = (await report()).invoices.find(i => i.id === invoice.id)!; assert.ok(new Prisma.Decimal(settled.outstanding).gte(0)); assert.equal(new Prisma.Decimal(settled.allocated).plus(settled.pph).gt(200), false);
  });
  test("tax and due-date policy versions are frozen after issue; incompatible period/treatment is rejected", async () => {
    const delivery = await completed(), term = await config("FIX-DELIVERY-TERM", { kind: "TERM", partyCode: "FIX-PARTY", basis: "DELIVERY", days: 5, deliveryBasis: "LAST_COMPLETION", schedule: "PER_DELIVERY" });
    const taxed = await config("FIX-TEST-TAX", { kind: "TAX", commercialTreatment: evidence, currency: "IDR", rate: "10", calculation: "EXCLUSIVE", base: "ITEMS_FREIGHT", rounding: "HALF_UP", roundAt: "TOTAL" });
    const invoice = await act(await save(invoicePayload(delivery, "2", { termId: term.id, taxId: taxed.id })), "issue"); assert.equal(invoice.dueDate, "2026-09-16"); assert.equal((invoice.snapshot as { total: string }).total, "220");
    await config("FIX-TEST-TAX", { kind: "TAX", commercialTreatment: evidence, currency: "IDR", rate: "20", calculation: "EXCLUSIVE", base: "ITEMS_FREIGHT", rounding: "HALF_UP", roundAt: "TOTAL" }, 2, date(12)); assert.equal((await report()).invoices.find(i => i.id === invoice.id)?.total, "220"); await assert.rejects(db.financialRecord.update({ where: { id: invoice.id }, data: { dueDate: "2026-09-20", version: { increment: 1 } } }));
    const other = await completed(); await assert.rejects(save(invoicePayload(other, "2", { billingMonth: "2026-08" })), /periode completion/); await assert.rejects(save(invoicePayload(other, "2", { taxId: taxed.id })), /Version parameter/);
    const bad = await config("FIX-INCOMPATIBLE", { kind: "TAX", commercialTreatment: "Other fixture treatment", currency: "USD", rate: "0", calculation: "NONE", base: "ITEMS", rounding: "HALF_UP", roundAt: "TOTAL" }); await assert.rejects(save(invoicePayload(other, "2", { taxId: bad.id })), /tidak kompatibel/);
    const received = await config("FIX-RECEIVED-TERM", { kind: "TERM", partyCode: "FIX-PARTY", basis: "RECEIPT", days: 3, deliveryBasis: "LAST_COMPLETION", schedule: "PERIODIC" });
    let draft = await save(invoicePayload(other, "2", { termId: received.id })); await assert.rejects(act(draft, "issue"), /Tanggal dan bukti/); draft = await saveFinancialRecord(db, finance, { payload: { ...draft.payload as object, receivedDate: "2026-09-13", receivedEvidence: evidence }, version: draft.version }, draft.id); assert.equal((await act(draft, "issue")).dueDate, "2026-09-16");
    const explicit = await config("FIX-EXPLICIT-TERM", { kind: "TERM", partyCode: "FIX-PARTY", basis: "EXPLICIT", days: 0, deliveryBasis: "LAST_COMPLETION", schedule: "PERIODIC", explicitDueDate: "2026-09-28" }); assert.equal((await act(await save(invoicePayload(await completed(), "2", { termId: explicit.id })), "issue")).dueDate, "2026-09-28");
  });
  test("allocation/PPh reversals restore balances; cancellation dependencies and historic as-of survive", async () => {
    const invoice = await issue("2", true), funds = await receipt(), alloc = await allocation(invoice, funds, "100"), pph = await act(await withholding(invoice, "30"), "verify", financePeer);
    const cancel = await correction(invoice, 23); await assert.rejects(act(cancel, "approve", manager), /Dependency/);
    const receiptCancel = await correction(funds, 25); await assert.rejects(act(receiptCancel, "approve", manager), /Dependency/);
    const allocReversal = await correction(alloc, 20); await assert.rejects(act(allocReversal, "approve", finance), /diizinkan/); await act(allocReversal, "approve", manager);
    const pphReversal = await correction(pph, 21); await act(pphReversal, "approve", manager); await act(pphReversal, "approve", manager);
    assert.equal((await report("2026-09-17")).invoices.find(i => i.id === invoice.id)?.outstanding, "70"); assert.equal((await report("2026-09-22")).invoices.find(i => i.id === invoice.id)?.outstanding, "200"); assert.equal((await report("2026-09-22")).receipts.find(r => r.id === funds.id)?.unallocated, "300");
    await act(cancel, "approve", manager); assert.ok(!(await report("2026-09-23")).invoices.some(i => i.id === invoice.id)); assert.equal((await report("2026-09-17")).invoices.find(i => i.id === invoice.id)?.total, "200");
    const deliveryId = (invoice.payload as { lines: { deliveryId: string }[] }).lines[0].deliveryId, delivery = await db.commerceRecord.findUniqueOrThrow({ where: { id: deliveryId } });
    const backdated = await save(invoicePayload(delivery, "2", { termId }, 22)); await assert.rejects(act(backdated, "issue"), /Double-billing bertanggal/);
    await act(await save(invoicePayload(delivery, "2", { termId }, 24)), "issue");
    await act(receiptCancel, "approve", manager); assert.equal((await report("2026-09-24")).receipts.find(r => r.id === funds.id)?.total, "300"); assert.ok(!(await report("2026-09-25")).receipts.some(r => r.id === funds.id));
    for (const row of (await report()).reconciliation) { assert.equal(row.invoiceDifference, "0"); assert.equal(row.receiptDifference, "0"); }
  });
  test("backdated PPh competes with later allocations; currency/customer/plant boundaries are enforced", async () => {
    const invoice = await issue(), funds = await receipt(), alloc = await allocation(invoice, funds, "180", 20), pph = await withholding(invoice, "30", 16); await assert.rejects(act(pph, "verify", financePeer), /event berikutnya/); assert.equal(await db.financialEvent.count({ where: { recordId: pph.id } }), 0);
    const fx = await save(financial("RECEIPT", { partyId, currency: "USD", amount: "100", bankReference: "Fixture foreign currency" })); await assert.rejects(actFinancialRecord(db, finance, fx.id, action("post", fx)), /rekening verified/);
    const fxAccount = (await config("FIX-FX", { kind: "ACCOUNT", bank: "Fixture FX bank", number: "Fixture FX account", holder: "Fixture company", ownership: "COMPANY", currency: "USD", receiptAllowed: true, settlementTreatment: evidence })).id;
    const posted = await act(await saveFinancialRecord(db, finance, { payload: { ...fx.payload as object, accountId: fxAccount }, version: fx.version }, fx.id), "post"); await assert.rejects(save(financial("ALLOCATION", { receiptId: posted.id, lines: [{ invoiceId: invoice.id, amount: "1" }] })), /customer\/currency/);
    const otherParty = await commerceConfig("FIX-OTHER", { kind: "PARTY", customerCode: "FIX-OTHER-CUSTOMER", customerName: "Other fixture customer", projectCode: "FIX-OTHER-PROJECT", projectName: "Other fixture project", address: "Fixture site", contact: "Fixture contact", taxReference: evidence });
    const otherReceipt = await act(await save(financial("RECEIPT", { partyId: otherParty, accountId, currency: "IDR", amount: "100", bankReference: "Fixture other customer" }, 13)), "post"); await assert.rejects(save(financial("ALLOCATION", { receiptId: otherReceipt.id, lines: [{ invoiceId: invoice.id, amount: "1" }] }, 15)), /customer\/currency/);
    const restricted = { ...finance, plantIds: [plants[1]] }; assert.equal((await report("2026-09-30", restricted)).records.length, 0); await assert.rejects(actFinancialRecord(db, restricted, alloc.id, action("post", alloc)), /diizinkan/); await assert.rejects(report("2026-09-30", technical), /tidak diizinkan/);
  });
  test("financial bundle attachments and idempotent retries retain source-domain permission gates", async () => {
    const invoice = await issue(), draftType = await createStageConfig(db, pc, { requestKey: randomUUID(), plantId: plants[0], code: "FIX-FIN-BUNDLE", revision: 1, effectiveFrom: date(1), evidence, payload: { kind: "LETTER_TYPE", name: "Fixture invoice bundle", displayCode: "FB", aliases: [], format: "{seq}/{code}/{year}/{plant}", scope: "PLANT_TYPE", reset: "YEAR", start: 1, padding: 4, approvalRequired: false } }), type = await actStageConfig(db, manager, draftType.id, { action: "verify", evidence });
    const file = await uploadFile(db, finance, { requestKey: randomUUID(), plantId: plants[0], domain: "DOCUMENT", name: "invoice-proof.pdf", mime: "application/pdf" }, Buffer.from("%PDF-1.7\nFixture finance evidence"));
    const payload = { requestKey: randomUUID(), plantId: plants[0], effectiveAt: date(15), configId: type.id, kind: "BUNDLE", title: "Fixture financial private bundle", recipient: "Fixture customer", body: "Fixture invoice source evidence", sources: [{ domain: "FINANCE", id: invoice.id }], fileIds: [file.id] };
    const draft = await saveStageRecord(db, finance, { payload, version: 0 }); await actStageRecord(db, finance, draft.id, action("issue", draft)); assert.equal((await downloadFile(db, finance, file.id)).mime, "application/pdf"); await assert.rejects(downloadFile(db, pc, file.id), /diizinkan/);
    const publicRows = await stageData(db, pc, new URL("https://fixture.test/api/stage2?workspace=documents&month=2026-09")); assert.ok(!publicRows.records.some(r => r.id === draft.id)); assert.ok(!publicRows.files.some(r => r.id === file.id));
    const formerFinance = { ...finance, functions: ["PC"], permissions: allowedActions("ADMIN", ["PC"]) }; await assert.rejects(saveStageRecord(db, formerFinance, { payload, version: 0 }), /diizinkan/); await assert.rejects(downloadFile(db, { ...finance, plantIds: [plants[1]] }, file.id), /diizinkan/);
  });
  test("Core reports reconcile official quantities, money, aging and exact screen/export snapshots", async () => {
    const delivery = await completed("2", "1.5", false, true), invoice = await act(await save(invoicePayload(delivery, "1", { termId })), "issue"), funds = await receipt("75"), allocated = await allocation(invoice, funds, "25");
    const filter = { category: "sales" as const, from: "2026-09-01", to: "2026-09-30", plantId: plants[0] };
    const sales = await officialReport(db, pc, filter), deliveries = await officialReport(db, pc, { ...filter, category: "delivery" }), invoices = await officialReport(db, finance, { ...filter, category: "invoice" }), payments = await officialReport(db, finance, { ...filter, category: "payment" });
    const source = recordSnapshot(delivery), ordered = sales.rows.find(r => r.sourceId === delivery.parentId && r.itemId === goods)!;
    assert.equal(ordered.event, "ORDERED"); assert.equal(ordered.quantity, "2");
    assert.equal(deliveries.rows.find(r => r.sourceId === delivery.id && r.event === "DISPATCHED")?.quantity, "2"); assert.equal(deliveries.rows.find(r => r.sourceId === delivery.id && r.event === "COMPLETED_ACCEPTED")?.quantity, "1.5");
    assert.equal(invoices.rows.find(r => r.sourceId === invoice.id && r.event === "INVOICED")?.amount, "100"); assert.equal(invoices.rows.find(r => r.sourceId === delivery.id && r.event === "UNBILLED_ACCEPTED")?.quantity, "0.5");
    assert.equal(payments.rows.find(r => r.sourceId === funds.id && r.event === "CASH_RECEIVED")?.amount, "75"); assert.equal(payments.rows.find(r => r.sourceId === allocated.id && r.event === "ALLOCATED")?.amount, "25"); assert.equal(payments.rows.find(r => r.sourceId === funds.id && r.event === "UNALLOCATED")?.amount, "50");
    const agingReport = await officialReport(db, finance, { ...filter, category: "aging" }), projected = await report();
    for (const row of agingReport.rows) assert.equal(row.amount, projected.invoices.find(r => r.id === row.sourceId)?.outstanding);
    assert.equal(agingReport.rows.find(r => r.sourceId === invoice.id)?.amount, "75");
    const dash = await dashboardData(db, finance, { ...filter, category: "payment" }); assert.equal(dash.reports.find(r => r.category === "payment")?.snapshotHash, payments.snapshotHash);
    const exported = await exportReport(db, finance, { ...filter, category: "payment" }, payments.snapshotHash); assert.equal(exported.report.snapshotHash, payments.snapshotHash); assert.ok(exported.csv.includes(funds.number)); assert.ok(exported.csv.includes('"CASH_RECEIVED"'));
    assert.equal((await officialReport(db, finance, { ...filter, category: "invoice", plantId: plants[1] })).rows.length, 0);
    assert.ok((await officialReport(db, pc, { ...filter, category: "po" })).rows.some(r => r.event === "PO_REMAINING" && r.metadata.rootId === source.poRootId));
    assert.ok(!(await officialReport(db, finance, { ...filter, category: "invoice", to: "2026-09-11" })).rows.some(r => r.sourceId === invoice.id));
  });
  test("closed periods block finance writers and pending finance invalidates close reconciliation", async () => {
    const draft = await save(financial("RECEIPT", { partyId, accountId, currency: "IDR", amount: "1", bankReference: "Fixture closing" }, 30));
    await actStockPeriod(db, pc, { plantId: plants[0], month: "2026-09", version: 0, action: "request-close", reason: evidence }); await actStockPeriod(db, finance, { plantId: plants[0], month: "2026-09", version: 1, action: "finance", reason: evidence }); await assert.rejects(actStockPeriod(db, manager, { plantId: plants[0], month: "2026-09", version: 2, action: "approve", reason: evidence }), /menunggu/);
    await db.stockPeriod.create({ data: { plantId: plants[1], month: "2026-09", closed: true } }); await assert.rejects(saveFinancialRecord(db, finance, { payload: { ...draft.payload as object, requestKey: randomUUID(), plantId: plants[1] }, version: 0 }), /Periode tertutup/);
  });
  test("Chrome finance workspaces, invoice/receipt/allocation composers and approval remain scoped and responsive", { skip: !process.env.FINANCE_PLAYWRIGHT_MODULE, timeout: 600000 }, async () => {
    const { chromium } = createRequire(path.resolve("package.json"))(process.env.FINANCE_PLAYWRIGHT_MODULE!);
    const listener = createServer(); await new Promise<void>(r => listener.listen(0, "127.0.0.1", r)); const port = (listener.address() as { port: number }).port; await new Promise<void>(r => listener.close(() => r()));
    tsconfig = readFileSync("tsconfig.json"); nextEnv = readFileSync("next-env.d.ts"); server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { env: { ...process.env, DATABASE_URL: url, QUARRYFLOW_TEST_DIST_DIR: distDir, NODE_ENV: "development" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let logs = ""; server.stdout?.on("data", c => { logs = (logs + c).slice(-5000); }); server.stderr?.on("data", c => { logs = (logs + c).slice(-5000); }); const base = `http://localhost:${port}`;
    let ready = false; for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/login`)).ok) { ready = true; break; } } catch { /* startup */ } await new Promise(r => setTimeout(r, 500)); } assert.ok(ready, logs.replace(/postgres(?:ql)?:\/\/\S+/g, "[database redacted]"));
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(60000);
      const login = async (actor: AccessActor) => { const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } }); await page.goto(`${base}/login`); await page.getByLabel("Email *").fill(user.email); await page.getByLabel("Kata sandi *").fill("Fixture-finance-password-2026"); await page.getByRole("button", { name: "Masuk ke StoneCrusher" }).click(); await page.waitForURL((u: URL) => u.pathname !== "/login"); };
      const loaded = async () => page.getByRole("status").filter({ hasText: "Memuat saldo" }).waitFor({ state: "detached" });
      await login(finance);
      for (const [route, title] of [["invoices", "Invoice & sumber eligible"], ["payments", "Receipt & allocation"], ["receivables", "Rekonsiliasi & aging"]]) { await page.goto(`${base}/${route}`); await page.getByRole("heading", { name: title, exact: true }).waitFor(); await loaded(); for (const width of [1440, 1024, 768, 390, 360]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${route} overflow ${width}`); } }
      const delivery = await completed("1"); await page.goto(`${base}/invoices`); await loaded(); await page.getByRole("button", { name: "Buat invoice", exact: true }).click(); const dialog = page.getByRole("dialog"); await dialog.getByLabel("Plant verified", { exact: true }).selectOption(plants[0]); await dialog.getByLabel("Tanggal efektif (WIB)").fill("2026-09-25T09:00"); const source = dialog.locator("fieldset").filter({ hasText: delivery.number }); await source.getByRole("checkbox").first().check(); await dialog.getByLabel("Pajak / treatment verified").selectOption(taxId); await dialog.getByLabel("Referensi bukti / lampiran").fill("Browser finance invoice fixture"); await dialog.getByLabel("Alasan / catatan transaksi").fill(evidence);
      for (const width of [1440, 1024, 768, 390, 360]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await dialog.evaluate((e: HTMLElement) => e.scrollWidth <= e.clientWidth + 1), `composer overflow ${width}`); }
      await dialog.getByRole("button", { name: "Simpan draft", exact: true }).click(); await dialog.waitFor({ state: "detached" }); await loaded(); const invoice = await db.financialRecord.findFirstOrThrow({ where: { payload: { path: ["evidence"], equals: "Browser finance invoice fixture" } } });
      const decide = async (label: string) => { await page.getByRole("button", { name: label, exact: true }).click(); const d = page.getByRole("dialog"); await d.getByLabel("Alasan / bukti keputusan").fill(evidence); await d.getByRole("button", { name: "Konfirmasi", exact: true }).click(); await d.waitFor({ state: "detached" }); await loaded(); };
      await page.getByRole("button").filter({ hasText: invoice.number }).click(); await decide("Issue invoice"); assert.equal((await db.financialRecord.findUniqueOrThrow({ where: { id: invoice.id } })).status, "ISSUED");
      await page.goto(`${base}/payments`); await loaded(); await page.getByRole("button", { name: "Catat receipt", exact: true }).click(); const receiptDialog = page.getByRole("dialog"); await receiptDialog.getByLabel("Plant verified", { exact: true }).selectOption(plants[0]); await receiptDialog.getByLabel("Tanggal efektif (WIB)").fill("2026-09-25T10:00"); await receiptDialog.getByLabel("Customer / proyek verified").selectOption(partyId); await receiptDialog.getByLabel("Rekening verified (wajib saat posting)").selectOption(accountId); await receiptDialog.getByLabel("Currency receipt").fill("IDR"); await receiptDialog.getByLabel("Dana aktual diterima").fill("120"); await receiptDialog.getByLabel("Referensi mutasi bank / bukti actual").fill("Browser bank reference"); await receiptDialog.getByLabel("Referensi bukti / lampiran").fill("Browser finance receipt fixture"); await receiptDialog.getByLabel("Alasan / catatan transaksi").fill(evidence); await receiptDialog.getByRole("button", { name: "Simpan draft", exact: true }).click(); await receiptDialog.waitFor({ state: "detached" }); await loaded();
      const receipt = await db.financialRecord.findFirstOrThrow({ where: { payload: { path: ["evidence"], equals: "Browser finance receipt fixture" } } }); await page.getByRole("button").filter({ hasText: receipt.number }).click(); await decide("Post transaksi"); await page.locator(".finance-doc").filter({ hasText: receipt.number }).click(); await page.getByRole("button", { name: "Alokasikan receipt", exact: true }).click(); const alloc = page.getByRole("dialog"); await alloc.getByLabel("Tanggal efektif (WIB)").fill("2026-09-25T11:00");
      const inv = alloc.locator(".finance-source").filter({ hasText: invoice.number }); await inv.getByRole("checkbox").check(); await inv.getByLabel(`Alokasi ${invoice.number}`).fill("100"); await alloc.getByLabel("Referensi bukti / lampiran").fill("Browser finance allocation fixture"); await alloc.getByLabel("Alasan / catatan transaksi").fill(evidence); await alloc.getByRole("button", { name: "Simpan draft", exact: true }).click(); await alloc.waitFor({ state: "detached" }); await loaded(); const allocation = await db.financialRecord.findFirstOrThrow({ where: { payload: { path: ["evidence"], equals: "Browser finance allocation fixture" } } }); await page.getByRole("button").filter({ hasText: allocation.number }).click(); await decide("Post transaksi"); assert.equal((await report()).invoices.find(i => i.id === invoice.id)?.outstanding, "0");
      const posted = await db.financialRecord.findUniqueOrThrow({ where: { id: allocation.id } }), correctionRow = await correction(posted, 26); await login(manager); await page.goto(`${base}/payments`); await loaded(); await page.getByRole("button").filter({ hasText: correctionRow.number }).click(); await decide("Approve correction"); assert.equal((await report()).invoices.find(i => i.id === invoice.id)?.outstanding, "100");
      await login(technical); assert.equal((await page.request.get(`${base}/api/finance`)).status(), 403); await page.goto(`${base}/invoices`); await page.getByRole("heading", { name: "Akses ditolak", exact: true }).waitFor();
    } finally { await browser.close(); }
  });
});
