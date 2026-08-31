-- ================================================================
-- Migration 017: a second, even-shorter court label just for the
-- mobile diary view (e.g. "M1" instead of "MACT-1") — editable from
-- the My Courts page, same as the existing desktop short_name.
-- Already applied directly to production.
-- ================================================================

ALTER TABLE custom_courts ADD COLUMN IF NOT EXISTS mobile_short_name text;
