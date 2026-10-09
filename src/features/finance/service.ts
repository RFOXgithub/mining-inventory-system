import { FinancialRecord, Prisma, PrismaClient } from "@prisma/client";
import { AccessActor, can } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { writeAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { atomic, jakartaMonth, periodOpen } from "@/features/inventory/ledger-service";
import { operationHash } from "@/features/operations/service";
import { recordSnapshot, CommerceSnapshot } from "@/features/commerce/service";
import { CompletionInput, configSchema as partySchema } from "@/features/commerce/schema";
import { actionSchema, configActionSchema, configSchema, RecordInput, recordSchema, saveSchema } from "./schema";
import { amount, calculateInvoice, dueDate, localDay } from "./calculations";

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
function fail(message: string, status = 409): never { throw new DomainError(status, message); }
function allow(actor: AccessActor, permission: string, plantId: string) { if (!can(actor, permission, plantId)) fail("Action atau cakupan plant tidak diizinkan.", 403); }
async function plant(tx: Tx, id: string) { const p = await tx.plant.findUnique({ where: { id } }); if (!p?.active || p.verificationStatus !== "VERIFIED") fail("Plant belum aktif/verified.", 422); }
async function checkedConfig(tx: Tx, id: string, kind: string, plantId: string, date: Date) {
  const row = await tx.financialConfig.findUnique({ where: { id } });
  if (!row || row.kind !== kind || row.plantId !== plantId || row.verificationStatus !== "VERIFIED" || row.effectiveFrom > date) fail("Parameter rekening/pajak/term belum verified atau belum berlaku.", 422);
  const current = await tx.financialConfig.findFirst({ where: { plantId, kind, code: row.code, verificationStatus: "VERIFIED", effectiveFrom: { lte: date } }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }] });
  if (current?.id !== id) fail("Version parameter telah digantikan.", 422);
  return { ...row, data: configSchema.shape.payload.parse(row.payload) };
}
export async function createFinancialConfig(db: PrismaClient, actor: AccessActor, raw: unknown, request?: Request) {
  const p = configSchema.parse(raw); allow(actor, "finance.config.create", p.plantId);
  return atomic(db, async tx => {
    const old = await tx.financialConfig.findUnique({ where: { requestKey: p.requestKey } });
    if (old) { if (old.makerId !== actor.userId || old.payloadHash !== operationHash(p)) fail("Request key digunakan maker/payload lain."); return old; }
    await plant(tx, p.plantId);
    const prior = await tx.financialConfig.findFirst({ where: { plantId: p.plantId, kind: p.payload.kind, code: p.code }, orderBy: { revision: "desc" } });
    if (p.revision !== (prior?.revision ?? 0) + 1 || prior && new Date(p.effectiveFrom) < prior.effectiveFrom) fail("Revision harus berurutan; tanggal berlaku tidak mundur.");
    if (prior) {
      const a = configSchema.shape.payload.parse(prior.payload), b = p.payload;
      if (a.kind === "ACCOUNT" && b.kind === "ACCOUNT" && (a.bank !== b.bank || a.number !== b.number || a.currency !== b.currency) || a.kind === "TERM" && b.kind === "TERM" && a.partyCode !== b.partyCode || a.kind === "TAX" && b.kind === "TAX" && (a.currency !== b.currency || a.commercialTreatment !== b.commercialTreatment)) fail("Identitas parameter tidak boleh berubah dalam kode yang sama.");
    }
    if (p.payload.kind === "TERM" && !await tx.commerceConfig.count({ where: { plantId: p.plantId, kind: "PARTY", code: p.payload.partyCode, verificationStatus: "VERIFIED" } })) fail("Customer/proyek term belum verified.", 422);
    const row = await tx.financialConfig.create({ data: { ...p, payload: json(p.payload), kind: p.payload.kind, payloadHash: operationHash(p), makerId: actor.userId } });
    await writeAudit(tx, { userId: actor.userId, module: "FINANCE_CONFIG", action: "CREATE_VERSION", recordId: row.id, newValue: json(p), request }); return row;
  });
}
export async function actFinancialConfig(db: PrismaClient, actor: AccessActor, id: string, raw: unknown, request?: Request) {
  const p = configActionSchema.parse(raw);
  return atomic(db, async tx => {
    const row = await tx.financialConfig.findUnique({ where: { id } }); if (!row) fail("Parameter tidak ditemukan.", 404);
    allow(actor, p.action === "finance" ? "finance.config.attest" : "finance.config.verify", row.plantId);
    if (p.action === "finance" && row.financeBy === actor.userId && row.financeEvidence === p.evidence || p.action === "verify" && row.verifiedBy === actor.userId && row.verificationEvidence === p.evidence) return row;
    if (row.verificationStatus === "VERIFIED" || p.action === "finance" && row.financeBy) fail("Sign-off sudah final; buat version baru.");
    if (actor.userId === row.makerId || p.action === "verify" && actor.userId === row.financeBy) fail("Verifier harus berbeda maker dan penandatangan lain.", 403);
    if (p.action === "verify" && !row.financeBy) fail("Verifikasi Manager membutuhkan attest Finance kedua.", 422);
    const result = await tx.financialConfig.update({ where: { id }, data: p.action === "finance" ? { financeBy: actor.userId, financeEvidence: p.evidence } : { verificationStatus: "VERIFIED", verifiedBy: actor.userId, verificationEvidence: p.evidence, verifiedAt: new Date() } });
    await writeAudit(tx, { userId: actor.userId, module: "FINANCE_CONFIG", action: p.action.toUpperCase(), recordId: id, newValue: p, request }); return result;
  });
}
export type BillingLine = { deliveryId: string; sourceKey: string; role: "ITEM" | "FREIGHT"; quantity: string; unitPrice: string; amount: string; label: string; uom: string; deliveryNumber: string; completionDate: string };
export type InvoiceSnapshot = { party: CommerceSnapshot["party"]; currency: string; taxTreatment: string; payment: string; billingMonth: string; lines: BillingLine[]; subtotal: string; tax: string; total: string; taxBase: string; taxConfig?: unknown; termConfig?: unknown; dueDate: string | null; gates: string[] };
export async function deliverySource(tx: Tx, plantId: string, id: string) {
  const row = await tx.commerceRecord.findUnique({ where: { id }, include: { stockDocument: true } });
  if (!row || row.plantId !== plantId || row.kind !== "DELIVERY" || row.status !== "COMPLETED" || !row.completion) fail("Sumber delivery/service belum completed dengan proof.", 422);
  const snapshot = recordSnapshot(row), completion = row.completion as unknown as CompletionInput;
  if (!snapshot.policy || !(snapshot.dispatchLines?.length) || !completion.evidence || !completion.receiver || snapshot.dispatchLines.some(l => l.itemKind !== "SERVICE") && row.stockDocument?.status !== "POSTED") fail("Sumber belum eligible/activation gate belum disahkan.", 422);
  return { row, snapshot, completion };
}
async function normalizeInvoice(tx: Tx, p: Extract<RecordInput, { kind: "INVOICE" }>, strict: boolean, excludeId?: string): Promise<InvoiceSnapshot> {
  const date = new Date(p.effectiveAt), normalized: BillingLine[] = [], sources = new Map<string, Awaited<ReturnType<typeof deliverySource>>>();
  for (const id of new Set(p.lines.map(l => l.deliveryId))) sources.set(id, await deliverySource(tx, p.plantId, id));
  const first = sources.values().next().value!;
  for (const s of sources.values()) {
    if (s.snapshot.party.code !== first.snapshot.party.code || s.snapshot.currency !== first.snapshot.currency || s.snapshot.taxTreatment !== first.snapshot.taxTreatment || s.snapshot.payment !== first.snapshot.payment || jakartaMonth(new Date(s.completion.effectiveAt)) !== p.billingMonth) fail("Sumber harus satu customer/proyek, periode completion, currency, tax treatment dan payment basis.", 422);
    if (new Date(s.completion.effectiveAt) > date) fail("Invoice tidak boleh mendahului completion sumber.", 422);
  }
  const claimed = await tx.financialInvoiceLine.findMany({ where: { deliveryId: { in: [...sources.keys()] }, invoice: { status: "ISSUED", ...(excludeId ? { id: { not: excludeId } } : {}) } } });
  for (const l of p.lines) {
    const s = sources.get(l.deliveryId)!;
    if (l.role === "ITEM") {
      const source = s.snapshot.dispatchLines!.find(v => v.orderLineKey === l.sourceKey), accepted = s.completion.lines.find(v => v.orderLineKey === l.sourceKey)?.accepted;
      if (!source || !accepted) fail("Baris sumber/accepted quantity tidak ditemukan.", 422);
      const used = claimed.filter(v => v.deliveryId === l.deliveryId && v.role === "ITEM" && v.sourceKey === l.sourceKey).reduce((n, v) => n.plus(v.quantity), new D(0));
      if (new D(l.quantity).gt(new D(accepted).minus(used))) fail("Double-billing: quantity melebihi accepted yang belum ditagih.");
      normalized.push({ ...l, unitPrice: source.unitPrice, amount: new D(l.quantity).mul(source.unitPrice).toDecimalPlaces(2).toString(), label: source.itemName, uom: source.uom, deliveryNumber: s.row.number, completionDate: localDay(s.completion.effectiveAt) });
    } else {
      const used = claimed.filter(v => v.deliveryId === l.deliveryId && v.role === "FREIGHT").reduce((n, v) => n.plus(v.amount), new D(0));
      if (new D(l.amount).gt(new D(s.snapshot.freightCharge ?? "0").minus(used))) fail("Freight melebihi charge customer belum ditagih. Biaya internal tidak menjadi invoice.");
      normalized.push({ deliveryId: l.deliveryId, sourceKey: l.deliveryId, role: "FREIGHT", quantity: "1", unitPrice: l.amount, amount: l.amount, label: "Freight customer", uom: "charge", deliveryNumber: s.row.number, completionDate: localDay(s.completion.effectiveAt) });
    }
  }
  if (strict) {
    const historic = await tx.financialInvoiceLine.findMany({ where: { deliveryId: { in: [...sources.keys()] } } });
    const issuedEvents = await tx.financialEvent.findMany({ where: { kind: "INVOICE", invoiceId: { in: historic.map(l => l.invoiceId) } } });
    for (const line of normalized) {
      const matching = historic.filter(l => l.deliveryId === line.deliveryId && l.sourceKey === line.sourceKey && l.role === line.role);
      const moves = matching.flatMap(l => issuedEvents.filter(e => e.invoiceId === l.invoiceId).map(e => ({ effectiveAt: e.effectiveAt, sequence: e.sequence, value: (line.role === "ITEM" ? l.quantity : l.amount).mul(e.amount.isPositive() ? 1 : -1) })));
      const last = issuedEvents.reduce((n, e) => e.sequence > n ? e.sequence : n, BigInt(0));
      moves.push({ effectiveAt: date, sequence: last + BigInt(1), value: new D(line.role === "ITEM" ? line.quantity : line.amount) });
      moves.sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime() || (a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0));
      const s = sources.get(line.deliveryId)!, capacity = new D(line.role === "ITEM" ? s.completion.lines.find(l => l.orderLineKey === line.sourceKey)!.accepted : s.snapshot.freightCharge ?? "0");
      let billed = new D(0);
      for (const move of moves) { billed = billed.plus(move.value); if (billed.gt(capacity) || billed.isNegative()) fail("Double-billing bertanggal: sumber masih ditagih pada effective date atau event berikutnya."); }
    }
  }
  const gates: string[] = [];
  const tax = p.taxId ? await checkedConfig(tx, p.taxId, "TAX", p.plantId, date) : null;
  if (tax?.data.kind === "TAX" && (tax.data.currency !== first.snapshot.currency || tax.data.commercialTreatment !== first.snapshot.taxTreatment)) fail("Pajak tidak kompatibel dengan snapshot sumber.", 422);
  if (!tax) gates.push("Pilih pajak/treatment verified sebelum issue.");
  const calculated = tax?.data.kind === "TAX" ? calculateInvoice(normalized, tax.data) : null;
  const term = p.termId ? await checkedConfig(tx, p.termId, "TERM", p.plantId, date) : null;
  let due: string | null = null;
  if (term?.data.kind === "TERM") {
    const t = term.data;
    if (t.partyCode !== first.snapshot.party.code) fail("Term bukan customer/proyek sumber.", 422);
    const dates = [...sources.values()].map(s => localDay(s.completion.effectiveAt)).sort();
    if (t.schedule === "PER_DELIVERY" && sources.size !== 1) fail("Term per-delivery hanya menerima satu sumber delivery.", 422);
    const basis = t.basis === "INVOICE" ? localDay(date) : t.basis === "DELIVERY" ? t.deliveryBasis === "FIRST_COMPLETION" ? dates[0] : dates[dates.length - 1] : t.basis === "EXPLICIT" ? t.explicitDueDate! : p.receivedDate;
    if (t.basis === "RECEIPT" && (!p.receivedDate || !p.receivedEvidence || p.receivedDate < localDay(date) || p.receivedDate > localDay(new Date()))) gates.push("Tanggal dan bukti invoice diterima customer diperlukan untuk term RECEIPT.");
    if (basis) due = t.basis === "EXPLICIT" ? basis : dueDate(basis, t.days);
  } else if (first.snapshot.payment !== "CASH") gates.push("Kontrak/kredit memerlukan term verified sebelum issue.");
  if (strict && gates.length) fail(gates.join(" "), 422);
  const gross = normalized.reduce((n, l) => n.plus(l.amount), new D(0)).toString();
  if (strict && new D(calculated?.total ?? "0").lte(0)) fail("Invoice total harus positif.", 422);
  return { party: first.snapshot.party, currency: first.snapshot.currency, taxTreatment: first.snapshot.taxTreatment, payment: first.snapshot.payment, billingMonth: p.billingMonth, lines: normalized.map((l, i) => ({ ...l, amount: calculated?.lines[i].amount ?? l.amount })), subtotal: calculated?.subtotal ?? gross, tax: calculated?.tax ?? "0", taxBase: calculated?.taxBase ?? "0", total: calculated?.total ?? gross, dueDate: due, gates, ...(tax ? { taxConfig: { id: tax.id, hash: tax.payloadHash, payload: tax.data } } : {}), ...(term ? { termConfig: { id: term.id, hash: term.payloadHash, payload: term.data } } : {}) };
}
async function activeSource(tx: Tx, id: string, kind: string, plantId: string) {
  const row = await tx.financialRecord.findUnique({ where: { id } });
  if (!row || row.plantId !== plantId || row.kind !== kind || row.status !== (kind === "INVOICE" ? "ISSUED" : "POSTED")) fail("Sumber keuangan belum aktif atau telah dibatalkan.", 422); return row;
}
async function normalize(tx: Tx, p: RecordInput, strict: boolean, excludeId?: string) {
  await plant(tx, p.plantId); const date = new Date(p.effectiveAt); if (date > new Date()) fail("Tanggal efektif tidak boleh di masa depan.", 422);
  if (p.kind === "INVOICE") { const s = await normalizeInvoice(tx, p, strict, excludeId); return { customerCode: s.party.customerCode, projectCode: s.party.projectCode, currency: s.currency, dueDate: s.dueDate, snapshot: json(s) }; }
  if (p.kind === "RECEIPT") {
    const party = await tx.commerceConfig.findUnique({ where: { id: p.partyId } });
    if (!party || party.plantId !== p.plantId || party.kind !== "PARTY" || party.verificationStatus !== "VERIFIED" || party.effectiveFrom > date) fail("Identitas customer receipt belum verified.", 422);
    const data = partySchema.shape.payload.parse(party.payload); if (data.kind !== "PARTY") fail("Customer salah.", 422);
    const account = p.accountId ? await checkedConfig(tx, p.accountId, "ACCOUNT", p.plantId, date) : null;
    if (strict && !account) fail("Receipt memerlukan rekening verified.", 422);
    if (account?.data.kind === "ACCOUNT" && (account.data.currency !== p.currency || !account.data.receiptAllowed)) fail("Rekening tidak menerima receipt currency ini.", 422);
    return { customerCode: data.customerCode, projectCode: data.projectCode, currency: p.currency, dueDate: null, snapshot: json({ party: { code: party.code, ...data }, amount: p.amount, bankReference: p.bankReference, account: account ? { id: account.id, hash: account.payloadHash, payload: account.data } : null, gates: account ? [] : ["Rekening verified diperlukan saat post receipt."] }) };
  }
  if (p.kind === "ALLOCATION") {
    const receipt = await activeSource(tx, p.receiptId, "RECEIPT", p.plantId), invoices = [];
    if (receipt.effectiveAt > date) fail("Allocation mendahului receipt.", 422);
    for (const l of p.lines) { const invoice = await activeSource(tx, l.invoiceId, "INVOICE", p.plantId); if (invoice.customerCode !== receipt.customerCode || invoice.currency !== receipt.currency || invoice.effectiveAt > date) fail("Allocation harus customer/currency sama dan tidak mendahului invoice.", 422); invoices.push({ ...l, number: invoice.number }); }
    return { customerCode: receipt.customerCode, projectCode: null, currency: receipt.currency, dueDate: null, snapshot: json({ receiptId: receipt.id, receiptNumber: receipt.number, lines: invoices }) };
  }
  if (p.kind === "PPH") {
    const invoice = await activeSource(tx, p.invoiceId, "INVOICE", p.plantId);
    if (invoice.effectiveAt > date || p.certificateDate > localDay(date)) fail("PPh mendahului invoice atau tanggal certificate setelah effective date.", 422);
    const others = await tx.financialRecord.findMany({ where: { kind: "PPH", customerCode: invoice.customerCode, status: { in: ["SUBMITTED", "VERIFIED", "REVERSED"] }, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (others.some(r => { const input = recordSchema.parse(r.payload); return input.kind === "PPH" && input.certificateNumber === p.certificateNumber && input.payerTaxIdentity === p.payerTaxIdentity; })) fail("Certificate PPh sudah digunakan; tidak boleh dikreditkan dua kali.");
    return { customerCode: invoice.customerCode, projectCode: invoice.projectCode, currency: invoice.currency, dueDate: null, snapshot: json({ invoiceId: invoice.id, invoiceNumber: invoice.number, amount: p.amount, certificateNumber: p.certificateNumber, certificateDate: p.certificateDate, payerTaxIdentity: p.payerTaxIdentity }) };
  }
  const target = await tx.financialRecord.findUnique({ where: { id: p.targetId } });
  if (!target || target.plantId !== p.plantId || !["ISSUED", "POSTED", "VERIFIED"].includes(target.status) || target.kind === "CORRECTION") fail("Target correction harus transaksi aktif final.", 422);
  if (target.effectiveAt > date) fail("Correction mendahului target.", 422);
  return { customerCode: target.customerCode, projectCode: target.projectCode, currency: target.currency, dueDate: null, snapshot: json({ targetId: target.id, targetNumber: target.number, kind: target.kind, original: target.snapshot }) };
}
export async function saveFinancialRecord(db: PrismaClient, actor: AccessActor, raw: unknown, id?: string, request?: Request) {
  const { payload: p, version } = saveSchema.parse(raw); allow(actor, "finance.manage", p.plantId);
  return atomic(db, async tx => {
    const existing = await tx.financialRecord.findUnique({ where: id ? { id } : { requestKey: p.requestKey } });
    if (!id && existing) { if (existing.payloadHash !== operationHash(p) || existing.makerId !== actor.userId) fail("Request key dipakai payload/maker lain."); return existing; }
    if (id && (!existing || existing.status !== "DRAFT" || existing.version !== version || existing.makerId !== actor.userId || existing.kind !== p.kind || existing.plantId !== p.plantId || existing.requestKey !== p.requestKey)) fail("Draft/version/maker tidak sesuai.");
    if (!id && version !== 0) fail("Draft baru memakai version nol.", 422);
    await periodOpen(tx, p.plantId, new Date(p.effectiveAt)); if (existing) await periodOpen(tx, p.plantId, existing.effectiveAt);
    const normalized = await normalize(tx, p, false, existing?.id);
    const data = { ...normalized, payload: json(p), payloadHash: operationHash(p), effectiveAt: new Date(p.effectiveAt), ...(p.kind === "CORRECTION" ? { targetId: p.targetId } : {}) };
    const row = existing ? await tx.financialRecord.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } }) : await tx.financialRecord.create({ data: { ...data, requestKey: p.requestKey, kind: p.kind, plantId: p.plantId, makerId: actor.userId, number: await nextDocumentNumber(tx, `FIN_${p.kind}`, new Date(p.effectiveAt), { INVOICE: "INV", RECEIPT: "RCPT", ALLOCATION: "ALLOC", PPH: "PPH", CORRECTION: "COR" }[p.kind]) } });
    await writeAudit(tx, { userId: actor.userId, module: "FINANCE", action: existing ? "UPDATE_DRAFT" : "CREATE_DRAFT", recordId: row.id, newValue: json(p), request }); return row;
  });
}
type EventInput = { kind: string; amount: Prisma.Decimal; invoiceId?: string | null; receiptId?: string | null; effectiveAt: Date; reversalOfId?: string; eventKey: string };
// Check every dated balance, including later events, so a backdated write cannot
// silently over-allocate an invoice or spend future receipt money.
export function assertFinancialTimeline(rows: { kind: string; amount: Prisma.Decimal; effectiveAt: Date; sequence: bigint }[], added: EventInput[], receipt: boolean) {
  const last = rows.reduce((n, e) => e.sequence > n ? e.sequence : n, BigInt(0));
  const timeline = [...rows, ...added.map((e, i) => ({ ...e, sequence: last + BigInt(i + 1) }))].sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime() || (a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0));
  let principal = new D(0), allocated = new D(0), pph = new D(0);
  for (const e of timeline) {
    if (e.kind === (receipt ? "RECEIPT" : "INVOICE")) principal = principal.plus(e.amount);
    if (e.kind === "ALLOCATION") allocated = allocated.plus(e.amount); if (e.kind === "PPH") pph = pph.plus(e.amount);
    if (principal.isNegative() || allocated.isNegative() || pph.isNegative() || principal.minus(allocated).minus(pph).isNegative()) fail("Posting ditolak: over-allocation/PPh atau saldo negatif pada tanggal efektif maupun event berikutnya.");
  }
}
async function appendEvents(tx: Tx, actor: AccessActor, record: FinancialRecord, added: EventInput[]) {
  for (const id of new Set(added.map(e => e.invoiceId).filter((v): v is string => !!v))) assertFinancialTimeline(await tx.financialEvent.findMany({ where: { invoiceId: id } }), added.filter(e => e.invoiceId === id), false);
  for (const id of new Set(added.map(e => e.receiptId).filter((v): v is string => !!v))) assertFinancialTimeline(await tx.financialEvent.findMany({ where: { receiptId: id } }), added.filter(e => e.receiptId === id), true);
  await tx.financialEvent.createMany({ data: added.map(e => ({ ...e, recordId: record.id, actorId: actor.userId })) });
}
export async function actFinancialRecord(db: PrismaClient, actor: AccessActor, id: string, raw: unknown, request?: Request) {
  const a = actionSchema.parse(raw);
  return atomic(db, async tx => {
    const row = await tx.financialRecord.findUnique({ where: { id } }); if (!row) fail("Dokumen tidak ditemukan.", 404);
    allow(actor, a.action === "approve" || a.action === "reject" && row.kind === "CORRECTION" ? "finance.correction.approve" : a.action === "verify" || a.action === "reject" && row.kind === "PPH" ? "finance.pph.verify" : "finance.manage", row.plantId);
    const expected = a.action === "issue" ? "ISSUED" : a.action === "post" || a.action === "approve" ? "POSTED" : a.action === "verify" ? "VERIFIED" : a.action === "submit" ? "SUBMITTED" : "REJECTED";
    const performedBy = a.action === "submit" ? row.submitterId : a.action === "verify" || a.action === "reject" ? row.verifierId : row.posterId;
    if (row.status === expected && performedBy === actor.userId && row.decisionEvidence === a.reason && row.version === a.version + 1) return row;
    if (row.version !== a.version) fail("Version berubah; refresh dokumen.");
    const p = recordSchema.parse(row.payload), date = row.effectiveAt;
    await periodOpen(tx, row.plantId, date);
    const isPeer = a.action === "verify" || a.action === "approve" || a.action === "reject";
    if (isPeer && actor.userId === row.makerId) fail("Approver/verifier harus berbeda maker.", 403);
    if (a.action === "submit") {
      if (row.status !== "DRAFT" || !["PPH", "CORRECTION"].includes(row.kind) || actor.userId !== row.makerId) fail("Hanya maker draft PPh/correction dapat submit.", 422);
    } else if (a.action === "issue") { if (row.kind !== "INVOICE" || row.status !== "DRAFT") fail("Issue hanya untuk draft invoice.", 422); }
    else if (a.action === "post") { if (!["RECEIPT", "ALLOCATION"].includes(row.kind) || row.status !== "DRAFT") fail("Post hanya untuk draft receipt/allocation.", 422); }
    else if (a.action === "verify") { if (row.kind !== "PPH" || row.status !== "SUBMITTED" || actor.userId === row.submitterId) fail("PPh memerlukan Finance verifier berbeda submitter.", 422); }
    else if (a.action === "approve") { if (row.kind !== "CORRECTION" || row.status !== "SUBMITTED" || actor.userId === row.submitterId) fail("Correction memerlukan Manager berbeda submitter.", 422); }
    else if (row.status !== "SUBMITTED" || !["PPH", "CORRECTION"].includes(row.kind)) fail("Reject hanya untuk PPh/correction submitted.", 422);
    const n = a.action === "reject" ? null : await normalize(tx, p, ["issue", "post", "verify", "approve"].includes(a.action), row.id);
    const added: EventInput[] = [];
    let targetToReverse: FinancialRecord | undefined;
    const key = (suffix: string) => `${row.id}:${suffix}`;
    if (a.action === "issue" && p.kind === "INVOICE") {
      const s = n!.snapshot as unknown as InvoiceSnapshot;
      for (const l of s.lines) await tx.financialInvoiceLine.create({ data: { invoiceId: id, deliveryId: l.deliveryId, sourceKey: l.sourceKey, role: l.role, quantity: new D(l.quantity), unitPrice: amount(l.unitPrice), amount: amount(l.amount), sourceSnapshot: json(l) } });
      added.push({ kind: "INVOICE", invoiceId: id, amount: amount(s.total), effectiveAt: date, eventKey: key("issue") });
    } else if (a.action === "post" && p.kind === "RECEIPT") added.push({ kind: "RECEIPT", receiptId: id, amount: amount(p.amount), effectiveAt: date, eventKey: key("receipt") });
    else if (a.action === "post" && p.kind === "ALLOCATION") for (const l of p.lines) added.push({ kind: "ALLOCATION", invoiceId: l.invoiceId, receiptId: p.receiptId, amount: amount(l.amount), effectiveAt: date, eventKey: key(l.invoiceId) });
    else if (a.action === "verify" && p.kind === "PPH") added.push({ kind: "PPH", invoiceId: p.invoiceId, amount: amount(p.amount), effectiveAt: date, eventKey: key("pph") });
    else if (a.action === "approve" && p.kind === "CORRECTION") {
      const target = await tx.financialRecord.findUniqueOrThrow({ where: { id: p.targetId } });
      if (actor.userId === target.makerId || actor.userId === target.posterId || actor.userId === target.verifierId) fail("Manager correction harus berbeda pembuat/pengesah sumber.", 403);
      await periodOpen(tx, target.plantId, target.effectiveAt);
      const original = await tx.financialEvent.findMany({ where: { recordId: target.id, reversalOfId: null } });
      if (!original.length || await tx.financialEvent.count({ where: { reversalOfId: { in: original.map(e => e.id) } } })) fail("Sumber sudah reversed atau tidak mempunyai event aktif.");
      if (target.kind === "INVOICE" || target.kind === "RECEIPT") {
        const settled = await tx.financialEvent.findMany({ where: target.kind === "INVOICE" ? { invoiceId: target.id, kind: { in: ["ALLOCATION", "PPH"] } } : { receiptId: target.id, kind: "ALLOCATION" } });
        if (!settled.reduce((v, e) => v.plus(e.amount), new D(0)).isZero()) fail("Dependency allocation/PPh aktif harus direversal dahulu.");
      }
      for (const e of original) { await periodOpen(tx, row.plantId, e.effectiveAt); added.push({ kind: e.kind, invoiceId: e.invoiceId, receiptId: e.receiptId, amount: e.amount.negated(), effectiveAt: date, reversalOfId: e.id, eventKey: key(e.id) }); }
      targetToReverse = target;
    }
    if (added.length) await appendEvents(tx, actor, row, added);
    if (targetToReverse) await tx.financialRecord.update({ where: { id: targetToReverse.id }, data: { status: targetToReverse.kind === "INVOICE" ? "CANCELLED" : "REVERSED", version: { increment: 1 } } });
    const result = await tx.financialRecord.update({ where: { id }, data: { ...(n ?? {}), status: expected, version: { increment: 1 }, decisionEvidence: a.reason, ...(a.action === "submit" ? { submitterId: actor.userId } : a.action === "verify" || a.action === "reject" ? { verifierId: actor.userId } : { posterId: actor.userId }) } });
    await writeAudit(tx, { userId: actor.userId, module: "FINANCE", action: a.action.toUpperCase(), recordId: id, newValue: json({ reason: a.reason, events: added.map(e => ({ ...e, amount: e.amount.toString() })) }), request }); return result;
  });
}
