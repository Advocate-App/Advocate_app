-- ================================================================
-- Migration 010: Google Drive-linked documents
-- Documents can now either be uploaded (stored in Supabase, as before)
-- or linked to a file that stays in Google Drive — no copy is made,
-- so there's no extra storage use. storage_path is only set for
-- uploaded files; external_url is only set for Drive-linked ones.
-- Run this in Supabase Dashboard → SQL Editor → Run
-- ================================================================

ALTER TABLE case_documents ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS external_url TEXT;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'upload'
  CHECK (source IN ('upload', 'drive_link'));
