-- =============================================================================
-- Multi-user + quota — Neon Console → SQL Editor
-- Chọn compute PRIMARY / Read-Write
-- CHẠY TỪNG CÂU MỘT (Neon không nhận nhiều lệnh trong một prepared statement)
-- =============================================================================

-- (1) Enum UserRole
DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- (2) Bảng User
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'EDITOR',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "dailyArticleLimit" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- (3) Unique email
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- (4) Article.createdById
ALTER TABLE "Article"
  ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- (5) Index ownership + ngày
CREATE INDEX IF NOT EXISTS "Article_createdById_createdAt_idx"
  ON "Article"("createdById", "createdAt");

-- (6) FK Article → User
DO $$ BEGIN
  ALTER TABLE "Article"
    ADD CONSTRAINT "Article_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- (7) AutoWriteConfig.ownerUserId
ALTER TABLE "AutoWriteConfig"
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

-- (8) FK AutoWrite → User
DO $$ BEGIN
  ALTER TABLE "AutoWriteConfig"
    ADD CONSTRAINT "AutoWriteConfig_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- (9) Kiểm tra
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'User'
ORDER BY ordinal_position;
