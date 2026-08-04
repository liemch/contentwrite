-- AI-TFES v1.6 canonical workflow + immutable audit history.
-- Safe to run once on databases that predate the Prisma schema update.

CREATE TYPE "WorkflowState" AS ENUM (
  'IDEA','MEMORY_CHECKED','RESEARCHED','SYNTHESIZED','INSIGHT_APPROVED','DECIDED',
  'PLANNED','DRAFTED','EDITORIAL_REVIEWED','FACT_CHECKED','FINAL_REVIEWED','POLISHED',
  'READER_SIMULATED','PUBLISH_READY','APPROVED','PUBLISHED','RESEARCH_REQUIRED',
  'INSIGHT_REJECTED','MINOR_REVISION_REQUIRED','MAJOR_REVISION_REQUIRED','REWRITE_REQUIRED',
  'FACT_CHECK_FAILED','READER_SIMULATION_FAILED','CORRECTION_REQUIRED','CORRECTED','RETRACTED'
);

CREATE TYPE "ArtifactType" AS ENUM (
  'MEMORY_CHECK','RESEARCH_BRIEF','ARTICLE_DRAFT','REVIEW','FACT_CHECK',
  'KNOWLEDGE_RECORD','PUBLISH_PACKAGE','READER_SIMULATION','CORRECTION'
);

ALTER TABLE "Article"
  ADD COLUMN "workflowState" "WorkflowState" NOT NULL DEFAULT 'IDEA',
  ADD COLUMN "workflowRunId" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  ADD COLUMN "approvedById" TEXT;

ALTER TABLE "Article"
  ADD CONSTRAINT "Article_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WorkflowArtifact" (
  "id" TEXT PRIMARY KEY,
  "articleId" TEXT NOT NULL,
  "workflowRunId" TEXT NOT NULL,
  "type" "ArtifactType" NOT NULL,
  "revision" INTEGER NOT NULL,
  "sourceRevision" INTEGER,
  "sourceArtifactType" "ArtifactType",
  "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
  "operatingPromptVersion" TEXT NOT NULL DEFAULT '1.6',
  "domainProfileVersion" TEXT,
  "state" "WorkflowState" NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowArtifact_articleId_fkey" FOREIGN KEY ("articleId")
    REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkflowArtifact_articleId_workflowRunId_type_revision_key"
    UNIQUE ("articleId", "workflowRunId", "type", "revision")
);

CREATE TABLE "WorkflowTransition" (
  "id" TEXT PRIMARY KEY,
  "articleId" TEXT NOT NULL,
  "workflowRunId" TEXT NOT NULL,
  "fromState" "WorkflowState" NOT NULL,
  "toState" "WorkflowState" NOT NULL,
  "action" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "actorId" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowTransition_articleId_fkey" FOREIGN KEY ("articleId")
    REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Article_workflowState_updatedAt_idx" ON "Article"("workflowState", "updatedAt");
CREATE INDEX "WorkflowArtifact_articleId_type_createdAt_idx" ON "WorkflowArtifact"("articleId", "type", "createdAt");
CREATE INDEX "WorkflowTransition_articleId_createdAt_idx" ON "WorkflowTransition"("articleId", "createdAt");
CREATE INDEX "WorkflowTransition_workflowRunId_createdAt_idx" ON "WorkflowTransition"("workflowRunId", "createdAt");
