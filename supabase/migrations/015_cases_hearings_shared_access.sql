-- ================================================================
-- Migration 015: cases/hearings readable+writable by any authenticated
-- advocate, not just the one who owns them.
--
-- Root cause found by directly simulating a junior's DB session: the
-- "cases_own" policy only ever matched advocate_id = your own row, so
-- a junior (who owns zero cases themselves — every case belongs to one
-- of the two seniors) saw exactly zero cases at the database level, no
-- matter what the app asked for. This is the actual reason the Diary
-- showed nothing for juniors — nothing to do with the app's own logic.
-- Run this in Supabase Dashboard → SQL Editor → Run
-- ================================================================

DROP POLICY IF EXISTS "cases_own" ON cases;
DROP POLICY IF EXISTS "cases_shared" ON cases;
CREATE POLICY "cases_shared" ON cases
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "hearings_own" ON hearings;
DROP POLICY IF EXISTS "hearings_shared" ON hearings;
CREATE POLICY "hearings_shared" ON hearings
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
