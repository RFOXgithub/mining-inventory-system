import { randomUUID } from "node:crypto";
import { CommerceRecord, Prisma, PrismaClient } from "@prisma/client";
import { AccessActor, can } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { writeAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { atomic, appendStockMoves, ensureLegacyAdopted, periodOpen, references, Move } from "@/features/inventory/ledger-service";
import { operationHash } from "@/features/operations/service";
import { actionSchema, CompletionInput, completionSchema, configActionSchema, ConfigInput, configSchema, DocumentInput, documentSchema, saveSchema } from "./schema";
import { freightAmount, lineAmount, remaining } from "./calculations";

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
function sameFreight(a: CommerceSnapshot["freight"], b: CommerceSnapshot["freight"]) { return a.mode === b.mode && a.basis === b.basis && a.term === b.term && new D(a.rate).eq(b.rate) && new D(a.internalRate).eq(b.internalRate); }
function fail(message: string, status = 409): never { throw new DomainError(status, message); }
function allow(actor: AccessActor, permission: string, plantId: string) { if (!can(actor, permission, plantId)) fail("Action atau cakupan plant tidak diizinkan.", 403); }
async function plant(tx: Tx, id: string) {
  const row = await tx.plant.findUnique({ where: { id } });
  if (!row?.active || row.verificationStatus !== "VERIFIED") fail("Plant harus aktif/terverifikasi.", 422);
}
async function material(tx: Tx, plantId: string, itemId: string, uomId: string) {
  const row = await tx.catalogItem.findUnique({ where: { id: itemId }, include: { primaryUom: true, plants: true } });
  if (!row?.active || row.verificationStatus !== "VERIFIED" || !row.primaryUom.active || row.primaryUom.verificationStatus !== "VERIFIED" || row.primaryUom.dimension === "UNKNOWN" || row.primaryUomId !== uomId || !row.plants.some(p => p.plantId === plantId)) fail("Item/UOM harus verified dan sesuai plant; quantity komersial memakai UOM utama yang eksplisit.", 422);
  return row;
}
async function checkedConfig(tx: Tx, id: string, kind: string, plantId: string, date: Date) {
  const row = await tx.commerceConfig.findUnique({ where: { id } });
  if (!row || row.kind !== kind || row.plantId !== plantId || row.verificationStatus !== "VERIFIED" || row.effectiveFrom > date) fail("Parameter/version belum verified atau belum berlaku.", 422);
  const current = await tx.commerceConfig.findFirst({ where: { plantId, kind, code: row.code, verificationStatus: "VERIFIED", effectiveFrom: { lte: date } }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }] });
  if (current?.id !== id) fail("Version telah digantikan. Pilih version verified yang berlaku.", 422);
  return { ...row, data: configSchema.shape.payload.parse(row.payload) };
}
async function validateConfig(tx: Tx, input: ConfigInput) {
  await plant(tx, input.plantId);
  if (input.payload.kind === "PRICE") {
    const p = input.payload;
    await material(tx, input.plantId, p.itemId, p.uomId);
    if (new Date(p.validUntil) < new Date(input.effectiveFrom)) fail("Akhir berlaku harga mendahului awal berlaku.", 422);
    if (p.partyCode && !await tx.commerceConfig.count({ where: { plantId: input.plantId, kind: "PARTY", code: p.partyCode, verificationStatus: "VERIFIED" } })) fail("Customer/proyek kontrak belum verified.", 422);
  }
}
export async function createCommerceConfig(client: PrismaClient, actor: AccessActor, raw: unknown, request?: Request) {
  const input = configSchema.parse(raw); allow(actor, "sales.config.create", input.plantId);
  return atomic(client, async tx => {
    const old = await tx.commerceConfig.findUnique({ where: { requestKey: input.requestKey } });
    if (old) { if (old.makerId !== actor.userId || old.payloadHash !== operationHash(input)) fail("Request key telah digunakan maker/payload lain."); return old; }
    await validateConfig(tx, input);
    const prior = await tx.commerceConfig.findFirst({ where: { plantId: input.plantId, kind: input.payload.kind, code: input.code }, orderBy: { revision: "desc" } });
    if (input.revision !== (prior?.revision ?? 0) + 1 || prior && new Date(input.effectiveFrom) < prior.effectiveFrom) fail("Revision harus berurutan dan tanggal berlaku tidak mundur.");
    if (prior) {
      const oldPayload = configSchema.shape.payload.parse(prior.payload), p = input.payload;
      if (oldPayload.kind === "PARTY" && p.kind === "PARTY" && (oldPayload.customerCode !== p.customerCode || oldPayload.projectCode !== p.projectCode) || oldPayload.kind === "PRICE" && p.kind === "PRICE" && (oldPayload.itemId !== p.itemId || oldPayload.uomId !== p.uomId || oldPayload.partyCode !== p.partyCode) || oldPayload.kind === "VEHICLE" && p.kind === "VEHICLE" && oldPayload.identity !== p.identity) fail("Identitas version harus tetap; gunakan kode baru untuk referensi berbeda.");
    }
    const row = await tx.commerceConfig.create({ data: { ...input, kind: input.payload.kind, payload: json(input.payload), payloadHash: operationHash(input), makerId: actor.userId } });
    await writeAudit(tx, { userId: actor.userId, module: "COMMERCE_CONFIG", action: "CREATE_VERSION", recordId: row.id, newValue: json(input), request }); return row;
  });
}
export async function actCommerceConfig(client: PrismaClient, actor: AccessActor, id: string, raw: unknown, request?: Request) {
  const input = configActionSchema.parse(raw);
  return atomic(client, async tx => {
    const row = await tx.commerceConfig.findUnique({ where: { id } }); if (!row) fail("Version tidak ditemukan.", 404);
    allow(actor, input.action === "attest-pc" ? "sales.config.create" : input.action === "attest-finance" ? "sales.policy.attest" : "sales.config.verify", row.plantId);
    if (row.verificationStatus === "VERIFIED") { if (input.action === "verify" && row.verifiedBy === actor.userId && row.verificationEvidence === input.evidence) return row; fail("Version sudah verified."); }
    if (input.action !== "verify" && row.kind !== "EVENT_POLICY") fail("Sign-off PC/Finance hanya untuk activation policy.", 422);
    if (input.action === "verify" && (row.makerId === actor.userId || row.pcBy === actor.userId || row.financeBy === actor.userId)) fail("Manager harus berbeda maker dan penandatangan policy.", 403);
    if (input.action === "attest-pc" && row.financeBy === actor.userId || input.action === "attest-finance" && (row.pcBy === actor.userId || row.makerId === actor.userId)) fail("Sign-off PC/Finance harus berbeda akun.", 403);
    if (input.action === "verify" && row.kind === "EVENT_POLICY" && (!row.pcBy || !row.financeBy)) fail("Activation gate memerlukan bukti sign-off PC/operasional dan Finance dahulu.", 422);
    if (input.action === "attest-pc" && row.pcBy || input.action === "attest-finance" && row.financeBy) {
      if (input.action === "attest-pc" && row.pcBy === actor.userId && row.pcEvidence === input.evidence || input.action === "attest-finance" && row.financeBy === actor.userId && row.financeEvidence === input.evidence) return row;
      fail("Sign-off telah dicatat; buat version baru untuk perubahan.");
    }
    await validateConfig(tx, configSchema.parse({ requestKey: row.requestKey, plantId: row.plantId, code: row.code, revision: row.revision, effectiveFrom: row.effectiveFrom.toISOString(), evidence: row.evidence, payload: row.payload }));
    const data = input.action === "attest-pc" ? { pcBy: actor.userId, pcEvidence: input.evidence } : input.action === "attest-finance" ? { financeBy: actor.userId, financeEvidence: input.evidence } : { verificationStatus: "VERIFIED" as const, verifiedBy: actor.userId, verifiedAt: new Date(), verificationEvidence: input.evidence };
    const result = await tx.commerceConfig.update({ where: { id }, data });
    await writeAudit(tx, { userId: actor.userId, module: "COMMERCE_CONFIG", action: input.action.toUpperCase(), recordId: id, newValue: input, request }); return result;
  });
}

