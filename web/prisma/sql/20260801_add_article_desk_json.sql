-- Proofdesk: deskJson (fact human verdicts + edit meta)
-- Idempotent.

ALTER TABLE "Article"
  ADD COLUMN IF NOT EXISTS "deskJson" TEXT;

COMMENT ON COLUMN "Article"."deskJson" IS
  'JSON bàn biên tập: fact human verdicts, edit meta';
