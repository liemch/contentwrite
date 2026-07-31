-- =============================================================================
-- Writing prefs — chạy trên Neon Console → SQL Editor
-- Chọn compute PRIMARY / Read-Write (không chọn Read Replica / Time Travel)
-- =============================================================================

ALTER TABLE "Article"
  ADD COLUMN IF NOT EXISTS "targetWordCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "avoidFormats" TEXT;

ALTER TABLE "AutoWriteConfig"
  ADD COLUMN IF NOT EXISTS "defaultTargetWordCount" INTEGER DEFAULT 1200,
  ADD COLUMN IF NOT EXISTS "defaultAvoidFormats" TEXT DEFAULT 'table';

UPDATE "AutoWriteConfig"
SET
  "defaultTargetWordCount" = COALESCE("defaultTargetWordCount", 1200),
  "defaultAvoidFormats" = COALESCE(NULLIF(TRIM("defaultAvoidFormats"), ''), 'table')
WHERE id = 'default';

-- Kiểm tra nhanh:
-- SELECT "targetWordCount", "avoidFormats" FROM "Article" LIMIT 1;
-- SELECT "defaultTargetWordCount", "defaultAvoidFormats" FROM "AutoWriteConfig" WHERE id = 'default';
