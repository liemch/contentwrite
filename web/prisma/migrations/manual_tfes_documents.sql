-- Override file AI-TFES (.md) trên Neon — chạy 1 lần trên SQL Editor
-- Runtime đọc DB trước, fallback web/content/ai-tfes/

CREATE TABLE IF NOT EXISTS "TfesDocument" (
  "id" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TfesDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TfesDocument_path_key" ON "TfesDocument"("path");
