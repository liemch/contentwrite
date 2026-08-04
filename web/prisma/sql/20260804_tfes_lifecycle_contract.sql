-- AI-TFES v1.6 lifecycle metadata; additive and safe for an existing database.
ALTER TABLE "Article"
ADD COLUMN IF NOT EXISTS "contentVersion" TEXT NOT NULL DEFAULT '1.0.0';

ALTER TABLE "KnowledgeRecord"
ADD COLUMN IF NOT EXISTS "currentVersion" TEXT NOT NULL DEFAULT '1.0.0',
ADD COLUMN IF NOT EXISTS "retractionStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS "correctionHistory" TEXT,
ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "nextFreshnessReviewAt" TIMESTAMP(3);
