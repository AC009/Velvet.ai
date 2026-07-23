-- Migration 019: Allow FOCUS empathy mode (Night Focus Protocol)
ALTER TABLE public.user_quest_profiles
  DROP CONSTRAINT IF EXISTS user_quest_profiles_empathy_mode_check;

ALTER TABLE public.user_quest_profiles
  ADD CONSTRAINT user_quest_profiles_empathy_mode_check
  CHECK (empathy_mode IN ('STANDARD', 'RECOVERY', 'FOCUS'));

COMMENT ON COLUMN public.user_quest_profiles.empathy_mode IS
  'STANDARD camera lock, RECOVERY (energy 1–2), or FOCUS (Night Focus Protocol).';
