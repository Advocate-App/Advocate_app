-- ================================================================
-- Migration 012: Link cases together
-- Mark two cases as related (same accident, connected matter, appeal
-- of another, etc.) so opening either one shows a quick jump to the
-- other. RLS just requires being a logged-in advocate (not "own
-- cases only") — cases/hearings themselves have no RLS either, this
-- app treats the whole firm's caseload as shared, and juniors need
-- to be able to see linked cases too, not just the two seniors.
-- Run this in Supabase Dashboard → SQL Editor → Run
-- ================================================================

CREATE TABLE IF NOT EXISTS case_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID REFERENCES cases(id) ON DELETE CASCADE NOT NULL,
  linked_case_id  UUID REFERENCES cases(id) ON DELETE CASCADE NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT case_links_not_self CHECK (case_id <> linked_case_id)
);

ALTER TABLE case_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "case_links_authenticated" ON case_links;
CREATE POLICY "case_links_authenticated" ON case_links
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_case_links_case ON case_links(case_id);
CREATE INDEX IF NOT EXISTS idx_case_links_linked_case ON case_links(linked_case_id);

-- Same pair can't be linked twice, regardless of which side is which
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_links_unique_pair ON case_links (
  LEAST(case_id, linked_case_id), GREATEST(case_id, linked_case_id)
);
