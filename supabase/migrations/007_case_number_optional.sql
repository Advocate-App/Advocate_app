-- ================================================================
-- Migration 007: Allow case_number to be blank
-- Needed because Avi has cases that haven't been numbered by the
-- court yet (new/unnumbered matters) — they still need to show up
-- in the diary.
-- Run this in Supabase Dashboard → SQL Editor → Run
-- ================================================================

ALTER TABLE cases ALTER COLUMN case_number DROP NOT NULL;
