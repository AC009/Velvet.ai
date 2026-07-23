-- Migration 020: Alias columns for questmaster recruitment resilience
-- Adds optional questmaster_id / character_id mirrors used by some prod schemas.

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS questmaster_id BIGINT;

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS character_id BIGINT;

ALTER TABLE public.user_quest_profiles
  ADD COLUMN IF NOT EXISTS world_id BIGINT;

-- Backfill aliases from canonical mentor columns when present.
UPDATE public.user_quest_profiles
SET questmaster_id = active_mentor_character_id
WHERE questmaster_id IS NULL
  AND active_mentor_character_id IS NOT NULL;

UPDATE public.user_quest_profiles 
SET character_id = active_mentor_character_id
WHERE character_id IS NULL
  AND active_mentor_character_id IS NOT NULL;

UPDATE public.user_quest_profiles
SET world_id = active_world_id
WHERE world_id IS NULL
  AND active_world_id IS NOT NULL;

COMMENT ON COLUMN public.user_quest_profiles.questmaster_id IS
  'Alias of active_mentor_character_id for legacy / external recruit payloads.';
