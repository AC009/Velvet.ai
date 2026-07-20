-- Migration 013: QA audit — COMPLETED status + persistent affinity trust bonus
-- Execute after 012_quest_progress_tracker.sql

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS affinity_trust_bonus NUMERIC(4, 3) NOT NULL DEFAULT 0;

ALTER TABLE public.user_quest_profiles
  DROP CONSTRAINT IF EXISTS user_quest_profiles_quest_status_check;

ALTER TABLE public.user_quest_profiles
  ADD CONSTRAINT user_quest_profiles_quest_status_check CHECK (
    quest_status IN ('NONE', 'PENDING', 'COMPLETED', 'UNLOCKED')
  );

COMMENT ON COLUMN public.user_quest_profiles.affinity_trust_bonus IS
  'Cumulative trust bonus from verified quest completions (persists across chat turns).';
