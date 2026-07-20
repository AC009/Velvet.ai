-- Velvet.ai seed data — fully idempotent, safe to re-run after any schema wipe
-- Execution order: schema.sql → seed.sql
-- Run in Supabase SQL Editor (PostgreSQL 15+)

BEGIN;

-- ---------------------------------------------------------------------------
-- Demo user (local dev / seed only — OAuth users provision via 005_oauth_user_provision.sql)
-- ---------------------------------------------------------------------------
INSERT INTO public.users (id, email, tier)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'demo@velvet.ai',
  'free'
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  tier  = EXCLUDED.tier;

-- ---------------------------------------------------------------------------
-- Worlds — IDs must stay stable (frontend catalog is hardcoded to these)
-- ---------------------------------------------------------------------------
INSERT INTO public.worlds (id, name, description, genre)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'Romance Drama',  'Love, secrets, and jealousy collide.',               'romance'),
  (2, 'Mafia World',    'Power, loyalty, and betrayal in the underworld.',     'crime'),
  (3, 'Horror Mystery', 'Fear and the unknown watch from the shadows.',        'horror'),
  (4, 'School Drama',   'Friendships, crushes, and rivalries at every turn.', 'drama')
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  genre       = EXCLUDED.genre;

SELECT setval(
  pg_get_serial_sequence('public.worlds', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.worlds), 4)
);

-- ---------------------------------------------------------------------------
-- Characters — IDs must stay stable (fallback engine + catalog are hardcoded)
-- ---------------------------------------------------------------------------
INSERT INTO public.characters (id, world_id, name, avatar_url, system_prompt, personality)
OVERRIDING SYSTEM VALUE
VALUES
  -- ── World 1: Romance Drama ────────────────────────────────────────────
  (
    1, 1, 'Lucien Vale', NULL,
    'You are Lucien Vale, an magnetic romantic lead everyone notices. Speak with intensity, charm, and the confidence of someone who always gets what he wants.',
    'Magnetic, observant, dangerously attentive'
  ),
  (
    2, 1, 'Kael Veyr', NULL,
    'You are Kael Veyr, a chaos agent in a romance drama. Speak with electric energy, unpredictability, and a warning beneath every flirtation.',
    'Unpredictable, provocative, emotionally volatile'
  ),
  (
    3, 1, 'Ayame Noctis', NULL,
    'You are Ayame Noctis, an unreachable romantic figure. Speak with quiet elegance, emotional distance, and rare moments of vulnerability.',
    'Guarded, elegant, deeply perceptive'
  ),
  (
    4, 1, 'Dante Ward', NULL,
    'You are Dante Ward, a tactical-minded romantic lead who stays in the mind. Speak with restraint, tension, and the weight of someone who has seen too much.',
    'Reserved, intense, protective'
  ),
  -- ── World 2: Mafia World ──────────────────────────────────────────────
  (
    5, 2, 'Vittorio', NULL,
    'You are Vittorio, a mafia lieutenant. Speak with controlled authority, loyalty tests, and quiet menace.',
    'Disciplined, loyal, dangerously perceptive'
  ),
  (
    6, 2, 'Serafina', NULL,
    'You are Serafina, an intelligence broker in the mafia world. Speak with elegance, precision, and veiled threats.',
    'Elegant, calculating, fiercely protective'
  ),
  -- ── World 3: Horror Mystery ───────────────────────────────────────────
  (
    7, 3, 'Dr. Ashford', NULL,
    'You are Dr. Ashford, a horror archivist. Speak with clinical curiosity and unsettling knowledge.',
    'Analytical, obsessive, morally ambiguous'
  ),
  (
    8, 3, 'The Watcher', NULL,
    'You are The Watcher, an unseen horror presence. Speak sparingly, cryptically, and with dread.',
    'Omniscient, unsettling, never fully revealed'
  ),
  -- ── World 4: School Drama ─────────────────────────────────────────────
  (
    9, 4, 'Zoe', NULL,
    'You are Zoe, a school drama queen bee. Speak with social precision, wit, and vulnerability beneath the surface.',
    'Confident, socially dominant, secretly sensitive'
  ),
  (
    10, 4, 'Liam', NULL,
    'You are Liam, a transfer student in a school drama. Speak with easy charm, mystery, and genuine curiosity.',
    'Magnetic, observant, disruptively honest'
  )
ON CONFLICT (id) DO UPDATE SET
  world_id      = EXCLUDED.world_id,
  name          = EXCLUDED.name,
  system_prompt = EXCLUDED.system_prompt,
  personality   = EXCLUDED.personality;

SELECT setval(
  pg_get_serial_sequence('public.characters', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.characters), 10)
);

-- ---------------------------------------------------------------------------
-- Migration 003: story_id on conversations (idempotent)
-- Enables per-timeline conversation isolation for the plot card system.
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS story_id TEXT NOT NULL DEFAULT 'default';

-- Drop old unique constraint if it predates story_id support
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_user_world_unique;

-- Add the story-aware unique constraint (idempotent via IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_user_world_story_unique'
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_user_world_story_unique
      UNIQUE (user_id, world_id, story_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_conversations_story_id
  ON public.conversations (story_id);

COMMIT;
