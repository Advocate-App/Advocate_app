-- ================================================================
-- Migration 014: Let any authenticated advocate read the advocates
-- table (not just their own row) — still only writable to your own
-- row. A junior advocate needs to look up both seniors' ids to see
-- their cases, and the old "self only" policy silently blocked that
-- read, which meant a junior saw literally zero cases anywhere.
-- Run this in Supabase Dashboard → SQL Editor → Run
-- ================================================================

DROP POLICY IF EXISTS "advocates_self" ON advocates;
DROP POLICY IF EXISTS "advocates_read_all" ON advocates;
DROP POLICY IF EXISTS "advocates_insert_own" ON advocates;
DROP POLICY IF EXISTS "advocates_update_own" ON advocates;
DROP POLICY IF EXISTS "advocates_delete_own" ON advocates;

CREATE POLICY "advocates_read_all" ON advocates
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "advocates_insert_own" ON advocates
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "advocates_update_own" ON advocates
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "advocates_delete_own" ON advocates
  FOR DELETE USING (user_id = auth.uid());
