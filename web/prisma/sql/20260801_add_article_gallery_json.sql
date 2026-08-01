-- Proofdesk: gallery ảnh 1–5 / bài (hero + inline)
-- Idempotent — chạy nhiều lần an toàn.

ALTER TABLE "Article"
  ADD COLUMN IF NOT EXISTS "galleryJson" TEXT;

COMMENT ON COLUMN "Article"."galleryJson" IS
  'JSON gallery ảnh bài (hero + inline), tối đa 5 phần tử';
