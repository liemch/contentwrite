-- Incremental migration for databases that already applied the v1.6 workflow schema.
ALTER TABLE "Article"
ADD COLUMN IF NOT EXISTS "workflowVersion" INTEGER NOT NULL DEFAULT 0;
