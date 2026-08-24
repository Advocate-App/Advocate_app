-- ================================================================
-- Migration 011: Junior advocate access + "who set this date" trail
--
-- - advocates.role: 'advocate' (full access, default) or 'junior'
--   (restricted to Today's Diary + Find Case, can still set hearing dates)
-- - hearings.set_by_name / set_by_advocate_id: whoever last set the stage
--   or next hearing date on a hearing, so there's no dispute later about
--   who did (or didn't) update a case
-- Run this in Supabase Dashboard → SQL Editor → Run
-- ================================================================

ALTER TABLE advocates ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'advocate'
  CHECK (role IN ('advocate', 'junior'));

ALTER TABLE hearings ADD COLUMN IF NOT EXISTS set_by_advocate_id UUID REFERENCES advocates(id);
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS set_by_name TEXT;
