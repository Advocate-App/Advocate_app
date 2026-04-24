-- ================================================================
-- Migration 004: Custom courts + Clients + City column
-- Run this in Supabase Dashboard → SQL Editor → Run
-- ================================================================

-- 1. Fix client_side constraint to include HC values
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_client_side_check;
ALTER TABLE cases ADD CONSTRAINT cases_client_side_check
  CHECK (client_side IN (
    'plaintiff','defendant','both','intervenor',
    'petitioner','respondent','applicant','opposite_party',
    'appellant','caveator'
  ));

-- 2. Add city column to cases (auto-populated from court district)
ALTER TABLE cases ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS client_id UUID;
CREATE INDEX IF NOT EXISTS idx_cases_city ON cases(city);
CREATE INDEX IF NOT EXISTS idx_cases_client_id ON cases(client_id);

-- 3. Custom courts table
CREATE TABLE IF NOT EXISTS custom_courts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advocate_id UUID REFERENCES advocates(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  short_name  TEXT,
  city        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE custom_courts ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE custom_courts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "custom_courts_own" ON custom_courts;
CREATE POLICY "custom_courts_own" ON custom_courts
  FOR ALL
  USING (advocate_id IN (SELECT id FROM advocates WHERE user_id = auth.uid()))
  WITH CHECK (advocate_id IN (SELECT id FROM advocates WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_custom_courts_advocate ON custom_courts(advocate_id);

-- 4. Clients table
CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advocate_id UUID REFERENCES advocates(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  city        TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients_own" ON clients;
CREATE POLICY "clients_own" ON clients
  FOR ALL
  USING (advocate_id IN (SELECT id FROM advocates WHERE user_id = auth.uid()))
  WITH CHECK (advocate_id IN (SELECT id FROM advocates WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_clients_advocate ON clients(advocate_id);
CREATE TRIGGER IF NOT EXISTS clients_touch
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE PROCEDURE touch_updated_at();

-- 5. Add FK from cases.client_id → clients.id
ALTER TABLE cases
  ADD CONSTRAINT IF NOT EXISTS cases_client_id_fk
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
