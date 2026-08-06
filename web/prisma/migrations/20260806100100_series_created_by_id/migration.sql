-- WP0-A / WP1: Series ownership column (idempotent for brownfield).
-- Replaces manual patch: prisma/sql/20260806_series_created_by.sql
--
-- Reversible: NO — dropping "createdById" would discard ownership assignments.
-- Failed mid-flight: safe to re-run (IF NOT EXISTS guards).
-- App-only rollback: deploy previous app build; column may remain nullable.

ALTER TABLE "Series" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

CREATE INDEX IF NOT EXISTS "Series_createdById_idx" ON "Series"("createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Series_createdById_fkey'
  ) THEN
    ALTER TABLE "Series"
      ADD CONSTRAINT "Series_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
