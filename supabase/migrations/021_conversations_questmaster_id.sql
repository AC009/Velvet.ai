-- Migration 021: Ensure conversations.questmaster_id exists and is never NULL.
-- Production schemas enforce NOT NULL on this column; writes must always bind it.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS questmaster_id BIGINT;

-- Backfill from character_id where available.
UPDATE public.conversations
SET questmaster_id = character_id
WHERE questmaster_id IS NULL
  AND character_id IS NOT NULL;

-- Remaining rows → The Watcher (seed id 8).
UPDATE public.conversations
SET questmaster_id = 8
WHERE questmaster_id IS NULL;

ALTER TABLE public.conversations
  ALTER COLUMN questmaster_id SET DEFAULT 8;

DO $$
BEGIN
  ALTER TABLE public.conversations
    ALTER COLUMN questmaster_id SET NOT NULL;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'conversations.questmaster_id NOT NULL skipped: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_questmaster_id
  ON public.conversations (questmaster_id);

COMMENT ON COLUMN public.conversations.questmaster_id IS
  'Active questmaster / character identity. Mirrors character_id; required NOT NULL in production.';
