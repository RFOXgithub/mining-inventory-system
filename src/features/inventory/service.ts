import { Prisma, PrismaClient } from "@prisma/client";
export type InventoryItem = { productId: string; materialId?: never; sparePartId?: never } | { materialId: string; productId?: never; sparePartId?: never } | { sparePartId: string; productId?: never; materialId?: never };
// Legacy read helper; all writes use ledger-service and immutable ledger events.
export async function getBalance(db: Prisma.TransactionClient | PrismaClient, stockpileId: string, item: InventoryItem) {
  const rows = await db.inventoryTransaction.groupBy({ by: ["direction"], where: { stockpileId, ...item }, _sum: { quantity: true } });
  return rows.reduce((total, row) => total.plus((row._sum.quantity ?? new Prisma.Decimal(0)).times(row.direction === "IN" ? 1 : -1)), new Prisma.Decimal(0));
}