export type SaleLine = { key: string; poLineKey?: string; itemId: string; itemName: string; itemKind: string; uomId: string; uom: string; quantity: string; unitPrice: string; amount: string; priceId: string; priceHash: string; resolvedPriceId: string; resolvedPriceHash: string; contractPrice: string; minimumOrder: string };
export type DispatchLine = SaleLine & { orderLineKey: string; locationId?: string };
export type CommerceSnapshot = { party: { code: string; versionId: string; customerCode: string; customerName: string; projectCode: string; projectName: string; address: string; contact: string; taxReference: string }; lines: SaleLine[]; freight: { mode: "PICKUP" | "DELIVERY"; term: string; basis: "NONE" | "PER_TRIP" | "PER_UNIT"; rate: string; internalRate: string }; currency: string; taxTreatment: string; payment: string; paymentTerm: string; deviation: boolean; subtotal: string; poRootId?: string; poVersionId?: string; dispatchLines?: DispatchLine[]; policy?: { id: string; hash: string; pickupCombined: boolean }; vehicle?: unknown; freightCharge?: string; internalFreight?: string };
export function recordSnapshot(row: { snapshot: Prisma.JsonValue | null }): CommerceSnapshot { if (!row.snapshot) fail("Source belum memiliki snapshot verified."); return row.snapshot as unknown as CommerceSnapshot; }
async function source(tx: Tx, actor: AccessActor, id: string, kind: string) {
  const row = await tx.commerceRecord.findUnique({ where: { id } }); if (!row || row.kind !== kind) fail("Referensi sumber tidak ditemukan.", 404);
  allow(actor, "sales.read", row.plantId); if (row.status !== "APPROVED") fail("Referensi sumber harus approved.", 422); return row;
}
async function activePO(tx: Tx, actor: AccessActor, id: string) {
  const prior = await source(tx, actor, id, "PO");
  const current = await tx.commerceRecord.findFirst({ where: { kind: "PO", rootId: prior.rootId, status: "APPROVED" }, orderBy: { revision: "desc" } });
  return current!;
}
async function realized(tx: Tx, where: Prisma.CommerceFulfillmentWhereInput) {
  return (await tx.commerceFulfillment.aggregate({ where, _sum: { quantity: true } }))._sum.quantity ?? new D(0);
}
function capacity(ordered: string, fulfilled: Prisma.Decimal, proposed: string) {
  try { remaining(ordered, fulfilled.toString(), proposed); } catch (error) { fail((error as Error).message); }
}
async function normalizeSale(tx: Tx, actor: AccessActor, input: Exclude<DocumentInput, { kind: "DELIVERY" }>, recordId?: string): Promise<CommerceSnapshot> {
  const date = new Date(input.effectiveAt); await plant(tx, input.plantId);
  if (date > new Date()) fail("Tanggal dokumen tidak boleh di masa depan.", 422);
  const party = await checkedConfig(tx, input.partyId, "PARTY", input.plantId, date); if (party.data.kind !== "PARTY") fail("Referensi customer/proyek salah.");
  const snapshot: CommerceSnapshot = { party: { code: party.code, versionId: party.id, ...party.data }, lines: [], freight: input.freight, currency: "", taxTreatment: "", payment: input.payment, paymentTerm: input.paymentTerm, deviation: false, subtotal: "0" };
  if (new Set(input.lines.map(l => l.itemId)).size !== input.lines.length) fail("Satu item hanya satu baris per dokumen; UOM tidak boleh dicampur.", 422);
  for (const line of input.lines) {
    const item = await material(tx, input.plantId, line.itemId, line.uomId), price = await checkedConfig(tx, line.priceId, "PRICE", input.plantId, date), p = price.data;
    if (p.kind !== "PRICE" || p.itemId !== item.id || p.uomId !== line.uomId || p.partyCode && p.partyCode !== party.code || new Date(p.validUntil) < date) fail("Harga tidak cocok customer/proyek/item/UOM/tanggal.", 422);
    let resolvedPrice = price;
    if (!p.partyCode) {
      const candidates = await tx.commerceConfig.findMany({ where: { plantId: input.plantId, kind: "PRICE", verificationStatus: "VERIFIED", effectiveFrom: { lte: date }, AND: [{ payload: { path: ["partyCode"], equals: party.code } }, { payload: { path: ["itemId"], equals: item.id } }, { payload: { path: ["uomId"], equals: line.uomId } }] }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }] });
      const active = candidates.filter((c, i) => candidates.findIndex(x => x.code === c.code) === i).filter(c => { const v = configSchema.shape.payload.parse(c.payload); return v.kind === "PRICE" && new Date(v.validUntil) >= date; });
      if (active.length > 1) fail("Lebih dari satu kontrak harga berlaku; pilih version kontrak eksplisit, bukan harga umum.", 422);
      if (active.length) resolvedPrice = await checkedConfig(tx, active[0].id, "PRICE", input.plantId, date);
    }
    const resolved = resolvedPrice.data; if (resolved.kind !== "PRICE") fail("Harga referensi tidak sesuai.");
    if (resolved.currency !== p.currency || resolved.taxTreatment !== p.taxTreatment) fail("Harga umum/kontrak memiliki currency atau tax treatment berbeda.", 422);
    if (snapshot.currency && (snapshot.currency !== p.currency || snapshot.taxTreatment !== p.taxTreatment)) fail("Currency dan tax treatment satu dokumen harus kompatibel.", 422);
    snapshot.currency = p.currency; snapshot.taxTreatment = p.taxTreatment;
    if (new D(line.quantity).lt(resolved.minimumOrder)) fail("Quantity order di bawah minimum kontrak verified; split delivery tidak memakai minimum per rit.", 422);
    if (!new D(line.unitPrice).eq(resolved.unitPrice) || !sameFreight(input.freight, resolved.freight)) snapshot.deviation = true;
    const amount = lineAmount(line.quantity, line.unitPrice); snapshot.subtotal = new D(snapshot.subtotal).plus(amount).toString();
    snapshot.lines.push({ ...line, amount, itemName: item.name, itemKind: item.kind, uom: item.primaryUom.code, priceHash: price.payloadHash, resolvedPriceId: resolvedPrice.id, resolvedPriceHash: resolvedPrice.payloadHash, contractPrice: resolved.unitPrice, minimumOrder: resolved.minimumOrder });
  }
  if (input.kind === "QUOTATION" && new Date(input.validUntil) < date) fail("Quotation sudah kedaluwarsa pada tanggal dokumen.", 422);
  if (input.kind === "SO") {
    if (input.quotationId) {
      const quote = await source(tx, actor, input.quotationId, "QUOTATION"), q = documentSchema.parse(quote.payload);
      if (q.kind !== "QUOTATION" || quote.plantId !== input.plantId || recordSnapshot(quote).party.code !== party.code || new Date(q.validUntil) < date) fail("Quotation berbeda customer/proyek/plant atau kedaluwarsa.", 422);
    }
    if (input.poId) {
      const po = await activePO(tx, actor, input.poId), p = recordSnapshot(po);
      if (po.id !== input.poId || po.plantId !== input.plantId || p.party.code !== party.code || p.payment !== input.payment || po.effectiveAt > date || p.currency !== snapshot.currency || p.taxTreatment !== snapshot.taxTreatment) fail("PO version/customer/proyek/plant/term tidak cocok atau bukan version aktif.", 422);
      snapshot.poRootId = po.rootId; snapshot.poVersionId = po.id;
      for (const line of snapshot.lines) {
        const committed = p.lines.find(l => l.key === line.poLineKey);
        if (!committed || committed.itemId !== line.itemId || committed.uomId !== line.uomId) fail("Pilih baris PO yang cocok dengan item/UOM SO.", 422);
        capacity(committed.quantity, new D(0), line.quantity);
        if (!new D(line.unitPrice).eq(committed.unitPrice) || !sameFreight(snapshot.freight, p.freight)) snapshot.deviation = true;
      }
    } else if (input.payment !== "CASH") fail("Kontrak/kredit wajib PO approved.", 422);
    else if (input.lines.some(l => l.poLineKey)) fail("SO tanpa PO tidak boleh memiliki referensi baris PO.", 422);
  }
  if (input.kind === "PO") {
    if (!input.previousId) {
      const partyVersions = await tx.commerceConfig.findMany({ where: { plantId: input.plantId, kind: "PARTY", code: party.code }, select: { id: true } });
      if (await tx.commerceRecord.count({ where: { ...(recordId ? { id: { not: recordId } } : {}), plantId: input.plantId, kind: "PO", previousId: null, status: { notIn: ["DRAFT", "REJECTED"] }, AND: [{ payload: { path: ["externalNumber"], equals: input.externalNumber } }, { OR: partyVersions.map(p => ({ payload: { path: ["partyId"], equals: p.id } })) }] } })) fail("Nomor PO customer/proyek sudah terdaftar. Gunakan amendment, jangan gandakan commitment.");
    }
    if (input.previousId) {
      const previous = await activePO(tx, actor, input.previousId), p = recordSnapshot(previous);
      if (previous.id !== input.previousId || previous.plantId !== input.plantId || p.party.code !== party.code || p.payment !== input.payment || p.currency !== snapshot.currency || p.taxTreatment !== snapshot.taxTreatment) fail("Amendment harus mengikuti PO aktif dengan identitas/term yang sama.");
      const old = documentSchema.parse(previous.payload);
      if (old.kind !== "PO" || old.externalNumber !== input.externalNumber) fail("Nomor Customer PO tetap pada amendment; gunakan PO baru untuk kontrak lain.", 422);
      for (const prior of p.lines) {
        const changed = snapshot.lines.find(l => l.key === prior.key);
        if (!changed || changed.itemId !== prior.itemId || changed.uomId !== prior.uomId) fail("Identitas baris PO tidak boleh dihapus/diubah; amend quantity dengan key yang tetap.", 422);
      }
      snapshot.poRootId = previous.rootId;
      for (const line of snapshot.lines) capacity(line.quantity, await realized(tx, { poRootId: previous.rootId, poLineKey: line.key }), "0");
    }
    if (input.lines.some(l => l.poLineKey)) fail("Baris PO menggunakan key sendiri.", 422);
  }
  return snapshot;
}
async function normalizeDelivery(tx: Tx, actor: AccessActor, input: Extract<DocumentInput, { kind: "DELIVERY" }>): Promise<CommerceSnapshot> {
  await plant(tx, input.plantId);
  const order = await source(tx, actor, input.salesOrderId, "SO"), s = recordSnapshot(order), date = new Date(input.effectiveAt);
  if (order.plantId !== input.plantId || date < order.effectiveAt) fail("Plant atau tanggal delivery tidak sesuai SO.", 422);
  const po = order.poId ? await activePO(tx, actor, order.poId) : null, ps = po ? recordSnapshot(po) : null;
  if (po && date < po.effectiveAt) fail("Tanggal delivery mendahului amendment PO aktif.", 422);
  const snapshot: CommerceSnapshot = { ...s, deviation: false, lines: s.lines, dispatchLines: [], poVersionId: po?.id, poRootId: po?.rootId };
  for (const line of input.lines) {
    const base = s.lines.find(l => l.key === line.orderLineKey); if (!base) fail("Baris tidak termasuk SO.", 422);
    await material(tx, input.plantId, base.itemId, base.uomId);
    if (input.mode === "SERVICE" ? base.itemKind !== "SERVICE" || !!line.locationId : base.itemKind === "SERVICE" || !line.locationId) fail("Jasa/sewa dipisahkan dari barang dan tidak mengurangi inventory.", 422);
    if (line.locationId) {
      const ref = await references(tx, actor, "delivery.manage", base.itemId, line.locationId);
      if (ref.location.plantId !== input.plantId) fail("Lokasi dispatch harus dalam plant SO.", 422);
    }
    capacity(base.quantity, await realized(tx, { salesOrderId: order.id, orderLineKey: base.key }), line.quantity);
    if (ps) {
      const commitment = ps.lines.find(l => l.key === base.poLineKey);
      if (!commitment || commitment.itemId !== base.itemId || commitment.uomId !== base.uomId) fail("Baris PO aktif tidak cocok SO.", 422);
      capacity(commitment.quantity, await realized(tx, { poRootId: po!.rootId, poLineKey: commitment.key }), line.quantity);
    }
    snapshot.dispatchLines!.push({ ...base, ...line, quantity: line.quantity, amount: lineAmount(line.quantity, base.unitPrice) });
  }
  if (input.mode !== "SERVICE" && s.freight.mode !== input.mode) fail("Mode delivery harus sesuai term SO yang approved.", 422);
  if (input.vehicleId) { const vehicle = await checkedConfig(tx, input.vehicleId, "VEHICLE", input.plantId, date); if (vehicle.data.kind !== "VEHICLE" || vehicle.data.driver !== input.driver) fail("Driver harus sesuai assignment kendaraan verified; ajukan version baru bila berubah.", 422); snapshot.vehicle = { id: vehicle.id, code: vehicle.code, ...vehicle.data, evidence: vehicle.verificationEvidence }; }
  else snapshot.vehicle = input.mode === "PICKUP" ? { customerVehicle: input.customerVehicle, driver: input.driver } : null;
  if (s.freight.basis === "PER_UNIT" && new Set(snapshot.dispatchLines!.map(l => l.uomId)).size > 1) fail("Tarif per unit tidak boleh menjumlahkan UOM berbeda.", 422);
  const units = snapshot.dispatchLines!.reduce((sum, l) => sum.plus(l.quantity), new D(0)).toString();
  snapshot.freightCharge = freightAmount(s.freight.basis, s.freight.rate, input.trips, units);
  snapshot.internalFreight = freightAmount(s.freight.basis, s.freight.internalRate, input.trips, units);
  return snapshot;
}
export async function saveCommerceRecord(client: PrismaClient, actor: AccessActor, raw: unknown, id?: string, request?: Request) {
  const { payload: input, version } = saveSchema.parse(raw); allow(actor, input.kind === "DELIVERY" ? "delivery.manage" : "sales.manage", input.plantId);
  return atomic(client, async tx => {
    await plant(tx, input.plantId);
    if (input.kind === "DELIVERY") { const order = await source(tx, actor, input.salesOrderId, "SO"); if (order.plantId !== input.plantId) fail("SO berbeda plant.", 422); }
    if (input.kind === "SO" && input.poId) { const po = await source(tx, actor, input.poId, "PO"); if (po.plantId !== input.plantId) fail("PO berbeda plant.", 422); }
    if (input.kind === "SO" && input.quotationId) { const quote = await source(tx, actor, input.quotationId, "QUOTATION"); if (quote.plantId !== input.plantId) fail("Quotation berbeda plant.", 422); }
    const old = id ? await tx.commerceRecord.findUnique({ where: { id } }) : await tx.commerceRecord.findUnique({ where: { requestKey: input.requestKey } });
    if (old) {
      allow(actor, old.kind === "DELIVERY" ? "delivery.manage" : "sales.manage", old.plantId);
      if (old.makerId !== actor.userId) fail("Hanya maker dapat mengedit/replay draft.", 403);
      if (!id) { if (old.payloadHash !== operationHash(input)) fail("Request key telah digunakan payload lain."); return old; }
      if (old.status !== "DRAFT" || old.version !== version) fail("Draft telah berubah atau tidak dapat diedit.");
      if (old.kind !== input.kind || old.plantId !== input.plantId || old.requestKey !== input.requestKey || old.previousId !== (input.kind === "PO" ? input.previousId ?? null : null)) fail("Identitas draft tidak boleh diubah.", 422);
      const result = await tx.commerceRecord.update({ where: { id }, data: { payload: json(input), payloadHash: operationHash(input), effectiveAt: new Date(input.effectiveAt), parentId: input.kind === "DELIVERY" ? input.salesOrderId : input.kind === "SO" ? input.quotationId ?? null : undefined, poId: input.kind === "SO" ? input.poId ?? null : undefined, version: { increment: 1 } } });
      await writeAudit(tx, { userId: actor.userId, module: "COMMERCE", action: "EDIT_DRAFT", recordId: result.id, newValue: json(input), request }); return result;
    }
    if (id) fail("Draft tidak ditemukan.", 404); if (version !== 0) fail("Version draft baru harus nol.", 422);
    let rootId: string = randomUUID(), revision = 1;
    if (input.kind === "PO" && input.previousId) {
      const previous = await activePO(tx, actor, input.previousId); if (previous.id !== input.previousId || previous.plantId !== input.plantId) fail("Amendment bukan PO aktif dalam plant.");
      rootId = previous.rootId;
      if (await tx.commerceRecord.count({ where: { rootId, status: { in: ["DRAFT", "SUBMITTED", "VERIFIED"] } } })) fail("Amendment lain masih menunggu; selesaikan atau tolak dahulu.");
      revision = (await tx.commerceRecord.findFirst({ where: { rootId }, orderBy: { revision: "desc" } }))!.revision + 1;
    }
    const identity = input.kind === "PO" && input.previousId ? randomUUID() : rootId;
    const result = await tx.commerceRecord.create({ data: { id: identity, rootId, revision, number: await nextDocumentNumber(tx, input.kind === "DELIVERY" ? "DELIVERY_ORDER" : input.kind === "SO" ? "SALES_ORDER" : input.kind === "QUOTATION" ? "QUOTATION" : "CUSTOMER_PO"), requestKey: input.requestKey, kind: input.kind, plantId: input.plantId, effectiveAt: new Date(input.effectiveAt), payload: json(input), payloadHash: operationHash(input), makerId: actor.userId, previousId: input.kind === "PO" ? input.previousId : undefined, parentId: input.kind === "DELIVERY" ? input.salesOrderId : input.kind === "SO" ? input.quotationId : undefined, poId: input.kind === "SO" ? input.poId : undefined } });
    await writeAudit(tx, { userId: actor.userId, module: "COMMERCE", action: "DRAFT", recordId: result.id, newValue: json(input), request }); return result;
  });
}
async function gate(tx: Tx, plantId: string, date: Date) {
  const row = await tx.commerceConfig.findFirst({ where: { plantId, kind: "EVENT_POLICY", verificationStatus: "VERIFIED", effectiveFrom: { lte: date } }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }] });
  if (!row || !row.pcBy || !row.financeBy) fail("Activation gate: event fisik belum disahkan PC/operasional, Finance dan Manager.", 422);
  const p = configSchema.shape.payload.parse(row.payload); if (p.kind !== "EVENT_POLICY") fail("Policy tidak sesuai.");
  return { id: row.id, hash: row.payloadHash, pickupCombined: p.pickupCombined };
}
function checkedCompletion(input: CompletionInput, snapshot: CommerceSnapshot, dispatchDate: Date) {
  const complete = completionSchema.parse(input), date = new Date(complete.effectiveAt), lines = snapshot.dispatchLines!;
  if (date < dispatchDate || date > new Date()) fail("Tanggal completion harus setelah dispatch dan tidak di masa depan.", 422);
  if (complete.lines.length !== lines.length || new Set(complete.lines.map(l => l.orderLineKey)).size !== lines.length) fail("Completion harus mencakup setiap baris dispatch tepat sekali.", 422);
  for (const line of lines) {
    const done = complete.lines.find(l => l.orderLineKey === line.orderLineKey);
    if (!done || !new D(done.accepted).plus(done.rejected).eq(line.quantity)) fail("Accepted + rejected harus sama dengan quantity keluar; retur tidak otomatis mengembalikan stok/remaining.", 422);
  }
  return complete;
}
async function dispatch(tx: Tx, actor: AccessActor, row: CommerceRecord, input: Extract<DocumentInput, { kind: "DELIVERY" }>, snapshot: CommerceSnapshot) {
  const date = new Date(input.effectiveAt); if (date > new Date()) fail("Dispatch tidak boleh di masa depan.", 422);
  await periodOpen(tx, row.plantId, date); snapshot.policy = await gate(tx, row.plantId, date);
  if (input.mode === "SERVICE") fail("Jasa/sewa memakai completion bukti layanan, bukan dispatch inventory.", 422);
  const lines = snapshot.dispatchLines!;
  const doc = await tx.stockDocument.create({ data: { number: await nextDocumentNumber(tx, "STOCK_DOCUMENT"), kind: "DELIVERY", requestKey: row.requestKey, payloadHash: row.payloadHash, effectiveAt: date, reason: input.reason, evidence: input.evidence, makerId: row.makerId, sourceName: row.number, sourceSnapshot: json({ deliveryId: row.id, snapshot }), lines: { create: lines.map((l, i) => ({ lineNo: i + 1, itemId: l.itemId, locationId: l.locationId!, quantity: new D(l.quantity), itemName: l.itemName, uomCode: l.uom })) } } });
  const moves: Move[] = [];
  for (const [i, l] of lines.entries()) { await ensureLegacyAdopted(tx, l.itemId, l.locationId!); moves.push({ itemId: l.itemId, locationId: l.locationId!, uomId: l.uomId, quantity: new D(l.quantity).negated(), effectiveAt: date, lineNo: i + 1, sourceRef: row.number }); }
  await appendStockMoves(tx, actor, doc.id, moves);
  await tx.stockDocument.update({ where: { id: doc.id }, data: { status: "POSTED", approvedBy: actor.userId, approvedAt: new Date(), version: { increment: 1 } } });
  await fulfill(tx, actor, row, snapshot);
  return doc.id;
}
async function fulfill(tx: Tx, actor: AccessActor, row: CommerceRecord, snapshot: CommerceSnapshot, effectiveAt = row.effectiveAt) {
  await tx.commerceFulfillment.createMany({ data: snapshot.dispatchLines!.map(l => ({ deliveryId: row.id, salesOrderId: row.parentId!, orderLineKey: l.orderLineKey, poVersionId: snapshot.poVersionId, poRootId: snapshot.poRootId, poLineKey: l.poLineKey, itemId: l.itemId, uomId: l.uomId, quantity: new D(l.quantity), effectiveAt, actorId: actor.userId })) });
}
export async function actCommerceRecord(client: PrismaClient, actor: AccessActor, id: string, raw: unknown, request?: Request) {
  const input = actionSchema.parse(raw);
  return atomic(client, async tx => {
    const row = await tx.commerceRecord.findUnique({ where: { id } }); if (!row) fail("Dokumen tidak ditemukan.", 404);
    const permission = input.action === "approve" || input.action === "reject" && row.status === "VERIFIED" && row.kind !== "DELIVERY" && can(actor, "sales.approve", row.plantId) ? "sales.approve" : row.kind === "DELIVERY" ? input.action === "verify" || input.action === "reject" ? "delivery.verify" : "delivery.manage" : input.action === "verify" || input.action === "reject" ? "sales.verify" : "sales.manage";
    allow(actor, permission, row.plantId);
    const payload = documentSchema.parse(row.payload);
    if (payload.kind === "DELIVERY") await source(tx, actor, payload.salesOrderId, "SO");
    if (input.action === "submit" && row.makerId !== actor.userId) fail("Hanya maker boleh submit.", 403);
    if (["verify", "approve", "reject"].includes(input.action) && (row.makerId === actor.userId || row.submitterId === actor.userId)) fail("Maker/submitter tidak boleh menyetujui sendiri.", 403);
    const target = input.action === "submit" ? "SUBMITTED" : input.action === "verify" ? "VERIFIED" : input.action === "approve" ? "APPROVED" : input.action === "reject" ? "REJECTED" : input.action === "dispatch" ? "DISPATCHED" : "COMPLETED";
    if (row.status === target || input.action === "verify" && row.status === "APPROVED" && row.verifierId === actor.userId) {
      if (input.action === "complete" || input.action === "pickup") { if (row.completionHash !== operationHash(input.completion)) fail("Completion replay berbeda dari bukti posted."); }
      return row;
    }
    if (input.action === "dispatch" && row.status === "COMPLETED" && row.stockDocumentId) return row;
    if (row.version !== input.version) fail("Dokumen telah berubah. Muat ulang.");
    let data: Prisma.CommerceRecordUncheckedUpdateInput = { version: { increment: 1 }, decisionEvidence: input.reason };
    if (input.action === "reject") {
      if (!["DRAFT", "SUBMITTED", "VERIFIED"].includes(row.status) && !(row.kind === "DELIVERY" && row.status === "APPROVED")) fail("Sumber posted/approved tidak dapat ditolak.");
      data.status = "REJECTED";
    } else if (["submit", "verify", "approve"].includes(input.action)) {
      const expected = input.action === "submit" ? "DRAFT" : input.action === "verify" ? "SUBMITTED" : "VERIFIED";
      if (row.status !== expected) fail("Status tidak menunggu tindakan ini.");
      const snapshot = payload.kind === "DELIVERY" ? await normalizeDelivery(tx, actor, payload) : await normalizeSale(tx, actor, payload, row.id);
      if (input.action !== "submit" && operationHash(snapshot) !== operationHash(row.snapshot)) fail("Referensi/harga/remaining berubah setelah submit. Tolak dan buat sumber baru.");
      if (input.action === "submit") { data.status = "SUBMITTED"; data.submitterId = actor.userId; data.snapshot = json(snapshot); }
      else if (input.action === "verify") { data.verifierId = actor.userId; data.status = row.kind === "PO" || snapshot.deviation ? "VERIFIED" : "APPROVED"; if (data.status === "APPROVED") await periodOpen(tx, row.plantId, row.effectiveAt); }
      else { if (row.kind === "DELIVERY") fail("Delivery diverifikasi PC; approval harga berada pada SO.", 422); await periodOpen(tx, row.plantId, row.effectiveAt); data.approverId = actor.userId; data.status = "APPROVED"; }
    } else {
      if (payload.kind !== "DELIVERY") fail("Dispatch/completion hanya untuk delivery.", 422);
      const isService = payload.mode === "SERVICE", combined = input.action === "pickup";
      if (combined && payload.mode !== "PICKUP" || input.action === "dispatch" && isService || input.action === "complete" && !isService && row.status !== "DISPATCHED" || (combined || input.action === "dispatch" || isService) && row.status !== "APPROVED") fail("Status/action tidak sesuai jalur delivery.");
      let snapshot = recordSnapshot(row);
      if (row.status === "APPROVED") {
        const current = await normalizeDelivery(tx, actor, payload);
        if (operationHash(current) !== operationHash(snapshot)) fail("PO/master/remaining berubah setelah verifikasi. Tolak sumber dan buat rencana baru.");
        snapshot = current;
      }
      if (input.action === "dispatch" || combined) {
        snapshot.policy = await gate(tx, row.plantId, row.effectiveAt);
        if (combined && !snapshot.policy.pickupCombined) fail("Activation policy tidak mengizinkan pickup dispatch+completion bersama.", 422);
        data.stockDocumentId = await dispatch(tx, actor, row, payload, snapshot); data.posterId = actor.userId; data.status = combined ? "COMPLETED" : "DISPATCHED";
        // Dispatch adds the approved event policy without changing the verified commercial snapshot.
        data.snapshot = json(snapshot);
      }
      if (input.action === "complete" || combined) {
        const completion = checkedCompletion(input.completion!, snapshot, row.effectiveAt); await periodOpen(tx, row.plantId, new Date(completion.effectiveAt));
        if (isService) { snapshot.policy = await gate(tx, row.plantId, new Date(completion.effectiveAt)); await fulfill(tx, actor, row, snapshot, new Date(completion.effectiveAt)); data.snapshot = json(snapshot); data.posterId = actor.userId; }
        data.completion = json(completion); data.completionHash = operationHash(completion); data.status = "COMPLETED";
      }
    }
    const result = await tx.commerceRecord.update({ where: { id }, data });
    await writeAudit(tx, { userId: actor.userId, module: "COMMERCE", action: input.action.toUpperCase(), recordId: id, previousValue: { status: row.status }, newValue: json({ ...input, status: result.status }), request }); return result;
  });
}
