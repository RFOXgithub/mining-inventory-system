-- CreateEnum
CREATE TYPE "AdminFunction" AS ENUM ('PC', 'FINANCE');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "PlantKind" AS ENUM ('SC', 'BP', 'AMP');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('STOCKPILE', 'WAREHOUSE', 'TANK', 'QUARRY');

-- CreateEnum
CREATE TYPE "CatalogKind" AS ENUM ('MATERIAL', 'PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "UomDimension" AS ENUM ('UNKNOWN', 'MASS', 'VOLUME', 'COUNT', 'TIME', 'SERVICE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "actionPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "allPlants" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "functions" "AdminFunction"[] DEFAULT ARRAY[]::"AdminFunction"[],
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Plant" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PlantKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "evidence" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "verifiedBy" UUID,
    "verifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPlantScope" (
    "userId" UUID NOT NULL,
    "plantId" UUID NOT NULL,

    CONSTRAINT "UserPlantScope_pkey" PRIMARY KEY ("userId","plantId")
);

-- CreateTable
CREATE TABLE "PlantLocation" (
    "id" UUID NOT NULL,
    "plantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LocationKind" NOT NULL,
    "stockpileId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "evidence" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "verifiedBy" UUID,
    "verifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Uom" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dimension" "UomDimension" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "evidence" TEXT,
    "createdBy" UUID,
    "verifiedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Uom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CatalogKind" NOT NULL,
    "category" TEXT NOT NULL,
    "specification" TEXT,
    "primaryUomId" UUID NOT NULL,
    "legacyProductId" UUID,
    "legacyMaterialId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "evidence" TEXT,
    "createdBy" UUID,
    "updatedBy" UUID,
    "verifiedBy" UUID,
    "verifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItemPlant" (
    "itemId" UUID NOT NULL,
    "plantId" UUID NOT NULL,

    CONSTRAINT "CatalogItemPlant_pkey" PRIMARY KEY ("itemId","plantId")
);

-- CreateTable
CREATE TABLE "ItemAlias" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "evidence" TEXT,
    "createdBy" UUID NOT NULL,
    "verifiedBy" UUID,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "ItemAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UomConversion" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "fromUomId" UUID NOT NULL,
    "toUomId" UUID NOT NULL,
    "factor" DECIMAL(24,12) NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "evidence" TEXT,
    "createdBy" UUID NOT NULL,
    "verifiedBy" UUID,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "UomConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plant_code_key" ON "Plant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PlantLocation_stockpileId_key" ON "PlantLocation"("stockpileId");

-- CreateIndex
CREATE UNIQUE INDEX "PlantLocation_plantId_code_key" ON "PlantLocation"("plantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Uom_code_key" ON "Uom"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_legacyProductId_key" ON "CatalogItem"("legacyProductId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_legacyMaterialId_key" ON "CatalogItem"("legacyMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_kind_code_key" ON "CatalogItem"("kind", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ItemAlias_itemId_normalizedName_key" ON "ItemAlias"("itemId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "UomConversion_itemId_fromUomId_toUomId_version_key" ON "UomConversion"("itemId", "fromUomId", "toUomId", "version");

-- AddForeignKey
ALTER TABLE "UserPlantScope" ADD CONSTRAINT "UserPlantScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlantScope" ADD CONSTRAINT "UserPlantScope_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantLocation" ADD CONSTRAINT "PlantLocation_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantLocation" ADD CONSTRAINT "PlantLocation_stockpileId_fkey" FOREIGN KEY ("stockpileId") REFERENCES "Stockpile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_primaryUomId_fkey" FOREIGN KEY ("primaryUomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_legacyProductId_fkey" FOREIGN KEY ("legacyProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_legacyMaterialId_fkey" FOREIGN KEY ("legacyMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemPlant" ADD CONSTRAINT "CatalogItemPlant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemPlant" ADD CONSTRAINT "CatalogItemPlant_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAlias" ADD CONSTRAINT "ItemAlias_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UomConversion" ADD CONSTRAINT "UomConversion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UomConversion" ADD CONSTRAINT "UomConversion_fromUomId_fkey" FOREIGN KEY ("fromUomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UomConversion" ADD CONSTRAINT "UomConversion_toUomId_fkey" FOREIGN KEY ("toUomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve legacy roles and assignments. Only the unambiguous technical role is
-- bridged automatically; business scope/function/grants require explicit review.
INSERT INTO "Role" ("id", "code", "name")
SELECT md5('quarryflow:role:' || code)::uuid, code, code
FROM unnest(ARRAY['SUPERADMIN','DIREKTUR','ADMIN','MANAGER','HSE']) AS code
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "UserRole" ("userId", "roleId")
SELECT ur."userId", final_role."id" FROM "UserRole" ur
JOIN "Role" legacy ON legacy."id"=ur."roleId" AND legacy."code"='SUPER_ADMIN'
CROSS JOIN "Role" final_role WHERE final_role."code"='SUPERADMIN'
ON CONFLICT DO NOTHING;

UPDATE "User" SET "actionPermissions"=ARRAY['users.manage','roles.manage','settings.manage','audit.read']
WHERE "id" IN (SELECT ur."userId" FROM "UserRole" ur JOIN "Role" r ON r."id"=ur."roleId" WHERE r."code"='SUPER_ADMIN');

-- These definitions are units, not company conversion/density parameters.
INSERT INTO "Uom" ("id","code","name","dimension","verificationStatus","evidence") VALUES
(gen_random_uuid(),'KG','Kilogram','MASS','VERIFIED','Definisi satuan kilogram'),
(gen_random_uuid(),'TON','Ton','MASS','VERIFIED','Satuan ton metrik'),
(gen_random_uuid(),'M3','Meter kubik','VOLUME','VERIFIED','Definisi meter kubik'),
(gen_random_uuid(),'L','Liter','VOLUME','VERIFIED','Definisi satuan liter'),
(gen_random_uuid(),'PCS','Unit','COUNT','VERIFIED','Satuan hitung unit')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "Uom" ("id","code","name","dimension")
SELECT gen_random_uuid(), unit, CASE WHEN unit='' THEN 'Unit legacy tanpa label' ELSE unit END, 'UNKNOWN'::"UomDimension"
FROM (SELECT "unit" FROM "Product" UNION SELECT "unit" FROM "Material") legacy
ON CONFLICT ("code") DO NOTHING;

-- Preserve labels, units and source IDs. No alias merge or company verification.
INSERT INTO "CatalogItem" ("id","code","name","kind","category","primaryUomId","legacyProductId","active","updatedAt")
SELECT gen_random_uuid(), p."code", p."name", 'PRODUCT', p."category", u."id", p."id", p."active" AND p."deletedAt" IS NULL, CURRENT_TIMESTAMP
FROM "Product" p JOIN "Uom" u ON u."code"=p."unit";
INSERT INTO "CatalogItem" ("id","code","name","kind","category","primaryUomId","legacyMaterialId","active","updatedAt")
SELECT gen_random_uuid(), m."code", m."name", 'MATERIAL', 'Legacy', u."id", m."id", m."active", CURRENT_TIMESTAMP
FROM "Material" m JOIN "Uom" u ON u."code"=m."unit";

ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_single_legacy_source" CHECK (NOT ("legacyProductId" IS NOT NULL AND "legacyMaterialId" IS NOT NULL));
ALTER TABLE "UomConversion" ADD CONSTRAINT "UomConversion_positive_factor" CHECK ("factor" > 0 AND "fromUomId" <> "toUomId");
ALTER TABLE "UomConversion" ADD CONSTRAINT "UomConversion_positive_version" CHECK ("version" > 0);
ALTER TABLE "User" ADD CONSTRAINT "User_no_wildcard_grant" CHECK (NOT ('*' = ANY("actionPermissions")));
