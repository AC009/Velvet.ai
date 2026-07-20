-- Phantom Push — Web Push subscriptions + pulse deduplication
BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  world_id     BIGINT REFERENCES public.worlds (id) ON DELETE SET NULL,
  character_id BIGINT REFERENCES public.characters (id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_world_character
  ON public.push_subscriptions (world_id, character_id);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_phantom_pulse_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_phantom_scan
  ON public.conversations (updated_at)
  WHERE last_phantom_pulse_at IS NULL OR last_phantom_pulse_at < updated_at;

COMMIT;
