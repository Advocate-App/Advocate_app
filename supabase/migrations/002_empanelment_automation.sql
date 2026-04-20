-- Migration: Add columns for empanelment email automation
-- Run this in Supabase SQL Editor

-- Add advocate_id to applications (links application to a specific advocate)
ALTER TABLE applications ADD COLUMN IF NOT EXISTS advocate_id uuid REFERENCES advocates(id);

-- Add email automation tracking columns
ALTER TABLE applications ADD COLUMN IF NOT EXISTS application_sent_at timestamptz;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS followup1_sent_at timestamptz;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS followup2_sent_at timestamptz;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS response_received_at timestamptz;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS response_summary text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS response_sentiment text CHECK (response_sentiment IN ('positive', 'negative', 'neutral'));

-- Index for cron queries
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_sent_at ON applications(application_sent_at);
CREATE INDEX IF NOT EXISTS idx_applications_followup1 ON applications(followup1_sent_at);
CREATE INDEX IF NOT EXISTS idx_applications_followup2 ON applications(followup2_sent_at);
CREATE INDEX IF NOT EXISTS idx_applications_advocate ON applications(advocate_id);

-- Allow the new statuses in the status column (if there's a check constraint, update it)
-- The existing code uses free-text status so no constraint change needed

-- RLS policy for service role is automatic (service_role bypasses RLS)
