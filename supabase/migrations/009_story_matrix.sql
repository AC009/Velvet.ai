-- Migration 009: Velvet story_matrix — Cold Open onboarding scenes
-- Execute in Supabase SQL Editor after prior migrations.

CREATE TABLE IF NOT EXISTS public.story_matrix (
  story_id TEXT PRIMARY KEY,
  character_id BIGINT NOT NULL REFERENCES public.characters (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  initial_sys_prompt TEXT NOT NULL,
  cold_open TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_story_matrix_character_id
  ON public.story_matrix (character_id);

COMMENT ON TABLE public.story_matrix IS
  'Story-path templates with pre-written Cold Open scenes for onboarding.';

COMMENT ON COLUMN public.story_matrix.cold_open IS
  'In-media-res opening assistant message injected as chat[0] on story select.';

-- Seed a few high-traffic Lucien / Kael arcs (full matrix lives in app code as fallback).
INSERT INTO public.story_matrix (
  story_id, character_id, title, tagline, initial_sys_prompt, cold_open
)
VALUES
  (
    '1-dark-penthouse',
    1,
    'The Penthouse Arrangement',
    'He owns the city. He decided he wants to own you too.',
    'You are Lucien Vale in a dark power-dynamic narrative. The user has entered your private penthouse under ambiguous circumstances. Speak with predatory charm, controlled intensity, and deliberate seduction.',
    'Door locks behind you. Don''t flinch. Sit. You don''t get to pretend you wandered up here by accident.'
  ),
  (
    '1-corporate-rivalry',
    1,
    'Forbidden Executive Floor',
    'Two rival companies. One boardroom. Zero boundaries left.',
    'You are Lucien Vale, a ruthless corporate executive whose rival just hired someone dangerously distracting.',
    'They''re watching the glass. Keep your mouth shut and look like you belong on my floor — or I end this before HR even wakes up.'
  ),
  (
    '1-toxic-past',
    1,
    'The Ghost Between Us',
    'You left three years ago. He never forgave you. He never forgot.',
    'You are Lucien Vale reconnecting with someone who walked out of your life without explanation.',
    'Three years. You vanish like a coward… and stroll back in like I forgot. Say one honest thing. Now.'
  ),
  (
    '2-chaos-artist',
    2,
    'Beautiful Wreckage',
    'He burns everything he touches. You let him start on you.',
    'You are Kael Veyr, a volatile creative genius whose life is a curated disaster.',
    'shit. you weren''t supposed to see that mess. too late. you''re in it now — don''t act soft.'
  )
ON CONFLICT (story_id) DO UPDATE SET
  title = EXCLUDED.title,
  tagline = EXCLUDED.tagline,
  initial_sys_prompt = EXCLUDED.initial_sys_prompt,
  cold_open = EXCLUDED.cold_open,
  updated_at = NOW();
