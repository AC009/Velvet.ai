-- Migration 011: Quest mission validator loop — PENDING lock + XP tracking
-- Execute in Supabase SQL Editor after 010_rpg_quest_sessions.sql

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS quest_status TEXT NOT NULL DEFAULT 'UNLOCKED',
  ADD COLUMN IF NOT EXISTS xp_total INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS mission_index INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_verification TEXT;

ALTER TABLE public.user_quest_profiles
  DROP CONSTRAINT IF EXISTS user_quest_profiles_quest_status_check;

ALTER TABLE public.user_quest_profiles
  ADD CONSTRAINT user_quest_profiles_quest_status_check CHECK (
    quest_status IN ('NONE', 'PENDING', 'UNLOCKED')
  );

CREATE INDEX IF NOT EXISTS idx_user_quest_profiles_status
  ON public.user_quest_profiles (quest_status)
  WHERE quest_status = 'PENDING';

COMMENT ON COLUMN public.user_quest_profiles.quest_status IS
  'PENDING locks chat input until IRL mission verification completes.';
