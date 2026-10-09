-- CreateTable
CREATE TABLE "StageConfig" (
    "id" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "plantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rootId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "subjectId" UUID,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "makerId" UUID NOT NULL,
    "attestedBy" UUID,
    "verifiedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageRecord" (
    "id" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "plantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "configId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "makerId" UUID NOT NULL,
    "verifiedBy" UUID,
    "issuedBy" UUID,
    "cancelRequestedBy" UUID,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDepreciation" (
    "id" UUID NOT NULL,
    "plantId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "configId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(30,6) NOT NULL,
    "bookBefore" DECIMAL(30,6) NOT NULL,
    "bookAfter" DECIMAL(30,6) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "makerId" UUID NOT NULL,
    "verifiedBy" UUID,
    "postedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetDepreciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationEvent" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "plantId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(30,6) NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepreciationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionFinding" (
    "id" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "plantId" UUID NOT NULL,
    "picId" UUID NOT NULL,
    "detail" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "fileIds" UUID[],
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedBy" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "InspectionFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingFollowup" (
    "id" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "findingId" UUID NOT NULL,
    "plantId" UUID NOT NULL,
    "actualAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "fileIds" UUID[],
    "hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "makerId" UUID NOT NULL,
    "verifiedBy" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FindingFollowup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalExam" (
    "id" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "plantId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "examAt" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "workStatus" TEXT NOT NULL,
    "measurements" JSONB NOT NULL,
    "notes" TEXT NOT NULL,
    "fileIds" UUID[],
    "hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "makerId" UUID NOT NULL,
    "verifiedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageFile" (
    "id" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "plantId" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "sourceId" UUID,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StageConfig_requestKey_key" ON "StageConfig"("requestKey");

-- CreateIndex
CREATE INDEX "StageConfig_plantId_kind_status_effectiveFrom_idx" ON "StageConfig"("plantId", "kind", "status", "effectiveFrom");

-- CreateIndex
CREATE INDEX "StageConfig_rootId_idx" ON "StageConfig"("rootId");

-- CreateIndex
CREATE UNIQUE INDEX "StageConfig_plantId_kind_code_revision_key" ON "StageConfig"("plantId", "kind", "code", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "StageRecord_requestKey_key" ON "StageRecord"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "StageRecord_number_key" ON "StageRecord"("number");

-- CreateIndex
CREATE INDEX "StageRecord_plantId_kind_effectiveAt_idx" ON "StageRecord"("plantId", "kind", "effectiveAt");

-- CreateIndex
CREATE INDEX "AssetDepreciation_plantId_month_status_idx" ON "AssetDepreciation"("plantId", "month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AssetDepreciation_assetId_month_key" ON "AssetDepreciation"("assetId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationEvent_sourceId_key" ON "DepreciationEvent"("sourceId");

-- CreateIndex
CREATE INDEX "DepreciationEvent_assetId_effectiveAt_idx" ON "DepreciationEvent"("assetId", "effectiveAt");

-- CreateIndex
CREATE INDEX "InspectionFinding_plantId_status_idx" ON "InspectionFinding"("plantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionFinding_inspectionId_key_key" ON "InspectionFinding"("inspectionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "FindingFollowup_requestKey_key" ON "FindingFollowup"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalExam_requestKey_key" ON "MedicalExam"("requestKey");

-- CreateIndex
CREATE INDEX "MedicalExam_plantId_workerId_examAt_idx" ON "MedicalExam"("plantId", "workerId", "examAt");

-- CreateIndex
CREATE UNIQUE INDEX "StageFile_requestKey_key" ON "StageFile"("requestKey");

-- CreateIndex
CREATE INDEX "StageFile_plantId_domain_sourceId_idx" ON "StageFile"("plantId", "domain", "sourceId");

-- Explicit foreign keys keep stable asset/worker identities and source actors intact.
DO $$ DECLARE t text; c text; BEGIN
  FOREACH t IN ARRAY ARRAY['StageConfig','StageRecord','AssetDepreciation','DepreciationEvent','InspectionFinding','FindingFollowup','MedicalExam','StageFile'] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT',t,t||'_plant_fk');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['StageConfig','StageRecord','AssetDepreciation','FindingFollowup','MedicalExam'] LOOP
    FOREACH c IN ARRAY ARRAY['makerId','verifiedBy'] LOOP
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES "User"("id") ON DELETE RESTRICT',t,t||'_'||c||'_fk',c);
    END LOOP;
  END LOOP;
END $$;
ALTER TABLE "StageConfig" ADD CONSTRAINT stage_root_fk FOREIGN KEY ("rootId") REFERENCES "StageConfig"("id") ON DELETE RESTRICT;
ALTER TABLE "StageConfig" ADD CONSTRAINT stage_subject_fk FOREIGN KEY ("subjectId") REFERENCES "StageConfig"("id") ON DELETE RESTRICT;
ALTER TABLE "StageConfig" ADD CONSTRAINT stage_attest_fk FOREIGN KEY ("attestedBy") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "StageRecord" ADD CONSTRAINT stage_config_fk FOREIGN KEY ("configId") REFERENCES "StageConfig"("id") ON DELETE RESTRICT;
ALTER TABLE "StageRecord" ADD CONSTRAINT stage_issue_fk FOREIGN KEY ("issuedBy") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "StageRecord" ADD CONSTRAINT stage_cancel_fk FOREIGN KEY ("cancelRequestedBy") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "AssetDepreciation" ADD CONSTRAINT dep_asset_fk FOREIGN KEY ("assetId") REFERENCES "StageConfig"("id") ON DELETE RESTRICT;
ALTER TABLE "AssetDepreciation" ADD CONSTRAINT dep_config_fk FOREIGN KEY ("configId") REFERENCES "StageConfig"("id") ON DELETE RESTRICT;
ALTER TABLE "AssetDepreciation" ADD CONSTRAINT dep_post_fk FOREIGN KEY ("postedBy") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "DepreciationEvent" ADD CONSTRAINT dep_source_fk FOREIGN KEY ("sourceId") REFERENCES "AssetDepreciation"("id") ON DELETE RESTRICT;
ALTER TABLE "DepreciationEvent" ADD CONSTRAINT dep_event_actor_fk FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "DepreciationEvent" ADD CONSTRAINT dep_event_asset_fk FOREIGN KEY ("assetId") REFERENCES "StageConfig"("id") ON DELETE RESTRICT;
ALTER TABLE "InspectionFinding" ADD CONSTRAINT finding_inspection_fk FOREIGN KEY ("inspectionId") REFERENCES "StageRecord"("id") ON DELETE RESTRICT;
ALTER TABLE "InspectionFinding" ADD CONSTRAINT finding_pic_fk FOREIGN KEY ("picId") REFERENCES "StageConfig"("id") ON DELETE RESTRICT;
ALTER TABLE "InspectionFinding" ADD CONSTRAINT finding_resolve_fk FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "FindingFollowup" ADD CONSTRAINT followup_finding_fk FOREIGN KEY ("findingId") REFERENCES "InspectionFinding"("id") ON DELETE RESTRICT;
ALTER TABLE "MedicalExam" ADD CONSTRAINT exam_worker_fk FOREIGN KEY ("workerId") REFERENCES "StageConfig"("id") ON DELETE RESTRICT;
ALTER TABLE "StageFile" ADD CONSTRAINT stage_file_owner_fk FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "StageConfig" ADD CONSTRAINT stage_config_checks CHECK ("kind" IN ('LETTER_TYPE','ASSET','ASSET_FINANCE','WORKER','CHECKLIST') AND "status" IN ('DRAFT','VERIFIED') AND "revision">0 AND ("status"<>'VERIFIED' OR "verifiedBy" IS NOT NULL AND "verifiedBy"<>"makerId"));
ALTER TABLE "StageRecord" ADD CONSTRAINT stage_record_checks CHECK ("kind" IN ('LETTER','BUNDLE','INSPECTION') AND "status" IN ('DRAFT','SUBMITTED','VERIFIED','ISSUED','REJECTED','CANCELLED') AND "version">0 AND ("number" IS NULL OR "kind"<>'INSPECTION'));
ALTER TABLE "AssetDepreciation" ADD CONSTRAINT dep_checks CHECK ("amount">0 AND "bookAfter">=0 AND "bookBefore"-"amount"="bookAfter" AND "month" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' AND "status" IN ('DRAFT','SUBMITTED','VERIFIED','POSTED'));
ALTER TABLE "MedicalExam" ADD CONSTRAINT exam_checks CHECK ("kind" IN ('WCU','DCU') AND "status" IN ('DRAFT','SUBMITTED','VERIFIED','REJECTED') AND "workStatus" IN ('FIT','RESTRICTED','UNFIT','PENDING') AND "validUntil">="examAt");
ALTER TABLE "StageFile" ADD CONSTRAINT stage_file_checks CHECK ("domain" IN ('DOCUMENT','ASSET','INSPECTION','MEDICAL') AND "size" BETWEEN 1 AND 4194304 AND octet_length("content")="size" AND "mime" IN ('application/pdf','image/jpeg','image/png','image/webp'));

CREATE FUNCTION qf_stage_config_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Parameter versions cannot be deleted'; END IF;
  IF OLD."status"='VERIFIED' OR (to_jsonb(OLD)-ARRAY['status','verifiedBy','attestedBy']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','verifiedBy','attestedBy']) THEN RAISE EXCEPTION 'Parameter contents are immutable'; END IF;
  IF OLD."attestedBy" IS NOT NULL AND OLD."attestedBy" IS DISTINCT FROM NEW."attestedBy" OR NEW."attestedBy"=NEW."makerId" THEN RAISE EXCEPTION 'Attest must be immutable and independent'; END IF;
  IF NEW."status"='VERIFIED' AND NEW."kind"='ASSET_FINANCE' AND (NEW."attestedBy" IS NULL OR NEW."verifiedBy" IN (NEW."makerId",NEW."attestedBy")) THEN RAISE EXCEPTION 'Finance parameters require separate attest and Manager'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_stage_config_guard BEFORE UPDATE OR DELETE ON "StageConfig" FOR EACH ROW EXECUTE FUNCTION qf_stage_config_guard();

CREATE FUNCTION qf_stage_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE oldj jsonb; newj jsonb; BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Sources cannot be deleted'; END IF;
  IF NEW."version"<>OLD."version"+1 OR (NEW."id",NEW."requestKey",NEW."plantId",NEW."makerId") IS DISTINCT FROM (OLD."id",OLD."requestKey",OLD."plantId",OLD."makerId") THEN RAISE EXCEPTION 'Source identity/version immutable'; END IF;
  oldj:=to_jsonb(OLD); newj:=to_jsonb(NEW);
  IF TG_TABLE_NAME='StageRecord' THEN
    IF OLD."kind"<>NEW."kind" OR OLD."number" IS NOT NULL AND OLD."number" IS DISTINCT FROM NEW."number" THEN RAISE EXCEPTION 'Issued number/kind immutable'; END IF;
    IF OLD."status"<>'DRAFT' AND (OLD."payload",OLD."hash",OLD."configId",OLD."effectiveAt") IS DISTINCT FROM (NEW."payload",NEW."hash",NEW."configId",NEW."effectiveAt") THEN RAISE EXCEPTION 'Submitted contents immutable'; END IF;
    IF OLD."status" NOT IN ('DRAFT','SUBMITTED') AND OLD."snapshot" IS DISTINCT FROM NEW."snapshot" THEN RAISE EXCEPTION 'Approved snapshot immutable'; END IF;
    IF NEW."status"='ISSUED' AND (NEW."number" IS NULL OR NEW."issuedBy" IS NULL OR NEW."kind"='INSPECTION') THEN RAISE EXCEPTION 'Issue requires number and actor'; END IF;
    IF NEW."status"='VERIFIED' AND (NEW."verifiedBy" IS NULL OR NEW."verifiedBy"=NEW."makerId") THEN RAISE EXCEPTION 'Verifier must be independent'; END IF;
    IF NOT ((OLD."status"='DRAFT' AND NEW."status" IN ('DRAFT','SUBMITTED','ISSUED')) OR (OLD."status"='SUBMITTED' AND NEW."status" IN ('VERIFIED','REJECTED','ISSUED')) OR (OLD."status"='VERIFIED' AND NEW."status"='ISSUED') OR (OLD."status"='ISSUED' AND NEW."status" IN ('ISSUED','CANCELLED'))) THEN RAISE EXCEPTION 'Illegal document transition'; END IF;
    IF NEW."status"='CANCELLED' AND OLD."cancelRequestedBy" IS NULL THEN RAISE EXCEPTION 'Cancellation requires request'; END IF;
  ELSE
    IF OLD."status"<>'DRAFT' AND (oldj-ARRAY['status','version','verifiedBy']) IS DISTINCT FROM (newj-ARRAY['status','version','verifiedBy']) THEN RAISE EXCEPTION 'Submitted medical contents immutable'; END IF;
    IF (OLD."kind",OLD."workerId") IS DISTINCT FROM (NEW."kind",NEW."workerId") OR NOT ((OLD."status"='DRAFT' AND NEW."status" IN ('DRAFT','SUBMITTED')) OR (OLD."status"='SUBMITTED' AND NEW."status" IN ('VERIFIED','REJECTED'))) THEN RAISE EXCEPTION 'Illegal examination transition'; END IF;
    IF NEW."status"='VERIFIED' AND (NEW."verifiedBy" IS NULL OR NEW."verifiedBy"=NEW."makerId") THEN RAISE EXCEPTION 'Medical checker must differ'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_stage_record_guard BEFORE UPDATE OR DELETE ON "StageRecord" FOR EACH ROW EXECUTE FUNCTION qf_stage_source_guard();
CREATE TRIGGER qf_stage_exam_guard BEFORE UPDATE OR DELETE ON "MedicalExam" FOR EACH ROW EXECUTE FUNCTION qf_stage_source_guard();

CREATE FUNCTION qf_stage_dep_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parameter_maker uuid; BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(OLD)-ARRAY['status','version','verifiedBy','postedBy']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','version','verifiedBy','postedBy']) OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'Depreciation snapshot immutable'; END IF;
  IF NOT ((OLD."status"='DRAFT' AND NEW."status"='SUBMITTED') OR (OLD."status"='SUBMITTED' AND NEW."status"='VERIFIED') OR (OLD."status"='VERIFIED' AND NEW."status"='POSTED')) THEN RAISE EXCEPTION 'Illegal depreciation transition'; END IF;
  SELECT "makerId" INTO parameter_maker FROM "StageConfig" WHERE "id"=NEW."configId";
  IF NEW."status" IN ('VERIFIED','POSTED') AND (NEW."verifiedBy" IS NULL OR NEW."verifiedBy" IN (NEW."makerId",parameter_maker)) THEN RAISE EXCEPTION 'Depreciation needs independent Finance'; END IF;
  IF NEW."status"='POSTED' AND (NEW."postedBy" IS NULL OR NOT EXISTS (SELECT 1 FROM "DepreciationEvent" e WHERE e."sourceId"=NEW."id" AND e."amount"=NEW."amount" AND e."assetId"=NEW."assetId" AND e."plantId"=NEW."plantId")) THEN RAISE EXCEPTION 'Posting event required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_stage_dep_guard BEFORE UPDATE OR DELETE ON "AssetDepreciation" FOR EACH ROW EXECUTE FUNCTION qf_stage_dep_guard();
CREATE FUNCTION qf_stage_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Depreciation ledger append-only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "AssetDepreciation" d WHERE d."id"=NEW."sourceId" AND d."status"='VERIFIED' AND d."amount"=NEW."amount" AND d."assetId"=NEW."assetId" AND d."plantId"=NEW."plantId") THEN RAISE EXCEPTION 'Event requires exact verified source'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_stage_event_guard BEFORE INSERT OR UPDATE OR DELETE ON "DepreciationEvent" FOR EACH ROW EXECUTE FUNCTION qf_stage_event_guard();
CREATE FUNCTION qf_stage_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(OLD)-'sourceId') IS DISTINCT FROM (to_jsonb(NEW)-'sourceId') OR OLD."sourceId" IS NOT NULL THEN RAISE EXCEPTION 'Evidence contents/source immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_stage_file_guard BEFORE UPDATE OR DELETE ON "StageFile" FOR EACH ROW EXECUTE FUNCTION qf_stage_file_guard();
CREATE FUNCTION qf_stage_finding_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Findings/history cannot be deleted'; END IF;
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM "StageRecord" WHERE "id"=NEW."inspectionId" AND "plantId"=NEW."plantId" AND "kind"='INSPECTION' AND "status"='SUBMITTED') THEN RAISE EXCEPTION 'Finding needs submitted inspection'; END IF;
  ELSIF OLD."status"<>'OPEN' OR NEW."status"<>'RESOLVED' OR NEW."resolvedBy" IS NULL OR NEW."version"<>OLD."version"+1 OR (to_jsonb(OLD)-ARRAY['status','resolvedBy','version']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','resolvedBy','version']) THEN RAISE EXCEPTION 'Finding contents immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_stage_finding_guard BEFORE INSERT OR UPDATE OR DELETE ON "InspectionFinding" FOR EACH ROW EXECUTE FUNCTION qf_stage_finding_guard();
CREATE FUNCTION qf_stage_followup_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' OR OLD."status"<>'SUBMITTED' OR NEW."status" NOT IN ('VERIFIED','REJECTED') OR NEW."verifiedBy" IS NULL OR NEW."verifiedBy"=NEW."makerId" OR NEW."version"<>OLD."version"+1 OR (to_jsonb(OLD)-ARRAY['status','verifiedBy','version']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','verifiedBy','version']) THEN RAISE EXCEPTION 'Follow-up history immutable / checker independent'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_stage_followup_guard BEFORE UPDATE OR DELETE ON "FindingFollowup" FOR EACH ROW EXECUTE FUNCTION qf_stage_followup_guard();

CREATE FUNCTION qf_stage_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_TABLE_NAME='DepreciationEvent' THEN
    IF NOT EXISTS (SELECT 1 FROM "AssetDepreciation" WHERE "id"=NEW."sourceId" AND "status"='POSTED') THEN RAISE EXCEPTION 'Event must commit with posted source'; END IF;
  ELSIF NEW."status"='RESOLVED' THEN
    IF NOT EXISTS (SELECT 1 FROM "FindingFollowup" WHERE "findingId"=NEW."id" AND "status"='VERIFIED' AND "verifiedBy"=NEW."resolvedBy") THEN RAISE EXCEPTION 'Finding needs verified follow-up'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER qf_stage_event_commit AFTER INSERT ON "DepreciationEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION qf_stage_commit_guard();
CREATE CONSTRAINT TRIGGER qf_stage_finding_commit AFTER UPDATE ON "InspectionFinding" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION qf_stage_commit_guard();
CREATE FUNCTION qf_stage_number_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF OLD."documentType" LIKE 'STAGE:%' AND (TG_OP='DELETE' OR NEW."documentType"<>OLD."documentType" OR NEW."period"<>OLD."period" OR NEW."lastNumber"<=OLD."lastNumber") THEN RAISE EXCEPTION 'Issued sequence cannot be reused'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_stage_number_guard BEFORE UPDATE OR DELETE ON "NumberSequence" FOR EACH ROW EXECUTE FUNCTION qf_stage_number_guard();

CREATE TABLE "DepreciationCorrection" (
  "id" UUID PRIMARY KEY, "requestKey" UUID NOT NULL UNIQUE, "plantId" UUID NOT NULL REFERENCES "Plant"("id"),
  "assetId" UUID NOT NULL REFERENCES "StageConfig"("id"), "targetId" UUID NOT NULL REFERENCES "AssetDepreciation"("id"),
  "effectiveAt" TIMESTAMP(3) NOT NULL, "amount" DECIMAL(30,6) NOT NULL CHECK ("amount"<>0), "reason" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL, "hash" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','SUBMITTED','POSTED','REJECTED')),
  "version" INTEGER NOT NULL DEFAULT 1, "makerId" UUID NOT NULL REFERENCES "User"("id"), "approvedBy" UUID REFERENCES "User"("id"), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DepreciationCorrection_plantId_effectiveAt_status_idx" ON "DepreciationCorrection"("plantId","effectiveAt","status");
CREATE INDEX "DepreciationCorrection_targetId_idx" ON "DepreciationCorrection"("targetId");
CREATE UNIQUE INDEX qf_dep_correction_once ON "DepreciationCorrection"("targetId") WHERE "status"='POSTED';
ALTER TABLE "DepreciationEvent" ALTER COLUMN "sourceId" DROP NOT NULL;
ALTER TABLE "DepreciationEvent" ADD COLUMN "correctionId" UUID REFERENCES "DepreciationCorrection"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "DepreciationEvent_correctionId_key" ON "DepreciationEvent"("correctionId");
ALTER TABLE "DepreciationEvent" ADD CONSTRAINT dep_event_source CHECK (("sourceId" IS NULL)<>("correctionId" IS NULL) AND ("correctionId" IS NOT NULL OR "amount">0));
CREATE OR REPLACE FUNCTION qf_stage_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Depreciation ledger append-only'; END IF;
  IF NEW."correctionId" IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM "AssetDepreciation" d WHERE d."id"=NEW."sourceId" AND d."status"='VERIFIED' AND d."amount"=NEW."amount" AND d."assetId"=NEW."assetId" AND d."plantId"=NEW."plantId") THEN RAISE EXCEPTION 'Event requires exact verified source'; END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM "DepreciationCorrection" c WHERE c."id"=NEW."correctionId" AND c."status"='SUBMITTED' AND c."amount"=NEW."amount" AND c."assetId"=NEW."assetId" AND c."plantId"=NEW."plantId" AND c."effectiveAt"=NEW."effectiveAt") THEN RAISE EXCEPTION 'Adjustment requires exact submitted request'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION qf_stage_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_TABLE_NAME='DepreciationEvent' THEN
    IF NEW."correctionId" IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM "AssetDepreciation" WHERE "id"=NEW."sourceId" AND "status"='POSTED') THEN RAISE EXCEPTION 'Event must commit with posted source'; END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM "DepreciationCorrection" WHERE "id"=NEW."correctionId" AND "status"='POSTED') THEN RAISE EXCEPTION 'Adjustment must commit with approved request'; END IF;
  ELSIF NEW."status"='RESOLVED' AND NOT EXISTS (SELECT 1 FROM "FindingFollowup" WHERE "findingId"=NEW."id" AND "status"='VERIFIED' AND "verifiedBy"=NEW."resolvedBy") THEN RAISE EXCEPTION 'Finding needs verified follow-up'; END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION qf_stage_correction_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE source "AssetDepreciation"; BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(OLD)-ARRAY['status','version','approvedBy']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','version','approvedBy']) OR NEW."version"<>OLD."version"+1 OR NOT ((OLD."status"='DRAFT' AND NEW."status" IN ('SUBMITTED','REJECTED')) OR (OLD."status"='SUBMITTED' AND NEW."status" IN ('POSTED','REJECTED'))) THEN RAISE EXCEPTION 'Correction contents/transition immutable'; END IF;
  SELECT * INTO source FROM "AssetDepreciation" WHERE "id"=NEW."targetId";
  IF NEW."status"='POSTED' AND (NEW."approvedBy" IS NULL OR NEW."approvedBy" IN (NEW."makerId",source."makerId",source."verifiedBy",source."postedBy") OR NOT EXISTS (SELECT 1 FROM "DepreciationEvent" WHERE "correctionId"=NEW."id" AND "amount"=NEW."amount" AND "actorId"=NEW."approvedBy")) THEN RAISE EXCEPTION 'Correction requires independent approval and exact signed event'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qf_stage_correction_guard BEFORE UPDATE OR DELETE ON "DepreciationCorrection" FOR EACH ROW EXECUTE FUNCTION qf_stage_correction_guard();
