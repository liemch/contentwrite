-- Neon / Postgres: writing prefs (Primary RW compute)
-- Chạy trong SQL Editor nếu prisma db push không kết nối được từ máy local.

ALTER TABLE "Article"
  ADD COLUMN IF NOT EXISTS "targetWordCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "avoidFormats" TEXT;

ALTER TABLE "AutoWriteConfig"
  ADD COLUMN IF NOT EXISTS "defaultTargetWordCount" INTEGER DEFAULT 1200,
  ADD COLUMN IF NOT EXISTS "defaultAvoidFormats" TEXT DEFAULT 'table';

UPDATE "AutoWriteConfig"
SET "defaultTargetWordCount" = COALESCE("defaultTargetWordCount", 1200),
    "defaultAvoidFormats" = COALESCE("defaultAvoidFormats", 'table')
WHERE id = 'default';
