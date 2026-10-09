-- Extend the immutable inventory ledger and stockpile master without dropping data.
ALTER TYPE "InventoryType" ADD VALUE IF NOT EXISTS 'TRANSFER_IN';
ALTER TYPE "InventoryType" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';
ALTER TYPE "InventoryType" ADD VALUE IF NOT EXISTS 'MAINTENANCE_USAGE';

CREATE TYPE "StockpileType" AS ENUM ('RAW_MATERIAL','FINISHED_GOODS','WASTE','TEMPORARY');
CREATE TYPE "StockpileStatus" AS ENUM ('ACTIVE','NEAR_CAPACITY','FULL','INACTIVE');

ALTER TABLE "Stockpile" ADD COLUMN "maximumCapacity" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN "minimumStock" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'TON',
ADD COLUMN "status" "StockpileStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "notes" TEXT,
ADD COLUMN "productId" UUID,
ADD COLUMN "materialId" UUID;
ALTER TABLE "Stockpile" ALTER COLUMN "type" TYPE "StockpileType" USING
  CASE "type" WHEN 'RAW' THEN 'RAW_MATERIAL'::"StockpileType" WHEN 'FINISHED' THEN 'FINISHED_GOODS'::"StockpileType" ELSE "type"::"StockpileType" END;
ALTER TABLE "Stockpile" DROP COLUMN "active";
ALTER TABLE "Stockpile" ADD CONSTRAINT "Stockpile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Stockpile" ADD CONSTRAINT "Stockpile_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryTransaction" ADD COLUMN "notes" TEXT,
ADD COLUMN "balanceAfter" DECIMAL(18,3),
ADD COLUMN "processingKey" TEXT;
WITH balances AS (
  SELECT id, SUM(CASE WHEN direction='IN' THEN quantity ELSE -quantity END) OVER (PARTITION BY "stockpileId", COALESCE("productId","materialId") ORDER BY "createdAt", id) AS balance
  FROM "InventoryTransaction"
) UPDATE "InventoryTransaction" target SET "balanceAfter"=balances.balance, "processingKey"='legacy:'||target.id::text FROM balances WHERE target.id=balances.id;
ALTER TABLE "InventoryTransaction" ALTER COLUMN "balanceAfter" SET NOT NULL, ALTER COLUMN "processingKey" SET NOT NULL;
CREATE UNIQUE INDEX "InventoryTransaction_processingKey_key" ON "InventoryTransaction"("processingKey");

CREATE TABLE "StockOpname" (
  "id" UUID NOT NULL, "number" TEXT NOT NULL, "stockpileId" UUID NOT NULL,
  "productId" UUID, "materialId" UUID, "systemStock" DECIMAL(18,3) NOT NULL,
  "physicalStock" DECIMAL(18,3) NOT NULL, "variance" DECIMAL(18,3) NOT NULL,
  "reason" TEXT NOT NULL, "notes" TEXT, "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "countedBy" UUID NOT NULL, "approvedBy" UUID, "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockOpname_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockOpname_stockpileId_fkey" FOREIGN KEY ("stockpileId") REFERENCES "Stockpile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockOpname_number_key" ON "StockOpname"("number");
CREATE INDEX "StockOpname_stockpileId_createdAt_idx" ON "StockOpname"("stockpileId","createdAt");
