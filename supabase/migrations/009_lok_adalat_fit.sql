-- ================================================================
-- Migration 009: Lok Adalat fitness flag
-- Tri-state: NULL = not assessed yet, true = Fit for Lok Adalat,
-- false = Not Fit for Lok Adalat.
-- Run this in Supabase Dashboard → SQL Editor → Run
-- ================================================================

ALTER TABLE cases ADD COLUMN IF NOT EXISTS lok_adalat_fit BOOLEAN;
