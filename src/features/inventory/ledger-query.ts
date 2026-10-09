import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { assertStockAction } from "./ledger-service";

export async function inventoryData(client: PrismaClient, actor: AccessActor, url: URL) {
  assertStockAction(actor, "inventory.read");
  const scope = actor.allPlants ? {} : { plantId: { in: actor.plantIds } };
  const locationWhere = scope;
  const [locations, items, periods] = await Promise.all([
    client.plantLocation.findMany({ where: locationWhere, include: { plant: { select: { id: true, name: true, active: true, verificationStatus: true } } }, orderBy: [{ plantId: "asc" }, { code: "asc" }] }),
    client.catalogItem.findMany({ where: { OR: [{ plants: { some: actor.allPlants ? {} : { plantId: { in: actor.plantIds } } } }, { stockEntries: { some: { location: scope } } }] }, include: { primaryUom: true, plants: true }, orderBy: { name: "asc" } }),
    client.stockPeriod.findMany({ where: scope, orderBy: { month: "desc" }, take: 100 }),
  ]);
  const locationIds = locations.map(l => l.id);
  const aggregates = await client.stockLedgerEntry.groupBy({ by: ["locationId", "itemId", "uomId"], where: { locationId: { in: locationIds } }, _sum: { quantity: true } });
  const balances = aggregates.map(row => ({ ...row, balance: row._sum.quantity?.toString() ?? "0" }));
  const locationId = url.searchParams.get("locationId"), itemId = url.searchParams.get("itemId");
  let card: { id: string; number: string; kind: string; effectiveAt: Date; quantity: string; runningBalance: string; sourceRef: string | null; evidence: string }[] = [];
  let cardTotal = 0;
  const page = Math.max(1, Math.min(100000, Number(url.searchParams.get("page")) || 1));
  if (locationId && itemId) {
    const location = await client.plantLocation.findUnique({ where: { id: locationId } });
    if (!location) throw new DomainError(404, "Lokasi tidak ditemukan.");
    assertStockAction(actor, "inventory.read", location.plantId);
    const rows = await client.stockLedgerEntry.findMany({ where: { locationId, itemId }, include: { document: { select: { number: true, kind: true, evidence: true } } }, orderBy: [{ effectiveAt: "asc" }, { sequence: "asc" }] });
    let balance = new Prisma.Decimal(0); cardTotal = rows.length;
    card = rows.map(row => { balance = balance.plus(row.quantity); return { id: row.id, number: row.document.number, kind: row.document.kind, effectiveAt: row.effectiveAt, quantity: row.quantity.toString(), runningBalance: balance.toString(), sourceRef: row.sourceRef, evidence: row.document.evidence }; }).slice((page - 1) * 100, page * 100);
  }
  // Legacy balances remain visible as a separate read-only source until adoption.
  const legacy = await client.inventoryTransaction.groupBy({ by: ["stockpileId", "productId", "materialId", "direction"], where: { stockpile: { locationMaster: { is: { ...scope } } } }, _sum: { quantity: true } });
  const unmappedLegacy = actor.allPlants ? await client.inventoryTransaction.count({ where: { stockpile: { locationMaster: { is: null } } } }) : 0;
  return { locations, items, periods, balances, card, cardTotal, page, legacy, unmappedLegacy };
}

export async function inventoryDocuments(client: PrismaClient, actor: AccessActor, url: URL) {
  assertStockAction(actor, "inventory.read");
  const requested = url.searchParams.get("kind");
  const kinds = ["RECEIPT", "TRANSFER", "OPENING", "LEGACY_IMPORT", "OPNAME", "ADJUSTMENT", "INTERNAL_ISSUE", "REVERSAL", "PRODUCTION", "BLENDING", "FUEL_USAGE"] as const;
  const kind = kinds.find(k => k === requested);
  const scope: Prisma.StockDocumentWhereInput = actor.allPlants ? {} : { lines: { every: { location: { plantId: { in: actor.plantIds } }, OR: [{ destinationId: null }, { destinationId: { in: (await client.plantLocation.findMany({ where: { plantId: { in: actor.plantIds } }, select: { id: true } })).map(l => l.id) } }] } } };
  const where: Prisma.StockDocumentWhereInput = { ...scope, ...(kind ? { kind } : {}) };
  const page = Math.max(1, Math.min(100000, Number(url.searchParams.get("page")) || 1));
  const [data, total] = await Promise.all([client.stockDocument.findMany({ where, include: { lines: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30 }), client.stockDocument.count({ where })]);
  return { data, total, page };
}
