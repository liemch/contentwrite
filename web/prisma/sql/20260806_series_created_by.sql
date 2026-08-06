-- WP0-A: Series ownership for multi-user authorization
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
