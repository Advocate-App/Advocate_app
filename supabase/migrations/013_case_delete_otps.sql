-- ================================================================
-- Migration 013: OTP confirmation before permanently deleting a case
-- A short-lived code is emailed to whoever clicks Delete, and the
-- actual delete only happens once that code is typed back in — guards
-- against a stray/accidental click permanently wiping a case.
-- Run this in Supabase Dashboard → SQL Editor → Run
-- ================================================================

CREATE TABLE IF NOT EXISTS case_delete_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID REFERENCES cases(id) ON DELETE CASCADE NOT NULL,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_delete_otps_case ON case_delete_otps(case_id);

-- Only ever written/read via the service-role key from the two API
-- routes below — no client-side access needed, so RLS just locks it
-- down entirely rather than needing per-advocate policies.
ALTER TABLE case_delete_otps ENABLE ROW LEVEL SECURITY;
