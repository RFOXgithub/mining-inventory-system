-- CreateEnum
CREATE TYPE "StockDocumentKind" AS ENUM ('RECEIPT', 'TRANSFER', 'OPENING', 'LEGACY_IMPORT', 'OPNAME', 'ADJUSTMENT', 'INTERNAL_ISSUE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "StockDocumentStatus" AS ENUM ('SUBMITTED', 'POSTED', 'REJECTED', 'REVERSED');

-- CreateTable
CREATE TABLE "StockPeriod" (
    "id" UUID NOT NULL,
    "plantId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "requestedBy" UUID,
    "requestClose" BOOLEAN,
    "reason" TEXT,
    "financeBy" UUID,
    "evidence" TEXT,
    "approvedBy" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "StockPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockDocument" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "StockDocumentKind" NOT NULL,
    "status" "StockDocumentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "requestKey" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "sourceName" TEXT,
    "checksum" TEXT,
    "sourceSnapshot" JSONB,
    "makerId" UUID NOT NULL,
    "financeBy" UUID,
    "financeEvidence" TEXT,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "reversalOfId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockDocumentLine" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "destinationId" UUID,
    "quantity" DECIMAL(24,6) NOT NULL,
    "bookQuantity" DECIMAL(24,6),
    "snapshotHash" TEXT,
    "itemName" TEXT NOT NULL,
    "uomCode" TEXT NOT NULL,

    CONSTRAINT "StockDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLedgerEntry" (
    "id" UUID NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "documentId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "uomId" UUID NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "legacyId" UUID,
    "sourceRef" TEXT,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOpeningClaim" (
    "locationId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "documentId" UUID NOT NULL,

    CONSTRAINT "StockOpeningClaim_pkey" PRIMARY KEY ("locationId","itemId")
);

-- CreateTable
CREATE TABLE "StockDependency" (
    "sourceId" UUID NOT NULL,
    "dependentId" UUID NOT NULL,

    CONSTRAINT "StockDependency_pkey" PRIMARY KEY ("sourceId","dependentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockPeriod_plantId_month_key" ON "StockPeriod"("plantId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "StockDocument_number_key" ON "StockDocument"("number");

-- CreateIndex
CREATE UNIQUE INDEX "StockDocument_requestKey_key" ON "StockDocument"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "StockDocument_reversalOfId_key" ON "StockDocument"("reversalOfId");

-- CreateIndex
CREATE INDEX "StockDocument_kind_createdAt_idx" ON "StockDocument"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockDocumentLine_documentId_lineNo_key" ON "StockDocumentLine"("documentId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "StockLedgerEntry_eventKey_key" ON "StockLedgerEntry"("eventKey");
CREATE UNIQUE INDEX "StockLedgerEntry_sequence_key" ON "StockLedgerEntry"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "StockLedgerEntry_legacyId_key" ON "StockLedgerEntry"("legacyId");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_locationId_itemId_effectiveAt_idx" ON "StockLedgerEntry"("locationId", "itemId", "effectiveAt");

-- AddForeignKey
ALTER TABLE "StockPeriod" ADD CONSTRAINT "StockPeriod_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "StockDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StockDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "PlantLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StockDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "PlantLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Posted sources and ledger events are immutable. Corrections append reversals.
CREATE FUNCTION qf_stock_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Stock ledger is immutable'; END $$;
CREATE TRIGGER stock_ledger_immutable BEFORE UPDATE OR DELETE ON "StockLedgerEntry" FOR EACH ROW EXECUTE FUNCTION qf_stock_immutable();
CREATE TRIGGER stock_legacy_immutable BEFORE INSERT OR UPDATE OR DELETE ON "InventoryTransaction" FOR EACH ROW EXECUTE FUNCTION qf_stock_immutable();
CREATE FUNCTION qf_stock_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_status text;
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Stock source lines are immutable'; END IF;
 EXECUTE format('SELECT status::text FROM %I."StockDocument" WHERE id=$1', TG_TABLE_SCHEMA) INTO source_status USING NEW."documentId";
 IF source_status <> 'SUBMITTED' THEN
   RAISE EXCEPTION 'Stock source lines are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_line_immutable BEFORE INSERT OR UPDATE OR DELETE ON "StockDocumentLine" FOR EACH ROW EXECUTE FUNCTION qf_stock_line_guard();
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT stock_ledger_nonzero CHECK (quantity <> 0);
ALTER TABLE "StockDocumentLine" ADD CONSTRAINT stock_line_no_positive CHECK ("lineNo" > 0);
ALTER TABLE "StockPeriod" ADD CONSTRAINT stock_month_format CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "StockDocumentLine" ADD CONSTRAINT stock_destination_fk FOREIGN KEY ("destinationId") REFERENCES "PlantLocation"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockOpeningClaim" ADD CONSTRAINT stock_opening_item_fk FOREIGN KEY ("itemId") REFERENCES "CatalogItem"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockOpeningClaim" ADD CONSTRAINT stock_opening_location_fk FOREIGN KEY ("locationId") REFERENCES "PlantLocation"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockOpeningClaim" ADD CONSTRAINT stock_opening_source_fk FOREIGN KEY ("documentId") REFERENCES "StockDocument"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockDependency" ADD CONSTRAINT stock_dependency_source_fk FOREIGN KEY ("sourceId") REFERENCES "StockDocument"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockDependency" ADD CONSTRAINT stock_dependency_target_fk FOREIGN KEY ("dependentId") REFERENCES "StockDocument"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION qf_stock_document_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Stock sources cannot be deleted'; END IF;
 IF ROW(NEW.id,NEW.number,NEW.kind,NEW."requestKey",NEW."payloadHash",NEW."effectiveAt",NEW.reason,NEW.evidence,NEW."sourceName",NEW.checksum,NEW."sourceSnapshot",NEW."makerId",NEW."reversalOfId",NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD.number,OLD.kind,OLD."requestKey",OLD."payloadHash",OLD."effectiveAt",OLD.reason,OLD.evidence,OLD."sourceName",OLD.checksum,OLD."sourceSnapshot",OLD."makerId",OLD."reversalOfId",OLD."createdAt") THEN
   RAISE EXCEPTION 'Stock source fields are immutable';
 END IF;
 IF OLD.status IN ('REJECTED','REVERSED') OR (OLD.status='POSTED' AND NEW.status <> 'REVERSED') THEN RAISE EXCEPTION 'Invalid stock transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_document_immutable BEFORE UPDATE OR DELETE ON "StockDocument" FOR EACH ROW EXECUTE FUNCTION qf_stock_document_guard();
ALTER TABLE "StockPeriod" ADD COLUMN "reconciliationHash" TEXT;
