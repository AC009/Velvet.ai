-- Migration 006: character_id on conversations for multiverse matrix isolation
-- Each (user, genre/world, character, story) gets an isolated conversation timeline.

BEGIN;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS character_id INTEGER;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_user_world_story_unique;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_user_world_unique;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_user_world_character_story_unique
  UNIQUE (user_id, world_id, character_id, story_id);

CREATE INDEX IF NOT EXISTS idx_conversations_character_id
  ON public.conversations (character_id);

CREATE INDEX IF NOT EXISTS idx_conversations_world_character
  ON public.conversations (world_id, character_id);

COMMIT;
