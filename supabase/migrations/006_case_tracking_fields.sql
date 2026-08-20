-- ================================================================
-- Migration 006: Case tracking fields (payment, documents, bills,
-- order/appeal) + case story + important points list
-- Run this in Supabase Dashboard → SQL Editor → Run
-- ================================================================

-- 1. New tracking columns on cases
ALTER TABLE cases ADD COLUMN IF NOT EXISTS payment_received BOOLEAN DEFAULT false;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS is_company_case BOOLEAN DEFAULT false;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS documents_received BOOLEAN DEFAULT false;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS bills_generated BOOLEAN DEFAULT false;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS order_passed BOOLEAN DEFAULT false;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS order_sent_to_company BOOLEAN DEFAULT false;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS order_sent_date DATE;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS appeal_filed BOOLEAN DEFAULT false;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS case_story TEXT;

CREATE INDEX IF NOT EXISTS idx_cases_is_company_case ON cases(is_company_case);

-- 2. Important points — running list per case (arguments / support points)
CREATE TABLE IF NOT EXISTS case_important_points (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID REFERENCES cases(id) ON DELETE CASCADE NOT NULL,
  point_text  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE case_important_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "important_points_own" ON case_important_points;
CREATE POLICY "important_points_own" ON case_important_points
  FOR ALL
  USING (case_id IN (SELECT id FROM cases WHERE advocate_id IN (SELECT id FROM advocates WHERE user_id = auth.uid())))
  WITH CHECK (case_id IN (SELECT id FROM cases WHERE advocate_id IN (SELECT id FROM advocates WHERE user_id = auth.uid())));
CREATE INDEX IF NOT EXISTS idx_important_points_case ON case_important_points(case_id);
