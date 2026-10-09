-- CreateTable
CREATE TABLE "FinancialConfig" (
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
    "financeBy" UUID,
    "financeEvidence" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedBy" UUID,
    "verificationEvidence" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialRecord" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "requestKey" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "plantId" UUID NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "customerCode" TEXT,
    "projectCode" TEXT,
    "currency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "payload" JSONB NOT NULL,
    "snapshot" JSONB,
    "dueDate" TEXT,
    "makerId" UUID NOT NULL,
    "submitterId" UUID,
    "verifierId" UUID,
    "posterId" UUID,
    "decisionEvidence" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "targetId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialInvoiceLine" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "sourceKey" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "unitPrice" DECIMAL(24,2) NOT NULL,
    "amount" DECIMAL(24,2) NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,

    CONSTRAINT "FinancialInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEvent" (
    "id" UUID NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "eventKey" TEXT NOT NULL,
    "recordId" UUID NOT NULL,
    "invoiceId" UUID,
    "receiptId" UUID,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(24,2) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "actorId" UUID NOT NULL,
    "reversalOfId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialConfig_requestKey_key" ON "FinancialConfig"("requestKey");

-- CreateIndex
CREATE INDEX "FinancialConfig_plantId_kind_verificationStatus_idx" ON "FinancialConfig"("plantId", "kind", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialConfig_plantId_kind_code_revision_key" ON "FinancialConfig"("plantId", "kind", "code", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialRecord_number_key" ON "FinancialRecord"("number");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialRecord_requestKey_key" ON "FinancialRecord"("requestKey");

-- CreateIndex
CREATE INDEX "FinancialRecord_plantId_kind_effectiveAt_status_idx" ON "FinancialRecord"("plantId", "kind", "effectiveAt", "status");

-- CreateIndex
CREATE INDEX "FinancialRecord_customerCode_currency_idx" ON "FinancialRecord"("customerCode", "currency");

-- CreateIndex
CREATE INDEX "FinancialInvoiceLine_deliveryId_sourceKey_idx" ON "FinancialInvoiceLine"("deliveryId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialInvoiceLine_invoiceId_deliveryId_sourceKey_role_key" ON "FinancialInvoiceLine"("invoiceId", "deliveryId", "sourceKey", "role");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEvent_sequence_key" ON "FinancialEvent"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEvent_eventKey_key" ON "FinancialEvent"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEvent_reversalOfId_key" ON "FinancialEvent"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinancialEvent_invoiceId_effectiveAt_idx" ON "FinancialEvent"("invoiceId", "effectiveAt");

-- CreateIndex
CREATE INDEX "FinancialEvent_receiptId_effectiveAt_idx" ON "FinancialEvent"("receiptId", "effectiveAt");

-- AddForeignKey
ALTER TABLE "FinancialConfig" ADD CONSTRAINT "FinancialConfig_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "FinancialRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialInvoiceLine" ADD CONSTRAINT "FinancialInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinancialRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialInvoiceLine" ADD CONSTRAINT "FinancialInvoiceLine_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "CommerceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "FinancialRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinancialRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "FinancialRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinancialEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancialConfig" ADD CONSTRAINT "FinancialConfig_kind_check" CHECK ("kind" IN ('ACCOUNT','TAX','TERM'));
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_kind_check" CHECK ("kind" IN ('INVOICE','RECEIPT','ALLOCATION','PPH','CORRECTION'));
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_status_check" CHECK ("status" IN ('DRAFT','SUBMITTED','ISSUED','POSTED','VERIFIED','REJECTED','CANCELLED','REVERSED'));
ALTER TABLE "FinancialInvoiceLine" ADD CONSTRAINT "FinancialInvoiceLine_values_check" CHECK ("role" IN ('ITEM','FREIGHT') AND "quantity" > 0 AND "unitPrice" >= 0 AND "amount" >= 0);
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_values_check" CHECK ("kind" IN ('INVOICE','RECEIPT','ALLOCATION','PPH') AND "amount" <> 0 AND ("reversalOfId" IS NOT NULL OR "amount" > 0));
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_links_check" CHECK (
  ("kind" = 'INVOICE' AND "invoiceId" IS NOT NULL AND "receiptId" IS NULL) OR
  ("kind" = 'RECEIPT' AND "invoiceId" IS NULL AND "receiptId" IS NOT NULL) OR
  ("kind" = 'ALLOCATION' AND "invoiceId" IS NOT NULL AND "receiptId" IS NOT NULL) OR
  ("kind" = 'PPH' AND "invoiceId" IS NOT NULL AND "receiptId" IS NULL));

CREATE FUNCTION qf_financial_config_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Financial versions are immutable'; END IF;
  IF OLD."verificationStatus" <> 'UNVERIFIED' OR
    (to_jsonb(OLD) - ARRAY['financeBy','financeEvidence','verificationStatus','verifiedBy','verifiedAt','verificationEvidence']) IS DISTINCT FROM
    (to_jsonb(NEW) - ARRAY['financeBy','financeEvidence','verificationStatus','verifiedBy','verifiedAt','verificationEvidence']) THEN RAISE EXCEPTION 'Financial parameter cannot change'; END IF;
  IF OLD."financeBy" IS NOT NULL AND (OLD."financeBy",OLD."financeEvidence") IS DISTINCT FROM (NEW."financeBy",NEW."financeEvidence") THEN RAISE EXCEPTION 'Financial attest is immutable'; END IF;
  IF NEW."financeBy" = NEW."makerId" THEN RAISE EXCEPTION 'Finance attest must differ from maker'; END IF;
  IF NEW."verificationStatus" = 'VERIFIED' AND (NEW."financeBy" IS NULL OR NEW."financeEvidence" IS NULL OR NEW."verifiedBy" IS NULL OR NEW."verifiedBy" = NEW."makerId" OR NEW."verifiedBy" = NEW."financeBy" OR NEW."verificationEvidence" IS NULL) THEN RAISE EXCEPTION 'Financial version requires independent sign-offs'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_financial_config_guard BEFORE UPDATE OR DELETE ON "FinancialConfig" FOR EACH ROW EXECUTE FUNCTION qf_financial_config_guard();

CREATE FUNCTION qf_financial_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Financial sources cannot be deleted'; END IF;
  IF (OLD."id",OLD."number",OLD."requestKey",OLD."kind",OLD."plantId",OLD."makerId",OLD."createdAt") IS DISTINCT FROM
     (NEW."id",NEW."number",NEW."requestKey",NEW."kind",NEW."plantId",NEW."makerId",NEW."createdAt") OR NEW."version" <> OLD."version" + 1 THEN RAISE EXCEPTION 'Financial identity/version is immutable'; END IF;
  IF OLD."status" <> 'DRAFT' AND (OLD."payload",OLD."payloadHash",OLD."effectiveAt",OLD."targetId") IS DISTINCT FROM (NEW."payload",NEW."payloadHash",NEW."effectiveAt",NEW."targetId") THEN RAISE EXCEPTION 'Submitted financial source is immutable'; END IF;
  IF OLD."status" NOT IN ('DRAFT','SUBMITTED') AND
    (OLD."snapshot",OLD."customerCode",OLD."projectCode",OLD."currency",OLD."dueDate",OLD."posterId",OLD."verifierId",OLD."decisionEvidence") IS DISTINCT FROM
    (NEW."snapshot",NEW."customerCode",NEW."projectCode",NEW."currency",NEW."dueDate",NEW."posterId",NEW."verifierId",NEW."decisionEvidence") THEN RAISE EXCEPTION 'Final financial snapshot is immutable'; END IF;
  IF NOT ((OLD."status" = 'DRAFT' AND NEW."status" = 'DRAFT') OR
    (OLD."status" = 'DRAFT' AND NEW."status" = 'SUBMITTED' AND NEW."kind" IN ('PPH','CORRECTION')) OR
    (OLD."status" = 'DRAFT' AND NEW."status" = 'ISSUED' AND NEW."kind" = 'INVOICE') OR
    (OLD."status" = 'DRAFT' AND NEW."status" = 'POSTED' AND NEW."kind" IN ('RECEIPT','ALLOCATION')) OR
    (OLD."status" = 'SUBMITTED' AND NEW."status" = 'VERIFIED' AND NEW."kind" = 'PPH') OR
    (OLD."status" = 'SUBMITTED' AND NEW."status" = 'POSTED' AND NEW."kind" = 'CORRECTION') OR
    (OLD."status" = 'SUBMITTED' AND NEW."status" = 'REJECTED') OR
    (OLD."status" = 'ISSUED' AND NEW."status" = 'CANCELLED' AND NEW."kind" = 'INVOICE') OR
    (OLD."status" IN ('POSTED','VERIFIED') AND NEW."status" = 'REVERSED' AND NEW."kind" IN ('RECEIPT','ALLOCATION','PPH'))) THEN RAISE EXCEPTION 'Illegal financial transition'; END IF;
  IF NEW."status" = 'SUBMITTED' AND NEW."submitterId" IS DISTINCT FROM NEW."makerId" THEN RAISE EXCEPTION 'Submit preserves maker'; END IF;
  IF NEW."verifierId" = NEW."makerId" OR NEW."verifierId" = NEW."submitterId" THEN RAISE EXCEPTION 'Financial checker cannot approve self'; END IF;
  IF NEW."status" = 'VERIFIED' AND NEW."verifierId" IS NULL OR NEW."status" IN ('ISSUED','POSTED') AND NEW."posterId" IS NULL THEN RAISE EXCEPTION 'Financial posting actor required'; END IF;
  IF NEW."kind" = 'CORRECTION' AND NEW."status" = 'POSTED' AND (NEW."posterId" = NEW."makerId" OR NEW."posterId" = NEW."submitterId") THEN RAISE EXCEPTION 'Correction needs independent approver'; END IF;
  IF NEW."status" IN ('ISSUED','POSTED','VERIFIED') AND NOT EXISTS (SELECT 1 FROM "FinancialEvent" e WHERE e."recordId" = NEW."id") THEN RAISE EXCEPTION 'Financial posting event required'; END IF;
  IF NEW."status" IN ('CANCELLED','REVERSED') AND NOT EXISTS (SELECT 1 FROM "FinancialEvent" e JOIN "FinancialEvent" r ON r."reversalOfId" = e."id" WHERE e."recordId" = OLD."id") THEN RAISE EXCEPTION 'Correction event required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_financial_record_guard BEFORE UPDATE OR DELETE ON "FinancialRecord" FOR EACH ROW EXECUTE FUNCTION qf_financial_record_guard();

CREATE FUNCTION qf_financial_append_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original "FinancialEvent"; source "FinancialRecord";
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Financial ledger and invoice lines are append-only'; END IF;
  IF TG_TABLE_NAME = 'FinancialInvoiceLine' THEN
    IF NOT EXISTS (SELECT 1 FROM "FinancialRecord" WHERE "id" = NEW."invoiceId" AND "kind" = 'INVOICE' AND "status" = 'DRAFT') THEN RAISE EXCEPTION 'Invoice line requires draft invoice'; END IF;
  ELSE
    SELECT * INTO source FROM "FinancialRecord" WHERE "id" = NEW."recordId";
    IF source."status" NOT IN ('DRAFT','SUBMITTED') THEN RAISE EXCEPTION 'Event requires pending source'; END IF;
    IF NEW."reversalOfId" IS NOT NULL THEN
      SELECT * INTO original FROM "FinancialEvent" WHERE "id" = NEW."reversalOfId";
      IF source."kind" <> 'CORRECTION' OR source."targetId" IS DISTINCT FROM original."recordId" OR
        (NEW."kind",NEW."invoiceId",NEW."receiptId",NEW."amount") IS DISTINCT FROM (original."kind",original."invoiceId",original."receiptId",-original."amount") OR NEW."effectiveAt" < original."effectiveAt" THEN RAISE EXCEPTION 'Correction must reverse exact original event'; END IF;
    ELSIF source."kind" <> NEW."kind" THEN RAISE EXCEPTION 'Financial source kind mismatch'; END IF;
    IF NEW."invoiceId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FinancialRecord" WHERE "id" = NEW."invoiceId" AND "kind" = 'INVOICE' AND "plantId" = source."plantId") OR
       NEW."receiptId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FinancialRecord" WHERE "id" = NEW."receiptId" AND "kind" = 'RECEIPT' AND "plantId" = source."plantId") THEN RAISE EXCEPTION 'Event reference kind/plant mismatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_financial_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "FinancialInvoiceLine" FOR EACH ROW EXECUTE FUNCTION qf_financial_append_guard();
CREATE TRIGGER qf_financial_event_guard BEFORE INSERT OR UPDATE OR DELETE ON "FinancialEvent" FOR EACH ROW EXECUTE FUNCTION qf_financial_append_guard();
