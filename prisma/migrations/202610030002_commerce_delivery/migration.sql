-- AlterEnum
ALTER TYPE "StockDocumentKind" ADD VALUE 'DELIVERY';

-- CreateTable
CREATE TABLE "CommerceConfig" (
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
    "pcBy" UUID,
    "pcEvidence" TEXT,
    "financeBy" UUID,
    "financeEvidence" TEXT,
    "verifiedBy" UUID,
    "verifiedAt" TIMESTAMP(3),
    "verificationEvidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceRecord" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "requestKey" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "plantId" UUID NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "payload" JSONB NOT NULL,
    "snapshot" JSONB,
    "completion" JSONB,
    "completionHash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "makerId" UUID NOT NULL,
    "submitterId" UUID,
    "verifierId" UUID,
    "approverId" UUID,
    "posterId" UUID,
    "decisionEvidence" TEXT,
    "rootId" UUID NOT NULL,
    "previousId" UUID,
    "parentId" UUID,
    "poId" UUID,
    "stockDocumentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceFulfillment" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "poVersionId" UUID,
    "poRootId" UUID,
    "orderLineKey" UUID NOT NULL,
    "poLineKey" UUID,
    "itemId" UUID NOT NULL,
    "uomId" UUID NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "actorId" UUID NOT NULL,

    CONSTRAINT "CommerceFulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommerceConfig_requestKey_key" ON "CommerceConfig"("requestKey");

-- CreateIndex
CREATE INDEX "CommerceConfig_plantId_kind_verificationStatus_idx" ON "CommerceConfig"("plantId", "kind", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceConfig_plantId_kind_code_revision_key" ON "CommerceConfig"("plantId", "kind", "code", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceRecord_number_key" ON "CommerceRecord"("number");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceRecord_requestKey_key" ON "CommerceRecord"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceRecord_stockDocumentId_key" ON "CommerceRecord"("stockDocumentId");

-- CreateIndex
CREATE INDEX "CommerceRecord_plantId_kind_effectiveAt_status_idx" ON "CommerceRecord"("plantId", "kind", "effectiveAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceRecord_rootId_revision_key" ON "CommerceRecord"("rootId", "revision");

-- CreateIndex
CREATE INDEX "CommerceFulfillment_salesOrderId_orderLineKey_idx" ON "CommerceFulfillment"("salesOrderId", "orderLineKey");

-- CreateIndex
CREATE INDEX "CommerceFulfillment_poRootId_poLineKey_idx" ON "CommerceFulfillment"("poRootId", "poLineKey");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceFulfillment_deliveryId_orderLineKey_key" ON "CommerceFulfillment"("deliveryId", "orderLineKey");

-- AddForeignKey
ALTER TABLE "CommerceConfig" ADD CONSTRAINT "CommerceConfig_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceRecord" ADD CONSTRAINT "CommerceRecord_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceRecord" ADD CONSTRAINT "CommerceRecord_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "CommerceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceRecord" ADD CONSTRAINT "CommerceRecord_previousId_fkey" FOREIGN KEY ("previousId") REFERENCES "CommerceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceRecord" ADD CONSTRAINT "CommerceRecord_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CommerceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceRecord" ADD CONSTRAINT "CommerceRecord_poId_fkey" FOREIGN KEY ("poId") REFERENCES "CommerceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceRecord" ADD CONSTRAINT "CommerceRecord_stockDocumentId_fkey" FOREIGN KEY ("stockDocumentId") REFERENCES "StockDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceFulfillment" ADD CONSTRAINT "CommerceFulfillment_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "CommerceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceFulfillment" ADD CONSTRAINT "CommerceFulfillment_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "CommerceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceFulfillment" ADD CONSTRAINT "CommerceFulfillment_poVersionId_fkey" FOREIGN KEY ("poVersionId") REFERENCES "CommerceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommerceRecord" ADD CONSTRAINT "CommerceRecord_kind_check" CHECK ("kind" IN ('QUOTATION','SO','PO','DELIVERY'));
ALTER TABLE "CommerceRecord" ADD CONSTRAINT "CommerceRecord_status_check" CHECK ("status" IN ('DRAFT','SUBMITTED','VERIFIED','APPROVED','DISPATCHED','COMPLETED','REJECTED'));
ALTER TABLE "CommerceFulfillment" ADD CONSTRAINT "CommerceFulfillment_quantity_check" CHECK ("quantity" > 0);

CREATE FUNCTION qf_commerce_config_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Commercial versions are immutable'; END IF;
  IF OLD."verificationStatus" <> 'UNVERIFIED' OR
    (to_jsonb(OLD) - ARRAY['pcBy','pcEvidence','financeBy','financeEvidence','verificationStatus','verifiedBy','verifiedAt','verificationEvidence']) IS DISTINCT FROM
    (to_jsonb(NEW) - ARRAY['pcBy','pcEvidence','financeBy','financeEvidence','verificationStatus','verifiedBy','verifiedAt','verificationEvidence']) THEN
    RAISE EXCEPTION 'Commercial parameter cannot change';
  END IF;
  IF (OLD."pcBy" IS NOT NULL AND (OLD."pcBy",OLD."pcEvidence") IS DISTINCT FROM (NEW."pcBy",NEW."pcEvidence")) OR
     (OLD."financeBy" IS NOT NULL AND (OLD."financeBy",OLD."financeEvidence") IS DISTINCT FROM (NEW."financeBy",NEW."financeEvidence")) THEN
    RAISE EXCEPTION 'Policy sign-off is immutable';
  END IF;
  IF NEW."kind" <> 'EVENT_POLICY' AND (NEW."pcBy" IS NOT NULL OR NEW."financeBy" IS NOT NULL) THEN RAISE EXCEPTION 'Only event policy uses attestations'; END IF;
  IF NEW."pcBy" = NEW."financeBy" OR NEW."financeBy" = NEW."makerId" THEN RAISE EXCEPTION 'Policy signatories must differ'; END IF;
  IF NEW."verificationStatus" = 'VERIFIED' AND (NEW."verifiedBy" IS NULL OR NEW."verifiedBy" = NEW."makerId" OR NEW."verifiedBy" = NEW."pcBy" OR NEW."verifiedBy" = NEW."financeBy" OR NEW."verificationEvidence" IS NULL OR
     (NEW."kind" = 'EVENT_POLICY' AND (NEW."pcBy" IS NULL OR NEW."financeBy" IS NULL))) THEN RAISE EXCEPTION 'Commercial verification lacks independent evidence'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_commerce_config_guard BEFORE UPDATE OR DELETE ON "CommerceConfig" FOR EACH ROW EXECUTE FUNCTION qf_commerce_config_guard();

CREATE FUNCTION qf_commerce_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Commercial sources cannot be deleted'; END IF;
  IF (OLD."id",OLD."number",OLD."requestKey",OLD."kind",OLD."plantId",OLD."rootId",OLD."previousId",OLD."revision",OLD."makerId",OLD."createdAt") IS DISTINCT FROM
     (NEW."id",NEW."number",NEW."requestKey",NEW."kind",NEW."plantId",NEW."rootId",NEW."previousId",NEW."revision",NEW."makerId",NEW."createdAt") OR NEW."version" <> OLD."version" + 1 THEN RAISE EXCEPTION 'Commercial source identity/version is immutable'; END IF;
  IF OLD."status" <> 'DRAFT' AND (OLD."payload",OLD."payloadHash",OLD."effectiveAt",OLD."parentId",OLD."poId") IS DISTINCT FROM (NEW."payload",NEW."payloadHash",NEW."effectiveAt",NEW."parentId",NEW."poId") THEN RAISE EXCEPTION 'Submitted commercial payload is immutable'; END IF;
  IF NOT ((OLD."status" = 'DRAFT' AND NEW."status" IN ('DRAFT','SUBMITTED','REJECTED')) OR
          (OLD."status" = 'SUBMITTED' AND NEW."status" IN ('VERIFIED','APPROVED','REJECTED')) OR
          (OLD."status" = 'VERIFIED' AND NEW."status" IN ('APPROVED','REJECTED')) OR
          (OLD."kind" = 'DELIVERY' AND OLD."status" = 'APPROVED' AND NEW."status" IN ('DISPATCHED','COMPLETED','REJECTED')) OR
          (OLD."kind" = 'DELIVERY' AND OLD."status" = 'DISPATCHED' AND NEW."status" = 'COMPLETED')) THEN RAISE EXCEPTION 'Illegal commercial transition'; END IF;
  IF OLD."status" <> 'DRAFT' AND OLD."snapshot" IS DISTINCT FROM NEW."snapshot" AND
    NOT (OLD."kind" = 'DELIVERY' AND OLD."status" = 'APPROVED' AND NEW."status" IN ('DISPATCHED','COMPLETED') AND
      (OLD."snapshot" - 'policy') IS NOT DISTINCT FROM (NEW."snapshot" - 'policy') AND NEW."snapshot" -> 'policy' IS NOT NULL) THEN RAISE EXCEPTION 'Commercial snapshot is immutable'; END IF;
  IF NEW."status" = 'SUBMITTED' AND (NEW."submitterId" IS DISTINCT FROM NEW."makerId" OR NEW."snapshot" IS NULL) THEN RAISE EXCEPTION 'Submit must preserve maker snapshot'; END IF;
  IF NEW."verifierId" = NEW."makerId" OR NEW."verifierId" = NEW."submitterId" OR NEW."approverId" = NEW."makerId" OR NEW."approverId" = NEW."submitterId" THEN RAISE EXCEPTION 'Commercial maker cannot approve self'; END IF;
  IF NEW."status" IN ('VERIFIED','APPROVED','DISPATCHED','COMPLETED') AND NEW."verifierId" IS NULL THEN RAISE EXCEPTION 'Commercial verifier required'; END IF;
  IF NEW."status" = 'APPROVED' AND (NEW."kind" = 'PO' OR (NEW."snapshot"->>'deviation')::boolean) AND NEW."approverId" IS NULL THEN RAISE EXCEPTION 'Manager approval required'; END IF;
  IF NEW."status" = 'DISPATCHED' AND (NEW."stockDocumentId" IS NULL OR NEW."posterId" IS NULL) THEN RAISE EXCEPTION 'Dispatch ledger required'; END IF;
  IF NEW."status" = 'COMPLETED' AND (NEW."completion" IS NULL OR NEW."completionHash" IS NULL OR NEW."posterId" IS NULL OR
    (NEW."payload"->>'mode' <> 'SERVICE' AND NEW."stockDocumentId" IS NULL)) THEN RAISE EXCEPTION 'Completed delivery requires proof and posting'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_commerce_record_guard BEFORE UPDATE OR DELETE ON "CommerceRecord" FOR EACH ROW EXECUTE FUNCTION qf_commerce_record_guard();

CREATE FUNCTION qf_commerce_fulfillment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Commercial realization is append-only'; END $$;
CREATE TRIGGER qf_commerce_fulfillment_guard BEFORE UPDATE OR DELETE ON "CommerceFulfillment" FOR EACH ROW EXECUTE FUNCTION qf_commerce_fulfillment_guard();
