-- Editable article shapes + immutable per-article snapshot.
ALTER TABLE "Article"
ADD COLUMN IF NOT EXISTS "articleShapeId" TEXT,
ADD COLUMN IF NOT EXISTS "articleShapeVersion" TEXT,
ADD COLUMN IF NOT EXISTS "articleShapeSnapshot" TEXT,
ADD COLUMN IF NOT EXISTS "openingPattern" TEXT,
ADD COLUMN IF NOT EXISTS "narrativePattern" TEXT;

CREATE TABLE IF NOT EXISTS "ArticleShapeProfile" (
  "id" TEXT PRIMARY KEY,
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ArticleShapeProfile_active_updatedAt_idx"
ON "ArticleShapeProfile"("active", "updatedAt");
