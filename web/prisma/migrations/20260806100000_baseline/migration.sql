-- Baseline schema for ContentWrite (Prisma schema.prisma as of 2026-08-06, WP1).
-- Fresh database: applied by `prisma migrate deploy`.
-- Brownfield database (already provisioned via db push / manual SQL):
--   Do NOT run this SQL. Mark applied instead:
--   npx prisma migrate resolve --applied 20260806100000_baseline

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'RUNNING', 'PUBLISH_READY', 'APPROVED', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkflowStep" AS ENUM ('RESEARCH', 'INSIGHT', 'WRITE', 'FINALIZE');

-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM ('IDEA', 'MEMORY_CHECKED', 'RESEARCHED', 'SYNTHESIZED', 'INSIGHT_APPROVED', 'DECIDED', 'PLANNED', 'DRAFTED', 'EDITORIAL_REVIEWED', 'FACT_CHECKED', 'FINAL_REVIEWED', 'POLISHED', 'READER_SIMULATED', 'PUBLISH_READY', 'APPROVED', 'PUBLISHED', 'RESEARCH_REQUIRED', 'INSIGHT_REJECTED', 'MINOR_REVISION_REQUIRED', 'MAJOR_REVISION_REQUIRED', 'REWRITE_REQUIRED', 'FACT_CHECK_FAILED', 'READER_SIMULATION_FAILED', 'CORRECTION_REQUIRED', 'CORRECTED', 'RETRACTED');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('MEMORY_CHECK', 'RESEARCH_BRIEF', 'ARTICLE_DRAFT', 'REVIEW', 'FACT_CHECK', 'KNOWLEDGE_RECORD', 'PUBLISH_PACKAGE', 'READER_SIMULATION', 'CORRECTION');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EDITOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dailyArticleLimit" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "domain" TEXT NOT NULL DEFAULT 'engineering',
    "topic" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "publishFormat" TEXT NOT NULL DEFAULT 'blog',
    "articleShapeId" TEXT,
    "articleShapeVersion" TEXT,
    "articleShapeSnapshot" TEXT,
    "openingPattern" TEXT,
    "narrativePattern" TEXT,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStep" "WorkflowStep",
    "workflowState" "WorkflowState" NOT NULL DEFAULT 'IDEA',
    "workflowRunId" TEXT NOT NULL,
    "workflowVersion" INTEGER NOT NULL DEFAULT 0,
    "contentVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "errorMessage" TEXT,
    "researchBrief" TEXT,
    "insightGate" TEXT,
    "draft12" TEXT,
    "factCheck" TEXT,
    "knowledgeRecord" TEXT,
    "cleanPublish" TEXT,
    "heroBrief" TEXT,
    "heroImageUrl" TEXT,
    "heroImageModel" TEXT,
    "heroImageAlt" TEXT,
    "heroPromptUsed" TEXT,
    "galleryJson" TEXT,
    "deskJson" TEXT,
    "reviewerNotes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "targetWordCount" INTEGER,
    "avoidFormats" TEXT,
    "seriesId" TEXT,
    "seriesOrder" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowArtifact" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "WorkflowArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTransition" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "workflowRunId" TEXT NOT NULL,
    "fromState" "WorkflowState" NOT NULL,
    "toState" "WorkflowState" NOT NULL,
    "action" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "actorId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "domain" TEXT NOT NULL DEFAULT 'engineering',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Digest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "weekLabel" TEXT NOT NULL,
    "domain" TEXT,
    "body" TEXT NOT NULL,
    "sourceJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Digest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeRecord" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "category" TEXT,
    "keywords" TEXT,
    "coreMessage" TEXT,
    "editorialScore" INTEGER,
    "evergreen" INTEGER,
    "currentVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "retractionStatus" TEXT NOT NULL DEFAULT 'none',
    "correctionHistory" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "nextFreshnessReviewAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoWriteConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleMode" TEXT NOT NULL DEFAULT 'daily',
    "intervalHours" INTEGER NOT NULL DEFAULT 24,
    "preferredHour" INTEGER NOT NULL DEFAULT 9,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "domain" TEXT NOT NULL DEFAULT 'engineering',
    "useSeedTopics" BOOLEAN NOT NULL DEFAULT true,
    "customTopics" TEXT,
    "seedTopicsEngineering" TEXT,
    "seedTopicsSoftSkills" TEXT,
    "maxPendingReview" INTEGER NOT NULL DEFAULT 3,
    "defaultTargetWordCount" INTEGER NOT NULL DEFAULT 1200,
    "defaultAvoidFormats" TEXT DEFAULT 'table',
    "ownerUserId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastArticleId" TEXT,
    "lastDomain" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoWriteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TfesDocument" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TfesDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleShapeProfile" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "labelVi" TEXT NOT NULL,
    "fit" TEXT NOT NULL,
    "definitionJson" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "cooldownArticles" INTEGER NOT NULL DEFAULT 4,
    "compatibleFormats" TEXT NOT NULL DEFAULT 'blog',
    "domains" TEXT NOT NULL DEFAULT '*',
    "insightKinds" TEXT NOT NULL DEFAULT '*',
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleShapeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Article_createdById_createdAt_idx" ON "Article"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "Article_seriesId_idx" ON "Article"("seriesId");

-- CreateIndex
CREATE INDEX "Article_publishFormat_idx" ON "Article"("publishFormat");

-- CreateIndex
CREATE INDEX "Article_status_publishFormat_idx" ON "Article"("status", "publishFormat");

-- CreateIndex
CREATE INDEX "Article_workflowState_updatedAt_idx" ON "Article"("workflowState", "updatedAt");

-- CreateIndex
CREATE INDEX "WorkflowArtifact_articleId_type_createdAt_idx" ON "WorkflowArtifact"("articleId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowArtifact_articleId_workflowRunId_type_revision_key" ON "WorkflowArtifact"("articleId", "workflowRunId", "type", "revision");

-- CreateIndex
CREATE INDEX "WorkflowTransition_articleId_createdAt_idx" ON "WorkflowTransition"("articleId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowTransition_workflowRunId_createdAt_idx" ON "WorkflowTransition"("workflowRunId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Series_slug_key" ON "Series"("slug");

-- CreateIndex
CREATE INDEX "Series_createdById_idx" ON "Series"("createdById");

-- CreateIndex
CREATE INDEX "Digest_weekLabel_idx" ON "Digest"("weekLabel");

-- CreateIndex
CREATE INDEX "Digest_status_idx" ON "Digest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeRecord_articleId_key" ON "KnowledgeRecord"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "TfesDocument_path_key" ON "TfesDocument"("path");

-- CreateIndex
CREATE INDEX "ArticleShapeProfile_active_updatedAt_idx" ON "ArticleShapeProfile"("active", "updatedAt");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowArtifact" ADD CONSTRAINT "WorkflowArtifact_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Series" ADD CONSTRAINT "Series_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoWriteConfig" ADD CONSTRAINT "AutoWriteConfig_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
