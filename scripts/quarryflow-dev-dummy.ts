import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { Prisma, PrismaClient, type Plant, type CatalogItem, type PlantLocation, type StockDocument } from "@prisma/client";
import { hash } from "bcryptjs";
import { AccessActor, allowedActions } from "../src/lib/access";
import { createStockDocument, actStockDocument } from "../src/features/inventory/ledger-service";
import { createConfig as operationConfig, verifyConfig, saveRun, actRun } from "../src/features/operations/service";
import { createCommerceConfig, actCommerceConfig, saveCommerceRecord, actCommerceRecord, recordSnapshot } from "../src/features/commerce/service";
import { createFinancialConfig, actFinancialConfig, saveFinancialRecord, actFinancialRecord } from "../src/features/finance/service";
import { createConfig, actConfig } from "../src/features/stage2/configs";
import { saveRecord, actRecord } from "../src/features/stage2/documents";
import { generateDepreciation, actDepreciation } from "../src/features/stage2/depreciation";
import { createDepreciationCorrection, actDepreciationCorrection } from "../src/features/stage2/depreciation-correction";
import { saveExam, actExam, saveFollowup, actFollowup } from "../src/features/stage2/hse";
import { uploadFile } from "../src/features/stage2/files";
import { seedArchives } from "./quarryflow-dummy-archives";

