-- =============================================================================
-- Writing prefs — Neon Console → SQL Editor
-- Chọn compute PRIMARY / Read-Write
-- CHẠY TỪNG CÂU MỘT (Neon không nhận nhiều lệnh trong một prepared statement)
-- =============================================================================

-- (1) Article.targetWordCount
ALTER TABLE "Article"
  ADD COLUMN IF NOT EXISTS "targetWordCount" INTEGER;

-- (2) Article.avoidFormats
ALTER TABLE "Article"
  ADD COLUMN IF NOT EXISTS "avoidFormats" TEXT;

-- (3) AutoWriteConfig.defaultTargetWordCount
ALTER TABLE "AutoWriteConfig"
  ADD COLUMN IF NOT EXISTS "defaultTargetWordCount" INTEGER DEFAULT 1200;

-- (4) AutoWriteConfig.defaultAvoidFormats
ALTER TABLE "AutoWriteConfig"
  ADD COLUMN IF NOT EXISTS "defaultAvoidFormats" TEXT DEFAULT 'table';

-- (5) Seed default row (nếu đã có id = default)
UPDATE "AutoWriteConfig"
SET
  "defaultTargetWordCount" = COALESCE("defaultTargetWordCount", 1200),
  "defaultAvoidFormats" = COALESCE(NULLIF(TRIM("defaultAvoidFormats"), ''), 'table')
WHERE id = 'default';

-- (6) Kiểm tra (tuỳ chọn)
SELECT id, "defaultTargetWordCount", "defaultAvoidFormats"
FROM "AutoWriteConfig"
WHERE id = 'default';
