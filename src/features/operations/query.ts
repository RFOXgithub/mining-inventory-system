import { Prisma, PrismaClient } from "@prisma/client";
import { AccessActor, can } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { fuelKpi } from "./calculations";
import { RunSnapshot } from "./service";

export async function operationData(db: PrismaClient, actor: AccessActor, url: URL) {
  const domain = url.searchParams.get("domain") ?? "production", key = domain === "fuel" ? "fuel.read" : "production.read";
  if (!["production", "blending", "fuel"].includes(domain) || !can(actor, key)) throw new DomainError(403, "Akses tidak diizinkan.");
  const month = url.searchParams.get("month") ?? new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new DomainError(422, "Periode tidak valid.");
  const [year, m] = month.split("-").map(Number), range = { gte: new Date(Date.UTC(year, m - 1, 1) - 7 * 3600000), lt: new Date(Date.UTC(year, m, 1) - 7 * 3600000) };
  const requestedPlant = url.searchParams.get("plantId");
  if (requestedPlant && !can(actor, key, requestedPlant)) throw new DomainError(403, "Plant di luar cakupan.");
  const scope = { ...(actor.allPlants ? {} : { id: { in: actor.plantIds } }), ...(requestedPlant ? { id: requestedPlant } : {}) };
  const plants = await db.plant.findMany({ where: scope, orderBy: { code: "asc" } }), ids = plants.map(p => p.id);
  const page = Math.max(1, Math.min(100000, Number(url.searchParams.get("page")) || 1));
  const kinds = domain === "fuel" ? ["FUEL_RECEIPT", "FUEL_USAGE", "FUEL_TRANSFER"] : domain === "blending" ? ["BLENDING"] : ["SC", "BP", "AMP"];
  const allowedLocations = actor.allPlants ? [] : await db.plantLocation.findMany({ where: { plantId: { in: actor.plantIds } }, select: { id: true } });
  const allReferences: Prisma.OperationalRunWhereInput = actor.allPlants ? {} : { OR: [{ kind: { not: "FUEL_TRANSFER" } }, { kind: "FUEL_TRANSFER", OR: allowedLocations.map(l => ({ payload: { path: ["fuel", "destinationId"], equals: l.id } })) }] };
  const where: Prisma.OperationalRunWhereInput = { plantId: { in: ids }, kind: { in: kinds }, effectiveAt: range, ...allReferences };
  const fuelDefinitions = await db.operationalConfig.findMany({ where: { kind: "FUEL", verificationStatus: "VERIFIED" }, select: { payload: true } });
  const fuelIds = fuelDefinitions.map(c => (c.payload as { itemId: string }).itemId);
  const [runs, total, configs, locations, items, uoms, conversions, movements, posted, usages] = await Promise.all([
    db.operationalRun.findMany({ where, orderBy: [{ effectiveAt: "desc" }, { id: "asc" }], take: 30, skip: (page - 1) * 30 }), db.operationalRun.count({ where }),
    db.operationalConfig.findMany({ where: { plantId: { in: ids } }, orderBy: [{ code: "asc" }, { revision: "desc" }] }),
    db.plantLocation.findMany({ where: { plantId: { in: ids } }, orderBy: { code: "asc" } }),
    db.catalogItem.findMany({ where: { plants: { some: { plantId: { in: ids } } } }, include: { primaryUom: true, plants: true }, orderBy: { code: "asc" } }),
    db.uom.findMany({ where: { active: true, verificationStatus: "VERIFIED" }, orderBy: { code: "asc" } }),
    db.uomConversion.findMany({ where: { verificationStatus: "VERIFIED", item: { plants: { some: { plantId: { in: ids } } } } } }),
    db.stockLedgerEntry.groupBy({ by: ["itemId", "locationId"], where: { itemId: { in: fuelIds }, item: { primaryUom: { code: "L" } }, location: { plantId: { in: ids }, kind: "TANK" } }, _sum: { quantity: true } }),
    db.operationalRun.findMany({ where: { plantId: { in: ids }, effectiveAt: range, status: "POSTED", kind: { in: ["SC", "BP", "AMP", "FUEL_USAGE"] }, stockDocument: { status: "POSTED" } }, select: { id: true, plantId: true, kind: true, snapshot: true } }),
    domain === "production" && can(actor, "fuel.read") ? db.operationalRun.findMany({ where: { plantId: { in: ids }, kind: "FUEL_USAGE", status: "POSTED", stockDocument: { status: "POSTED" }, effectiveAt: range }, select: { id: true, number: true, plantId: true, effectiveAt: true, payload: true } }) : Promise.resolve([]),
  ]);
  const kpis = plants.map(p => {
    const sources = posted.filter(r => r.plantId === p.id), output = sources.filter(r => r.kind === p.kind).reduce((sum, r) => sum.plus((r.snapshot as unknown as RunSnapshot).outputQuantity), new Prisma.Decimal(0));
    const liters = sources.filter(r => r.kind === "FUEL_USAGE" && (r.snapshot as unknown as RunSnapshot).eligibleProduction).reduce((sum, r) => sum.plus((r.snapshot as unknown as RunSnapshot).fuelLiters), new Prisma.Decimal(0));
    return { plantId: p.id, plantName: p.name, month, output: output.toString(), liters: liters.toString(), unit: p.kind === "AMP" ? "liter/ton" : "liter/m³", ...fuelKpi(liters.toString(), output.toString()) };
  });
  const assetUsage = posted.filter(r => r.kind === "FUEL_USAGE").reduce((rows, run) => {
    const s = run.snapshot as unknown as RunSnapshot, asset = s.asset as { id: string; name: string }, old = rows.find(r => r.assetId === asset.id);
    if (old) old.liters = new Prisma.Decimal(old.liters).plus(s.fuelLiters).toString(); else rows.push({ assetId: asset.id, name: asset.name, plantId: run.plantId, liters: s.fuelLiters }); return rows;
  }, [] as { assetId: string; name: string; plantId: string; liters: string }[]);
  return { domain, month, page, runs, total, plants, configs, locations, items, uoms, conversions, tankBalances: movements.map(r => ({ itemId: r.itemId, locationId: r.locationId, liters: r._sum.quantity?.toString() ?? "0" })), kpis, assetUsage, usages };
}
