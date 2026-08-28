-- ================================================================
-- Migration 016: a second client on a case, for when "Client Side"
-- is "both" (we represent both parties, e.g. a consent matter) —
-- there needs to be somewhere to record the second client, not just
-- the one client_name/client_id pair the case already had.
-- Already applied directly to production.
-- ================================================================

ALTER TABLE cases ADD COLUMN IF NOT EXISTS client_name_2 text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS client_id_2 uuid REFERENCES clients(id);
