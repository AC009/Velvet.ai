-- Migration 016: user_codex_cards — unlocked Real-Life RPG trophies
-- Paste & run in the Supabase SQL Editor after 015_missions_pool.sql

CREATE TABLE IF NOT EXISTS public.user_codex_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_codex_cards_mission_id_not_empty
    CHECK (char_length(trim(mission_id)) > 0),
  CONSTRAINT user_codex_cards_title_not_empty
    CHECK (char_length(trim(title)) > 0),
  CONSTRAINT user_codex_cards_user_mission_unique
    UNIQUE (user_id, mission_id)
);

CREATE INDEX IF NOT EXISTS idx_user_codex_cards_user_unlocked
  ON public.user_codex_cards (user_id, unlocked_at DESC);

COMMENT ON TABLE public.user_codex_cards IS
  'Codex Memory Cards — unique trophies unlocked by hardware-verified missions.';

COMMENT ON COLUMN public.user_codex_cards.mission_id IS
  'Stable mission identity (missions_pool.id or derived mission key).';

ALTER TABLE public.user_codex_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_codex_cards_select_own ON public.user_codex_cards;
CREATE POLICY user_codex_cards_select_own
  ON public.user_codex_cards
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_codex_cards_insert_own ON public.user_codex_cards;
CREATE POLICY user_codex_cards_insert_own
  ON public.user_codex_cards
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
