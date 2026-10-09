-- CreateEnum
CREATE TYPE "OperationalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'POSTED', 'REJECTED', 'REVERSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockDocumentKind" ADD VALUE 'PRODUCTION';
ALTER TYPE "StockDocumentKind" ADD VALUE 'BLENDING';
ALTER TYPE "StockDocumentKind" ADD VALUE 'FUEL_USAGE';

-- CreateTable
CREATE TABLE "OperationalConfig" (
    "id" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "plantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "evidence" TEXT NOT NULL,
    "makerId" UUID NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedBy" UUID,
    "verifiedAt" TIMESTAMP(3),
    "verificationEvidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalRun" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "requestKey" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "plantId" UUID NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "status" "OperationalStatus" NOT NULL DEFAULT 'DRAFT',
    "payload" JSONB NOT NULL,
    "snapshot" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "makerId" UUID NOT NULL,
    "submitterId" UUID,
    "verifierId" UUID,
    "posterId" UUID,
    "decisionEvidence" TEXT,
    "mixVersionId" UUID,
    "fuelUsageId" UUID,
    "stockDocumentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperationalConfig_requestKey_key" ON "OperationalConfig"("requestKey");

-- CreateIndex
CREATE INDEX "OperationalConfig_plantId_kind_verificationStatus_idx" ON "OperationalConfig"("plantId", "kind", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalConfig_plantId_kind_code_revision_key" ON "OperationalConfig"("plantId", "kind", "code", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalRun_number_key" ON "OperationalRun"("number");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalRun_requestKey_key" ON "OperationalRun"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalRun_stockDocumentId_key" ON "OperationalRun"("stockDocumentId");

-- CreateIndex
CREATE INDEX "OperationalRun_plantId_kind_effectiveAt_status_idx" ON "OperationalRun"("plantId", "kind", "effectiveAt", "status");

-- AddForeignKey
ALTER TABLE "OperationalConfig" ADD CONSTRAINT "OperationalConfig_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRun" ADD CONSTRAINT "OperationalRun_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRun" ADD CONSTRAINT "OperationalRun_mixVersionId_fkey" FOREIGN KEY ("mixVersionId") REFERENCES "OperationalConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRun" ADD CONSTRAINT "OperationalRun_fuelUsageId_fkey" FOREIGN KEY ("fuelUsageId") REFERENCES "OperationalRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRun" ADD CONSTRAINT "OperationalRun_stockDocumentId_fkey" FOREIGN KEY ("stockDocumentId") REFERENCES "StockDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Source versions are append-only; verified parameters never change in place.
CREATE FUNCTION qf_operational_config_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Operational versions are immutable'; END IF;
  IF OLD."verificationStatus" <> 'UNVERIFIED' OR NEW."verificationStatus" <> 'VERIFIED'
     OR (to_jsonb(OLD) - ARRAY['verificationStatus','verifiedBy','verifiedAt','verificationEvidence'])
        IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['verificationStatus','verifiedBy','verifiedAt','verificationEvidence'])
     OR NEW."verifiedBy" IS NULL OR NEW."verifiedBy" = OLD."makerId" THEN
    RAISE EXCEPTION 'Operational version cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER operational_config_immutable BEFORE UPDATE OR DELETE ON "OperationalConfig"
FOR EACH ROW EXECUTE FUNCTION qf_operational_config_guard();

CREATE FUNCTION qf_operational_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Operational sources cannot be deleted'; END IF;
  IF NEW.id <> OLD.id OR NEW."requestKey" <> OLD."requestKey" OR NEW."makerId" <> OLD."makerId" OR NEW."plantId" <> OLD."plantId" OR NEW.kind <> OLD.kind OR NEW.number <> OLD.number THEN
    RAISE EXCEPTION 'Operational source identity is immutable';
  END IF;
  IF OLD.status <> 'DRAFT' AND (NEW.payload IS DISTINCT FROM OLD.payload OR NEW."payloadHash" <> OLD."payloadHash" OR NEW."effectiveAt" <> OLD."effectiveAt" OR NEW."mixVersionId" IS DISTINCT FROM OLD."mixVersionId" OR NEW."fuelUsageId" IS DISTINCT FROM OLD."fuelUsageId") THEN
    RAISE EXCEPTION 'Submitted operational source is immutable';
  END IF;
  IF OLD.status IN ('VERIFIED','POSTED','REVERSED','REJECTED') AND NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
    RAISE EXCEPTION 'Verified actual snapshot is immutable';
  END IF;
  IF NOT ((OLD.status = 'DRAFT' AND NEW.status IN ('DRAFT','SUBMITTED','REJECTED')) OR (OLD.status = 'SUBMITTED' AND NEW.status IN ('VERIFIED','REJECTED')) OR (OLD.status = 'VERIFIED' AND NEW.status IN ('POSTED','REJECTED')) OR (OLD.status = 'POSTED' AND NEW.status = 'REVERSED')) THEN
    RAISE EXCEPTION 'Invalid operational transition';
  END IF;
  IF NEW.status IN ('VERIFIED','POSTED') AND (NEW."verifierId" IS NULL OR NEW."verifierId" = NEW."makerId" OR NEW."verifierId" = NEW."submitterId") THEN
    RAISE EXCEPTION 'Distinct verification required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER operational_source_immutable BEFORE UPDATE OR DELETE ON "OperationalRun"
FOR EACH ROW EXECUTE FUNCTION qf_operational_run_guard();
ALTER TABLE "OperationalConfig" ADD CONSTRAINT operational_revision_positive CHECK (revision > 0);
ALTER TABLE "OperationalRun" ADD CONSTRAINT operational_version_positive CHECK (version > 0);
ALTER TABLE "OperationalRun" ADD CONSTRAINT operational_kind_valid CHECK (kind IN ('SC','BP','AMP','BLENDING','FUEL_RECEIPT','FUEL_USAGE','FUEL_TRANSFER'));

ALTER TABLE "OperationalConfig" ADD COLUMN "assetRootId" UUID;
ALTER TABLE "OperationalConfig" ADD CONSTRAINT "OperationalConfig_assetRootId_fkey" FOREIGN KEY ("assetRootId") REFERENCES "OperationalConfig"(id) ON DELETE SET NULL ON UPDATE CASCADE;
