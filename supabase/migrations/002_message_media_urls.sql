-- Velvet.ai — optional multimodal columns on messages
BEGIN;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMIT;
