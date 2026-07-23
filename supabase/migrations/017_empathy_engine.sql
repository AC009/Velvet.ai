-- Migration 017: Dynamic Empathy Engine fields on user_quest_profiles
-- Paste & run in Supabase SQL Editor after 014–016.

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS last_energy_level INTEGER;

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS empathy_mode TEXT NOT NULL DEFAULT 'STANDARD';

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS empathy_checkin_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS last_empathy_at TIMESTAMPTZ;

ALTER TABLE public.user_quest_profiles
  DROP CONSTRAINT IF EXISTS user_quest_profiles_last_energy_level_check;

ALTER TABLE public.user_quest_profiles
  ADD CONSTRAINT user_quest_profiles_last_energy_level_check
  CHECK (
    last_energy_level IS NULL
    OR (last_energy_level >= 1 AND last_energy_level <= 5)
  );

ALTER TABLE public.user_quest_profiles
  DROP CONSTRAINT IF EXISTS user_quest_profiles_empathy_mode_check;

ALTER TABLE public.user_quest_profiles
  ADD CONSTRAINT user_quest_profiles_empathy_mode_check
  CHECK (empathy_mode IN ('STANDARD', 'RECOVERY'));

COMMENT ON COLUMN public.user_quest_profiles.last_energy_level IS
  'Last Human Check-In energy (1–5). 1–2 routes to Recovery Sync Node.';

COMMENT ON COLUMN public.user_quest_profiles.empathy_mode IS
  'STANDARD hardware lock, or RECOVERY when difficulty was auto-downgraded.';

COMMENT ON COLUMN public.user_quest_profiles.empathy_checkin_count IS
  'Lifetime count of energy check-ins before hardware missions.';

COMMENT ON COLUMN public.user_quest_profiles.last_empathy_at IS
  'Timestamp of the most recent empathy check-in or recovery routing.';
