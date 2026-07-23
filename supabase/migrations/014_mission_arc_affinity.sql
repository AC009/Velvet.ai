-- Migration 014 (rewritten): hardware RPG columns on user_quest_profiles
-- Canonical PK remains user_id (from migration 010). Do NOT create a parallel `id` table.
-- Paste & run in Supabase SQL Editor after 010–013.

-- Ensure base table exists (010 shape). Safe no-op if already present.
CREATE TABLE IF NOT EXISTS public.user_quest_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  active_mentor_character_id BIGINT,
  active_world_id BIGINT,
  quest_line_id TEXT,
  active_story_id TEXT,
  session_state TEXT NOT NULL DEFAULT 'onboarding_cold_open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hardware affinity / ARC columns (idempotent).
ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS arc_progress INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS affinity_score INTEGER NOT NULL DEFAULT 50;

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS status_tag TEXT NOT NULL DEFAULT 'TOXIC ATTRACTION';

-- Normalize any rows that somehow got affinity 0 from early recruit writers.
UPDATE public.user_quest_profiles
SET affinity_score = 50
WHERE affinity_score IS NULL OR affinity_score < 0;

ALTER TABLE public.user_quest_profiles
  DROP CONSTRAINT IF EXISTS user_quest_profiles_arc_progress_check;

ALTER TABLE public.user_quest_profiles
  ADD CONSTRAINT user_quest_profiles_arc_progress_check
  CHECK (arc_progress >= 0 AND arc_progress <= 100);

ALTER TABLE public.user_quest_profiles
  DROP CONSTRAINT IF EXISTS user_quest_profiles_affinity_score_check;

ALTER TABLE public.user_quest_profiles
  ADD CONSTRAINT user_quest_profiles_affinity_score_check
  CHECK (affinity_score >= 0 AND affinity_score <= 100);

ALTER TABLE public.user_quest_profiles
  DROP CONSTRAINT IF EXISTS user_quest_profiles_status_tag_check;

ALTER TABLE public.user_quest_profiles
  ADD CONSTRAINT user_quest_profiles_status_tag_check
  CHECK (status_tag IN ('TOXIC ATTRACTION', 'RESPECT'));

CREATE INDEX IF NOT EXISTS idx_user_quest_profiles_status_tag
  ON public.user_quest_profiles (status_tag);

COMMENT ON TABLE public.user_quest_profiles IS
  'Per-user Real-Life RPG tracker — session + ARC progress + affinity (PK = user_id).';

COMMENT ON COLUMN public.user_quest_profiles.user_id IS
  'Auth / public.users id (canonical PK).';

COMMENT ON COLUMN public.user_quest_profiles.arc_progress IS
  'Active story ARC progress percent (0–100). +25 per verified mission.';

COMMENT ON COLUMN public.user_quest_profiles.affinity_score IS
  'Relationship affinity percent (0–100). Default 50; +10 per verified mission.';

COMMENT ON COLUMN public.user_quest_profiles.status_tag IS
  'UI status: RESPECT when affinity_score >= 60, else TOXIC ATTRACTION.';

ALTER TABLE public.user_quest_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_quest_profiles_select_own ON public.user_quest_profiles;
CREATE POLICY user_quest_profiles_select_own
  ON public.user_quest_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_quest_profiles_insert_own ON public.user_quest_profiles;
DROP POLICY IF EXISTS "u ser_quest_profiles_insert_own" ON public.user_quest_profiles;
CREATE POLICY user_quest_profiles_insert_own
  ON public.user_quest_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_quest_profiles_update_own ON public.user_quest_profiles;
CREATE POLICY user_quest_profiles_update_own
  ON public.user_quest_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);
