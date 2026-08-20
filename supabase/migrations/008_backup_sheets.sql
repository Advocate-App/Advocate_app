-- ================================================================
-- Migration 008: Daily Google Sheet backup tracking
-- One spreadsheet per year; a new tab gets added to it every day
-- by the /api/cron/daily-backup job. This table just remembers
-- which spreadsheet ID belongs to which year.
-- Run this in Supabase Dashboard → SQL Editor → Run
-- ================================================================

CREATE TABLE IF NOT EXISTS backup_sheets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year           INT NOT NULL,
  account        TEXT NOT NULL CHECK (account IN ('avi', 'ratnesh')),
  spreadsheet_id TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (year, account)
);

-- This table is only ever touched by the server-side cron job using the
-- service role key, so it doesn't need advocate-scoped RLS policies —
-- just lock it down from the anon/public API entirely.
ALTER TABLE backup_sheets ENABLE ROW LEVEL SECURITY;
