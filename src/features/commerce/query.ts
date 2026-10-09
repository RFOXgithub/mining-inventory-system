import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor, can } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { CommerceSnapshot } from "./service";
import { CompletionInput } from "./schema";

export async function commerceData(db: PrismaClient, actor: AccessActor, url: URL) {
  if (!can(actor, "sales.read")) throw new DomainError(403, "Akses tidak diizinkan.");
  const domain = url.searchParams.get("domain") ?? "sales";
  if (!["sales", "po", "delivery"].includes(domain)) throw new DomainError(422, "Domain tidak valid.");
  const plantId = url.searchParams.get("plantId");
  if (plantId && !can(actor, "sales.read", plantId)) throw new DomainError(403, "Plant di luar cakupan.");
  const plantScope = { ...(actor.allPlants ? {} : { id: { in: actor.plantIds } }), ...(plantId ? { id: plantId } : {}) };
  const plants = await db.plant.findMany({ where: plantScope, orderBy: { code: "asc" } }), ids = plants.map(p => p.id);
  const page = Math.max(1, Math.min(100000, Number(url.searchParams.get("page")) || 1)), status = url.searchParams.get("status"), q = (url.searchParams.get("q") ?? "").slice(0, 100);
  const kinds = domain === "sales" ? ["QUOTATION", "SO"] : domain === "po" ? ["PO"] : ["DELIVERY"];
  const where: Prisma.CommerceRecordWhereInput = { plantId: { in: ids }, kind: { in: kinds }, ...(status ? { status } : {}), ...(q ? { number: { contains: q, mode: "insensitive" } } : {}) };
  const [records, total, configs, items, locations, references, fulfilled] = await Promise.all([
    db.commerceRecord.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 30, skip: (page - 1) * 30 }), db.commerceRecord.count({ where }),
    db.commerceConfig.findMany({ where: { plantId: { in: ids } }, orderBy: [{ code: "asc" }, { revision: "desc" }] }),
    db.catalogItem.findMany({ where: { plants: { some: { plantId: { in: ids } } } }, include: { primaryUom: true, plants: true }, orderBy: { code: "asc" } }),
    db.plantLocation.findMany({ where: { plantId: { in: ids } }, orderBy: { code: "asc" } }),
    db.commerceRecord.findMany({ where: { plantId: { in: ids }, status: "APPROVED", kind: { in: ["SO", "PO", "QUOTATION"] } }, orderBy: [{ revision: "desc" }, { createdAt: "desc" }] }),
    db.commerceFulfillment.findMany({ where: { delivery: { plantId: { in: ids } } }, select: { deliveryId: true, salesOrderId: true, orderLineKey: true, poRootId: true, poLineKey: true, quantity: true } }),
  ]);
  const activePOs = references.filter(r => r.kind === "PO").filter((r, i, all) => all.findIndex(p => p.rootId === r.rootId) === i);
  const billed = domain === "delivery" ? await db.financialInvoiceLine.findMany({ where: { deliveryId: { in: records.map(r => r.id) }, role: "ITEM", invoice: { status: "ISSUED" } }, select: { deliveryId: true, sourceKey: true, quantity: true } }) : [];
  const commitments = activePOs.map(po => ({ id: po.id, rootId: po.rootId, number: po.number, revision: po.revision, lines: (po.snapshot as unknown as CommerceSnapshot).lines.map(l => {
    const realized = fulfilled.filter(f => f.poRootId === po.rootId && f.poLineKey === l.key).reduce((n, f) => n.plus(f.quantity), new Prisma.Decimal(0));
    return { ...l, realized: realized.toString(), remaining: new Prisma.Decimal(l.quantity).minus(realized).toString() };
  }) }));
  const eligibility = records.filter(r => r.kind === "DELIVERY").map(r => {
    const snapshot = r.snapshot as unknown as CommerceSnapshot | null, completed = r.completion as unknown as CompletionInput | null;
    return { id: r.id, status: r.status, eligible: r.status === "COMPLETED" && !!snapshot?.policy && !!completed, lines: (snapshot?.dispatchLines ?? []).map(l => ({ orderLineKey: l.orderLineKey, itemId: l.itemId, uom: l.uom, dispatched: fulfilled.find(f => f.deliveryId === r.id && f.orderLineKey === l.orderLineKey)?.quantity.toString() ?? "0", accepted: completed?.lines.find(c => c.orderLineKey === l.orderLineKey)?.accepted ?? "0", rejected: completed?.lines.find(c => c.orderLineKey === l.orderLineKey)?.rejected ?? "0", invoiceEligible: r.status === "COMPLETED" && snapshot?.policy && completed ? new Prisma.Decimal(completed.lines.find(c => c.orderLineKey === l.orderLineKey)?.accepted ?? "0").minus(billed.filter(b => b.deliveryId === r.id && b.sourceKey === l.orderLineKey).reduce((n, b) => n.plus(b.quantity), new Prisma.Decimal(0))).toString() : "0" })) };
  });
  const histories = domain === "po" ? await db.commerceRecord.findMany({ where: { plantId: { in: ids }, kind: "PO", rootId: { in: records.map(r => r.rootId) } }, select: { id: true, rootId: true, number: true, revision: true, status: true, decisionEvidence: true, previousId: true, makerId: true, verifierId: true, approverId: true, createdAt: true }, orderBy: { revision: "asc" } }) : [];
  return { domain, page, records, total, plants, configs, items, locations, references: references.filter(r => r.kind !== "PO" || activePOs.some(p => p.id === r.id)), commitments, eligibility, histories };
}
