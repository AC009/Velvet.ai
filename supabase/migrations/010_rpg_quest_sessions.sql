-- Migration 010: Velvet Quest — gamified RPG session + active questmaster mentor
-- Execute in Supabase SQL Editor after prior migrations.

CREATE TABLE IF NOT EXISTS public.user_quest_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  active_mentor_character_id BIGINT NOT NULL REFERENCES public.characters (id) ON DELETE CASCADE,
  active_world_id BIGINT NOT NULL REFERENCES public.worlds (id) ON DELETE CASCADE,
  quest_line_id TEXT,
  active_story_id TEXT NOT NULL,
  session_state TEXT NOT NULL DEFAULT 'onboarding_cold_open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_quest_profiles_session_state_check CHECK (
    session_state IN (
      'onboarding_cold_open',
      'active_mission',
      'mission_complete',
      'paused'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_user_quest_profiles_mentor
  ON public.user_quest_profiles (active_mentor_character_id);

CREATE INDEX IF NOT EXISTS idx_user_quest_profiles_quest_line
  ON public.user_quest_profiles (quest_line_id)
  WHERE quest_line_id IS NOT NULL;

COMMENT ON TABLE public.user_quest_profiles IS
  'Active Velvet Quest RPG session — one row per user with locked questmaster mentor.';

COMMENT ON COLUMN public.user_quest_profiles.session_state IS
  'Gamified session phase; onboarding_cold_open triggers mission block on chat init.';
