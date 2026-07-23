-- Migration 018: reconcile any `id`-PK drift back to canonical `user_id`
-- Safe to run on DBs that already applied the old 014 CREATE TABLE (id PK) fork,
-- and on DBs that only have 010+ALTER shape.

DO $$
BEGIN
  -- If a legacy `id` column exists alongside `user_id`, backfill then drop id.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_quest_profiles'
      AND column_name = 'id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_quest_profiles'
      AND column_name = 'user_id'
  ) THEN
    UPDATE public.user_quest_profiles
    SET user_id = id
    WHERE user_id IS NULL AND id IS NOT NULL;

    -- Drop PK on id if present, ensure user_id is PK.
    BEGIN
      ALTER TABLE public.user_quest_profiles DROP CONSTRAINT IF EXISTS user_quest_profiles_pkey;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    ALTER TABLE public.user_quest_profiles
      ALTER COLUMN user_id SET NOT NULL;

    BEGIN
      ALTER TABLE public.user_quest_profiles
        ADD CONSTRAINT user_quest_profiles_pkey PRIMARY KEY (user_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    ALTER TABLE public.user_quest_profiles DROP COLUMN IF EXISTS id;
  END IF;

  -- Pure-id table (old 014 only): rename id → user_id.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_quest_profiles'
      AND column_name = 'id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_quest_profiles'
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.user_quest_profiles RENAME COLUMN id TO user_id;
  END IF;
END $$;

-- Guarantee hardware columns + default affinity 50.
ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS arc_progress INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS affinity_score INTEGER NOT NULL DEFAULT 50;

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS status_tag TEXT NOT NULL DEFAULT 'TOXIC ATTRACTION';

ALTER TABLE public.user_quest_profiles
  ALTER COLUMN affinity_score SET DEFAULT 50;

UPDATE public.user_quest_profiles
SET affinity_score = 50
WHERE affinity_score = 0 AND arc_progress = 0;

-- RLS must key off user_id.
ALTER TABLE public.user_quest_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_quest_profiles_select_own ON public.user_quest_profiles;
CREATE POLICY user_quest_profiles_select_own
  ON public.user_quest_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_quest_profiles_insert_own ON public.user_quest_profiles;
CREATE POLICY user_quest_profiles_insert_own
  ON public.user_quest_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_quest_profiles_update_own ON public.user_quest_profiles;
CREATE POLICY user_quest_profiles_update_own
  ON public.user_quest_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

COMMENT ON COLUMN public.user_quest_profiles.user_id IS
  'Canonical PK — auth user id. All recruit / verify / empathy paths use user_id.';