const evidence = "DUMMY DEVELOPMENT: fictional measured values and approvals; not company parameters or cut-over sign-off";
const id = (key: string) => { const h = createHash("sha256").update(`quarryflow-dummy-v1:${key}`).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const action = (name: string, row: { version: number }) => ({ action: name, version: row.version, reason: evidence });
function pdf(label: string) {
  const content = `BT /F1 14 Tf 40 760 Td (${label}: DUMMY DEVELOPMENT EVIDENCE) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let text = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const start = Buffer.byteLength(text); text += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(text);
}

async function main() {
  const url = process.env.QUARRYFLOW_DUMMY_DATABASE_URL;
  if (!url || process.env.NODE_ENV === "production") throw new Error("QUARRYFLOW_DUMMY_DATABASE_URL must explicitly target the local development database.");
  const target = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "61014" || target.pathname !== "/quarryflow_dev" || (target.searchParams.get("schema") ?? "public") !== "public") throw new Error("Dummy seed is restricted to local quarryflow_dev:61014/public. Remote databases are refused.");
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const actors: AccessActor[] = [];
    for (const email of ["operator.dev@quarryflow.local", "verifier.dev@quarryflow.local", "manager.dev@quarryflow.local", "hse.dev@quarryflow.local", "hse.verifier.dev@quarryflow.local"]) {
      const u = await db.user.findUniqueOrThrow({ where: { email }, include: { roles: { include: { role: true } } } });
      assert.ok(u.active && u.allPlants);
      actors.push({ userId: u.id, roles: u.roles.map(r => r.role.code), functions: u.functions, permissions: u.actionPermissions, allPlants: true, plantIds: [] });
    }
    const [maker, checker, manager, hse, hseChecker] = actors;
    const checkpointKey = "dummy.seed.v1";
    let checkpoint = await db.systemSetting.findUnique({ where: { key: checkpointKey } });
    if (!checkpoint) {
      const month = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
      checkpoint = await db.systemSetting.create({ data: { key: checkpointKey, section: "DUMMY", value: { month, status: "RUNNING", dummy: true }, updatedBy: maker.userId } });
    }
    const month = (checkpoint.value as { month: string }).month;
    const [year, n] = month.split("-").map(Number);
    const previousMonth = new Date(Date.UTC(year, n - 2, 1)).toISOString().slice(0, 7);
    const at = `${month}-01T08:00:00+07:00`, before = `${previousMonth}-01T00:00:00+07:00`, openingAt = `${month}-01T00:00:00+07:00`;
    const expires = new Date(Date.UTC(year + 1, n, 1)).toISOString();
    console.info(`DUMMY seed: local development, month=${month}; existing accounts/passwords preserved`);
    await seedArchives(db, id, new Date(at), maker.userId, manager.userId);
    console.info("Legacy archive examples ready; they are excluded from official ledgers");

    const roles = await db.role.findMany(); assert.equal(roles.length, 5);
    for (const role of roles) for (const code of new Set(allowedActions(role.code, ["PC", "FINANCE"]))) {
      const permission = await db.permission.upsert({ where: { code }, update: {}, create: { code, name: code } });
      await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
    }
    const plants: Plant[] = [];
    for (let i = 0; i < 10; i++) plants.push(await db.plant.upsert({ where: { code: `DUMMY-P${i + 1}` }, update: {}, create: { id: id(`plant:${i}`), code: `DUMMY-P${i + 1}`, name: `DUMMY ${["SC", "BP", "AMP"][i % 3]} Plant ${i + 1}`, kind: ["SC", "BP", "AMP"][i % 3] as "SC", verificationStatus: "VERIFIED", evidence, createdBy: maker.userId, verifiedBy: manager.userId, verifiedAt: new Date(before) } }));
    const passwordHash = await hash(randomBytes(24).toString("base64url"), 12);
    for (let i = 0; i < 10; i++) {
      const user = await db.user.upsert({ where: { email: `dummy.worker${i + 1}@example.invalid` }, update: {}, create: { id: id(`worker-account:${i}`), email: `dummy.worker${i + 1}@example.invalid`, name: `DUMMY Worker ${i + 1}`, passwordHash, status: "INACTIVE", active: false, functions: ["PC"], actionPermissions: [], roles: { create: { roleId: roles.find(r => r.code === "ADMIN")!.id } } } });
      await db.userPlantScope.upsert({ where: { userId_plantId: { userId: user.id, plantId: plants[i].id } }, update: {}, create: { userId: user.id, plantId: plants[i].id } });
    }
    const units = [{ code: "TON", dimension: "MASS" }, { code: "KG", dimension: "MASS" }, { code: "M3", dimension: "VOLUME" }, { code: "L", dimension: "VOLUME" }, { code: "PCS", dimension: "COUNT" }, { code: "HOUR", dimension: "TIME" }, { code: "MINUTE", dimension: "TIME" }, { code: "DAY", dimension: "TIME" }, { code: "ML", dimension: "VOLUME" }, { code: "GRAM", dimension: "MASS" }];
    for (const u of units) await db.uom.upsert({ where: { code: u.code }, update: { verificationStatus: "VERIFIED", evidence, createdBy: maker.userId, verifiedBy: manager.userId }, create: { code: u.code, name: `DUMMY ${u.code}`, dimension: u.dimension as "MASS", verificationStatus: "VERIFIED", evidence, createdBy: maker.userId, verifiedBy: manager.userId } });
    const uoms = await db.uom.findMany(), unit = (code: string) => uoms.find(u => u.code === code)!.id;
    const catalog: CatalogItem[] = [];
    for (let i = 0; i < 10; i++) for (const kind of ["MATERIAL", "PRODUCT", "SERVICE"] as const) {
      const fuel = kind === "MATERIAL" && i === 9;
      const uom = kind === "SERVICE" ? "HOUR" : fuel ? "L" : kind === "MATERIAL" || i === 2 ? "TON" : "M3";
      const item = await db.catalogItem.upsert({ where: { kind_code: { kind, code: `DUMMY-${kind}-${i + 1}` } }, update: {}, create: { id: id(`catalog:${kind}:${i}`), code: `DUMMY-${kind}-${i + 1}`, name: `DUMMY ${fuel ? "Solar" : kind === "PRODUCT" ? ["Split SC", "Beton BP", "Aspal AMP", "Blending"][i % 4] : kind === "SERVICE" ? "Jasa Sewa" : "Bahan Quarry"} ${i + 1}`, kind, category: "DUMMY", primaryUomId: unit(uom), ...(kind === "PRODUCT" ? { legacyProductId: id(`archive:Product:${i}`) } : kind === "MATERIAL" ? { legacyMaterialId: id(`archive:Material:${i}`) } : {}), verificationStatus: "VERIFIED", evidence, createdBy: maker.userId, verifiedBy: manager.userId, verifiedAt: new Date(before) } });
      catalog.push(item);
      for (const plant of plants) await db.catalogItemPlant.upsert({ where: { itemId_plantId: { itemId: item.id, plantId: plant.id } }, update: {}, create: { itemId: item.id, plantId: plant.id } });
    }
    const raw = catalog.find(c => c.code === "DUMMY-MATERIAL-1")!, fuelItem = catalog.find(c => c.code === "DUMMY-MATERIAL-10")!, products = [1, 2, 3, 4].map(i => catalog.find(c => c.code === `DUMMY-PRODUCT-${i}`)!);
    for (let i = 0; i < 10; i++) {
      const item = catalog.find(c => c.code === `DUMMY-MATERIAL-${i + 1}`)!;
      await db.itemAlias.upsert({ where: { itemId_normalizedName: { itemId: item.id, normalizedName: `dummy alias ${i + 1}` } }, update: {}, create: { itemId: item.id, name: `DUMMY Alias ${i + 1}`, normalizedName: `dummy alias ${i + 1}`, verificationStatus: "VERIFIED", evidence, createdBy: maker.userId, verifiedBy: manager.userId, verifiedAt: new Date(before) } });
      const from = i === 9 ? unit("ML") : unit("KG"), to = item.primaryUomId;
      await db.uomConversion.upsert({ where: { itemId_fromUomId_toUomId_version: { itemId: item.id, fromUomId: from, toUomId: to, version: 1 } }, update: {}, create: { itemId: item.id, fromUomId: from, toUomId: to, factor: "0.001", version: 1, effectiveFrom: new Date(before), verificationStatus: "VERIFIED", evidence, createdBy: maker.userId, verifiedBy: manager.userId, verifiedAt: new Date(before) } });
    }
    const stores: PlantLocation[] = [], tanks: PlantLocation[] = [];
    for (let i = 0; i < 10; i++) {
      for (const kind of ["STOCKPILE", "TANK"] as const) {
        const loc = await db.plantLocation.upsert({ where: { plantId_code: { plantId: plants[i].id, code: `DUMMY-${kind}` } }, update: {}, create: { id: id(`location:${kind}:${i}`), plantId: plants[i].id, code: `DUMMY-${kind}`, name: `DUMMY ${kind} ${i + 1}`, kind, verificationStatus: "VERIFIED", evidence, createdBy: maker.userId, verifiedBy: manager.userId, verifiedAt: new Date(before) } });
        (kind === "TANK" ? tanks : stores).push(loc);
      }
      await db.stockPeriod.upsert({ where: { plantId_month: { plantId: plants[i].id, month } }, update: {}, create: { plantId: plants[i].id, month, closed: false } });
      let stock: StockDocument = await createStockDocument(db, maker, { requestKey: id(`opening:${i}`), kind: "OPENING", effectiveAt: openingAt, sourceName: `DUMMY development opening ${i + 1}`, checksum: createHash("sha256").update(`DUMMY-opening-${i}`).digest("hex"), evidence, reason: evidence, lines: [{ itemId: raw.id, locationId: stores[i].id, quantity: "10000" }, { itemId: products[0].id, locationId: stores[i].id, quantity: "1000" }, { itemId: fuelItem.id, locationId: tanks[i].id, quantity: "1000" }] });
      if (stock.status === "SUBMITTED" && !stock.financeBy) stock = await actStockDocument(db, checker, stock.id, { action: "finance", reason: evidence });
      if (stock.status === "SUBMITTED") stock = await actStockDocument(db, manager, stock.id, { action: "approve", reason: evidence });
    }
    console.info("Verified DUMMY masters, scoped sample users and single-source opening balances ready");
    const opConfig = async (p: number, code: string, payload: object) => {
      let c = await operationConfig(db, maker, { requestKey: id(`opconfig:${p}:${code}`), plantId: plants[p].id, code, revision: 1, effectiveFrom: before, evidence, payload });
      if (c.verificationStatus !== "VERIFIED") c = await verifyConfig(db, manager, c.id, { evidence }); return c.id;
    };
    const operation = async (key: string, p: number, payload: object) => {
      let r = await saveRun(db, maker, { payload: { requestKey: id(`run:${key}`), plantId: plants[p].id, effectiveAt: at, pic: "DUMMY PC", method: "DUMMY measured weigh/meter fixture", evidence, reason: evidence, ...payload }, version: 0 });
      if (r.status === "DRAFT") r = await actRun(db, maker, r.id, action("submit", r));
      if (r.status === "SUBMITTED") r = await actRun(db, checker, r.id, action("verify", r));
      if (r.status === "VERIFIED") r = await actRun(db, checker, r.id, action("post", r)); return r;
    };
    const policies = [], assets = [], mixes = new Map<string, string>();
    for (let p = 0; p < 10; p++) {
      policies.push(await opConfig(p, "DUMMY-FUEL", { kind: "FUEL", itemId: fuelItem.id }));
      assets.push(await opConfig(p, "DUMMY-ALAT", { kind: "ASSET", name: `DUMMY Alat ${p + 1}`, identity: `DUMMY-ALAT-${p + 1}`, ownership: "OWNED", payer: "DUMMY Company", costResponsibility: "DUMMY company production", contract: evidence, eligibleProduction: true }));
      for (const [k, process] of ["SC", "BP", "AMP", "BLENDING"].entries()) {
        if (process !== "BLENDING" && process !== plants[p].kind) continue;
        await opConfig(p, `DUMMY-OUTPUT-${process}`, { kind: "PRODUCT", itemId: products[k].id, process });
        if (process !== "SC") mixes.set(`${p}:${process}`, await opConfig(p, `DUMMY-MIX-${process}`, { kind: "MIX", process, outputItemId: products[k].id, outputUomId: products[k].primaryUomId, components: [{ itemId: raw.id, uomId: raw.primaryUomId, quantity: "2" }] }));
      }
    }
    for (let i = 0; i < 10; i++) {
      const p = 2;
      const usage = await operation(`fuel:${i}`, p, { kind: "FUEL_USAGE", fuel: { policyId: policies[p], tankId: tanks[p].id, liters: "5", assetId: assets[p], purpose: "PRODUCTION" } });
      for (const [k, process] of ["SC", "BP", "AMP", "BLENDING"].entries()) {
        const plantIndex = process === "AMP" ? 2 : process === "BP" ? 1 : 0;
        await operation(`${process}:${i}`, plantIndex, { kind: process, batch: `DUMMY batch ${i + 1}`, quality: "DUMMY measured acceptance sample", inputs: [{ itemId: raw.id, locationId: stores[plantIndex].id, uomId: raw.primaryUomId, quantity: "20" }], outputs: [{ itemId: products[k].id, locationId: stores[plantIndex].id, uomId: products[k].primaryUomId, quantity: "10" }], ...(process === "SC" ? {} : { mixVersionId: mixes.get(`${plantIndex}:${process}`) }), ...(process === "AMP" ? { fuelUsageId: usage.id } : {}) });
      }
    }
    console.info("SC/BP/AMP/blending and referenced fuel posted through maker-checker workflows");

    const commercialConfig = async (p: number, code: string, payload: object) => {
      let c = await createCommerceConfig(db, maker, { requestKey: id(`commerce-config:${p}:${code}`), plantId: plants[p].id, code, revision: 1, effectiveFrom: before, evidence, payload });
      if (c.verificationStatus !== "VERIFIED") {
        if (c.kind === "EVENT_POLICY") {
          if (!c.pcBy) c = await actCommerceConfig(db, maker, c.id, { action: "attest-pc", evidence });
          if (!c.financeBy) c = await actCommerceConfig(db, checker, c.id, { action: "attest-finance", evidence });
        }
        c = await actCommerceConfig(db, manager, c.id, { action: "verify", evidence });
      } return c.id;
    };
    const financeConfig = async (p: number, code: string, payload: object) => {
      let c = await createFinancialConfig(db, maker, { requestKey: id(`finance-config:${p}:${code}`), plantId: plants[p].id, code, revision: 1, effectiveFrom: before, evidence, payload });
      if (c.verificationStatus !== "VERIFIED") {
        if (!c.financeBy) c = await actFinancialConfig(db, checker, c.id, { action: "finance", evidence });
        c = await actFinancialConfig(db, manager, c.id, { action: "verify", evidence });
      } return c.id;
    };
    const commercial = async (key: string, p: number, payload: object) => {
      let r = await saveCommerceRecord(db, maker, { payload: { requestKey: id(`commerce:${key}`), plantId: plants[p].id, effectiveAt: at, evidence, reason: evidence, ...payload }, version: 0 });
      if (r.status === "DRAFT") r = await actCommerceRecord(db, maker, r.id, action("submit", r));
      if (r.status === "SUBMITTED") r = await actCommerceRecord(db, checker, r.id, action("verify", r));
      if (r.status === "VERIFIED") r = await actCommerceRecord(db, manager, r.id, action("approve", r)); return r;
    };
    const financial = async (key: string, p: number, payload: object, finish?: string) => {
      let r = await saveFinancialRecord(db, maker, { payload: { requestKey: id(`finance:${key}`), plantId: plants[p].id, effectiveAt: at, evidence, reason: evidence, ...payload }, version: 0 });
      if (finish && r.status === "DRAFT") r = await actFinancialRecord(db, maker, r.id, action(finish, r)); return r;
    };
    const invoices = [];
    const freight = { mode: "PICKUP", term: evidence, basis: "NONE", rate: "0", internalRate: "0" };
    for (let p = 0; p < 10; p++) {
      const partyCode = `DUMMY-PARTY-${p + 1}`;
      const partyId = await commercialConfig(p, partyCode, { kind: "PARTY", customerCode: `DUMMY-CUSTOMER-${p + 1}`, customerName: `DUMMY Customer ${p + 1}`, projectCode: `DUMMY-PROJECT-${p + 1}`, projectName: `DUMMY Project ${p + 1}`, address: `DUMMY Site ${p + 1}`, contact: "DUMMY PIC", taxReference: evidence });
      const priceId = await commercialConfig(p, "DUMMY-PRICE", { kind: "PRICE", partyCode, itemId: products[0].id, uomId: products[0].primaryUomId, unitPrice: "10000", currency: "IDR", taxTreatment: evidence, minimumOrder: "0", validUntil: expires, freight });
      await commercialConfig(p, "DUMMY-VEHICLE", { kind: "VEHICLE", name: `DUMMY Truck ${p + 1}`, identity: `DUMMY-TRUCK-${p + 1}`, ownership: "OWNED", driver: "DUMMY Driver" });
      await commercialConfig(p, "DUMMY-EVENT", { kind: "EVENT_POLICY", stockOutEvent: "VERIFIED_DISPATCH", completionRule: "ACCEPTED_WITH_PROOF", serviceRule: "VERIFIED_SERVICE_PROOF", pickupCombined: true });
      const accountId = await financeConfig(p, "DUMMY-ACCOUNT", { kind: "ACCOUNT", bank: "DUMMY Bank", number: `DUMMY-ACCOUNT-${p + 1}`, holder: "DUMMY Company", ownership: "COMPANY", currency: "IDR", receiptAllowed: true, settlementTreatment: evidence });
      const taxId = await financeConfig(p, "DUMMY-TAX", { kind: "TAX", commercialTreatment: evidence, currency: "IDR", rate: "0", calculation: "NONE", base: "ITEMS_FREIGHT", rounding: "HALF_UP", roundAt: "TOTAL" });
      const termId = await financeConfig(p, "DUMMY-TERM", { kind: "TERM", partyCode, basis: "INVOICE", days: 30, deliveryBasis: "LAST_COMPLETION", schedule: "PER_DELIVERY" });
      const line = { key: id(`po-line:${p}`), itemId: products[0].id, uomId: products[0].primaryUomId, quantity: "20", priceId, unitPrice: "10000" };
      const terms = { partyId, payment: "CREDIT", paymentTerm: evidence, freight, lines: [line] };
      const quote = await commercial(`quote:${p}`, p, { ...terms, kind: "QUOTATION", validUntil: expires });
      const po = await commercial(`po:${p}`, p, { ...terms, kind: "PO", externalNumber: `DUMMY-CUSTOMER-PO-${p + 1}` });
      const order = await commercial(`so:${p}`, p, { ...terms, kind: "SO", quotationId: quote.id, poId: po.id, lines: [{ ...line, key: id(`so-line:${p}`), poLineKey: line.key }] });
      let delivery = await commercial(`do:${p}`, p, { kind: "DELIVERY", salesOrderId: order.id, mode: "PICKUP", customerVehicle: `DUMMY-PICKUP-${p + 1}`, destination: `DUMMY Site ${p + 1}`, driver: "DUMMY Driver", trips: 1, method: evidence, lines: [{ orderLineKey: recordSnapshot(order).lines[0].key, locationId: stores[p].id, quantity: "10" }] });
      if (delivery.status === "APPROVED") delivery = await actCommerceRecord(db, maker, delivery.id, { ...action("pickup", delivery), completion: { effectiveAt: at, receiver: "DUMMY Customer PIC", evidence, lines: [{ orderLineKey: recordSnapshot(order).lines[0].key, accepted: "10", rejected: "0" }] } });
      const invoice = await financial(`invoice:${p}`, p, { kind: "INVOICE", billingMonth: month, taxId, termId, lines: [{ role: "ITEM", deliveryId: delivery.id, sourceKey: recordSnapshot(order).lines[0].key, quantity: "10" }] }, "issue");
      invoices.push(invoice);
      const receipt = await financial(`receipt:${p}`, p, { kind: "RECEIPT", partyId, accountId, currency: "IDR", amount: "120000", bankReference: `DUMMY-RECEIPT-${p + 1}` }, "post");
      await financial(`allocation:${p}`, p, { kind: "ALLOCATION", receiptId: receipt.id, lines: [{ invoiceId: invoice.id, amount: "60000" }] }, "post");
      let pph = await financial(`pph:${p}`, p, { kind: "PPH", invoiceId: invoice.id, amount: "10000", certificateNumber: `DUMMY-PPH-${p + 1}`, certificateDate: at.slice(0, 10), payerTaxIdentity: "DUMMY tax identity" }, "submit");
      if (pph.status === "SUBMITTED") pph = await actFinancialRecord(db, checker, pph.id, action("verify", pph));
      await financial(`correction:${p}`, p, { kind: "CORRECTION", targetId: pph.id }, "submit");
    }
    console.info("Quotation/PO/SO/DO/accepted invoices, receipt/allocation/PPh and pending correction examples ready");

    const stageConfig = async (p: number, code: string, payload: object, actor = maker, verifier = manager) => {
      let c = await createConfig(db, actor, { requestKey: id(`stage-config:${p}:${code}`), plantId: plants[p].id, code, revision: 1, effectiveFrom: before, evidence, payload });
      if (c.status !== "VERIFIED") {
        if (c.kind === "ASSET_FINANCE" && !c.attestedBy) c = await actConfig(db, checker, c.id, { action: "attest", evidence });
        c = await actConfig(db, verifier, c.id, { action: "verify", evidence });
      } return c;
    };
    for (let p = 0; p < 10; p++) {
      const worker = await stageConfig(p, "DUMMY-WORKER", { kind: "WORKER", name: `DUMMY Worker ${p + 1}`, job: "DUMMY field inspector", employment: "DUMMY employee", active: true }, hse, manager);
      const checklist = await stageConfig(p, "DUMMY-CHECK", { kind: "CHECKLIST", name: `DUMMY Checklist ${p + 1}`, checks: [{ key: "guard", label: "DUMMY protective guard" }] }, hse, hseChecker);
      const letter = await stageConfig(p, "DUMMY-LETTER", { kind: "LETTER_TYPE", name: "DUMMY Surat", displayCode: "DMY", aliases: [], format: "{seq}/{code}/{plant}/{year}/{month}", scope: "PLANT_TYPE", reset: "MONTH", padding: 4, start: 1, approvalRequired: true });
      const physical = await stageConfig(p, "DUMMY-ASSET", { kind: "ASSET", name: `DUMMY Crusher ${p + 1}`, identity: `DUMMY-ASSET-${p + 1}`, plate: "", serial: `DUMMY-SERIAL-STAGE-${p + 1}`, chassis: "", model: "DUMMY Crusher Model", ownership: "OWNED", unitCount: 1, ownershipEvidence: evidence, legacyEquipmentId: id(`archive:Equipment:${p}`), operationalAssetId: assets[p] });
      await stageConfig(p, "DUMMY-ASSET-FIN", { kind: "ASSET_FINANCE", assetId: physical.rootId, cost: "100000", residual: "10000", lifeMonths: 60, startDate: `${previousMonth}-01`, firstMonth: "FULL", openingMonth: previousMonth, openingAccumulated: "0", currency: "IDR", decimals: 2 }, maker, manager);
      let dep = await db.assetDepreciation.findUnique({ where: { assetId_month: { assetId: physical.rootId, month: previousMonth } } });
      if (!dep) dep = (await generateDepreciation(db, maker, plants[p].id, previousMonth)).rows.find(r => r.assetId === physical.rootId)!;
      assert.ok(dep);
      if (dep.status === "DRAFT") dep = await actDepreciation(db, maker, dep.id, action("submit", dep));
      if (dep.status === "SUBMITTED") dep = await actDepreciation(db, checker, dep.id, action("verify", dep));
      if (dep.status === "VERIFIED") dep = await actDepreciation(db, maker, dep.id, action("post", dep));
      let correction = await createDepreciationCorrection(db, maker, { requestKey: id(`depreciation-correction:${p}`), targetId: dep.id, effectiveAt: at, amount: "-100", reason: evidence });
      if (correction.status === "DRAFT") correction = await actDepreciationCorrection(db, maker, correction.id, action("submit", correction));
      if (correction.status === "SUBMITTED") correction = await actDepreciationCorrection(db, manager, correction.id, action("post", correction));
      const file = await uploadFile(db, hse, { requestKey: id(`file:${p}`), plantId: plants[p].id, domain: "INSPECTION", name: `dummy-inspection-${p + 1}.pdf`, mime: "application/pdf" }, pdf(`Inspection ${p + 1}`));
      let inspection = await saveRecord(db, hse, { payload: { kind: "INSPECTION", requestKey: id(`inspection:${p}`), plantId: plants[p].id, effectiveAt: at, configId: checklist.id, locationId: stores[p].id, inspectorId: worker.rootId, notes: evidence, results: [{ key: "guard", result: "FAIL", detail: "DUMMY guard repair needed" }], findings: [{ key: "guard", detail: "DUMMY repair and verification example", severity: p % 2 ? "MEDIUM" : "HIGH", picId: worker.rootId, dueDate: at.slice(0, 10), fileIds: [file.id] }], fileIds: [] }, version: 0 });
      if (inspection.status === "DRAFT") inspection = await actRecord(db, hse, inspection.id, action("submit", inspection));
      if (inspection.status === "SUBMITTED") inspection = await actRecord(db, hseChecker, inspection.id, action("verify", inspection));
      const finding = await db.inspectionFinding.findUniqueOrThrow({ where: { inspectionId_key: { inspectionId: inspection.id, key: "guard" } } });
      let follow = await saveFollowup(db, hse, { requestKey: id(`followup:${p}`), findingId: finding.id, actualAt: at, note: "DUMMY guard repaired; independent verifier confirms", fileIds: [] });
      if (follow.status === "SUBMITTED") follow = await actFollowup(db, hseChecker, follow.id, action("verify", follow));
      let exam = await saveExam(db, hse, { payload: { requestKey: id(`exam:${p}`), plantId: plants[p].id, workerId: worker.rootId, kind: p % 2 ? "DCU" : "WCU", examAt: at, validUntil: expires, workStatus: p % 3 ? "FIT" : "RESTRICTED", measurements: [{ label: "DUMMY tekanan darah", value: "120/80", unit: "mmHg" }], notes: "DUMMY private clinical fixture; not an actual examination", fileIds: [] }, version: 0 });
      if (exam.status === "DRAFT") exam = await actExam(db, hse, exam.id, action("submit", exam));
      if (exam.status === "SUBMITTED") exam = await actExam(db, hseChecker, exam.id, action("verify", exam));
      let document = await saveRecord(db, maker, { payload: { kind: "BUNDLE", requestKey: id(`bundle:${p}`), plantId: plants[p].id, effectiveAt: at, configId: letter.id, title: `DUMMY Bundle invoice ${p + 1}`, recipient: `DUMMY Customer ${p + 1}`, body: evidence, sources: [{ domain: "FINANCE", id: invoices[p].id }], fileIds: [] }, version: 0 });
      if (document.status === "DRAFT") document = await actRecord(db, maker, document.id, action("submit", document));
      if (document.status === "SUBMITTED") document = await actRecord(db, manager, document.id, action("verify", document));
      if (document.status === "VERIFIED") document = await actRecord(db, maker, document.id, action("issue", document));
    }
    for (let i = 0; i < 10; i++) await db.systemSetting.upsert({ where: { key: `dummy.example.${i + 1}` }, update: {}, create: { key: `dummy.example.${i + 1}`, section: "DUMMY", value: { dummy: true, sample: i + 1, crActivated: false }, updatedBy: maker.userId } });
    const counts: Record<string, number> = {};
    for (const model of Prisma.dmmf.datamodel.models) {
      const delegate = (db as unknown as Record<string, { count(): Promise<number> }>)[model.name[0].toLowerCase() + model.name.slice(1)];
      counts[model.name] = await delegate.count();
      assert.ok(counts[model.name] >= (model.name === "Role" ? 5 : model.name === "InventoryTransaction" ? 0 : 10), `${model.name}: expected at least 10 records, got ${counts[model.name]}`);
    }
    const negative = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM (SELECT "itemId", "locationId" FROM "StockLedgerEntry" GROUP BY "itemId", "locationId" HAVING SUM(quantity) < 0) balances`;
    assert.equal(negative[0].n, BigInt(0));
    const duplicate = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM (SELECT "requestKey" FROM "OperationalRun" GROUP BY "requestKey" HAVING COUNT(*) > 1) duplicates`;
    assert.equal(duplicate[0].n, BigInt(0));
    const fuelTotal = await db.stockLedgerEntry.aggregate({ where: { itemId: fuelItem.id, quantity: { lt: 0 } }, _sum: { quantity: true } });
    assert.equal(fuelTotal._sum.quantity?.toString(), "-50", "AMP referenced fuel must be consumed only once");
    await db.systemSetting.update({ where: { key: checkpointKey }, data: { value: { month, status: "COMPLETE", dummy: true, counts }, updatedBy: maker.userId } });
    const summary = { database: "local quarryflow_dev", month, dummy: true, roleException: "5 final roles; never invent roles to reach 10", legacyLedgerException: "InventoryTransaction remains locked and empty; StockLedgerEntry is the official ledger", tables: counts, stockNonnegative: true, duplicateOperationalSources: false, ampFuelLitersConsumed: 50, companyOrProductionDataChanged: false };
    writeFileSync(".quarryflow-dev/dummy-summary.json", JSON.stringify(summary, null, 2), { mode: 0o600 });
    console.info(JSON.stringify(summary, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[database redacted]") : "Dummy seed failed"); process.exitCode = 1; });
