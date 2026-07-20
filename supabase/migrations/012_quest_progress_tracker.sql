-- Migration 012: RPG progress tracker — milestones, streaks, punctuality
-- Execute in Supabase SQL Editor after 011_quest_status.sql

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS verified_quest_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_milestone_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quest_pending_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.quest_milestones (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES public.characters (id) ON DELETE CASCADE,
  world_id BIGINT NOT NULL REFERENCES public.worlds (id) ON DELETE CASCADE,
  mission_index INTEGER NOT NULL,
  verification TEXT NOT NULL,
  secret_label TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quest_milestones_user_character
  ON public.quest_milestones (user_id, character_id, completed_at DESC);

COMMENT ON COLUMN public.user_quest_profiles.consecutive_milestone_streak IS
  'Consecutive real-life milestone completions without overdue failure. Resets when a PENDING mission expires.';

COMMENT ON TABLE public.quest_milestones IS
  'Verified IRL quest completions — feeds DISCOVERED SECRETS when streak >= 3.';
