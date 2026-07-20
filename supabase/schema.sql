-- Velvet.ai — Production PostgreSQL Schema
-- Execute in Supabase SQL Editor (PostgreSQL 15+)

BEGIN;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  tier  TEXT NOT NULL DEFAULT 'free',
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_tier_check CHECK (tier IN ('free', 'premium', 'enterprise'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

-- ---------------------------------------------------------------------------
-- worlds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worlds (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  genre       TEXT NOT NULL DEFAULT 'fantasy',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worlds_genre ON public.worlds (genre);

-- ---------------------------------------------------------------------------
-- characters
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.characters (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  world_id      BIGINT NOT NULL REFERENCES public.worlds (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  avatar_url    TEXT,
  system_prompt TEXT NOT NULL DEFAULT '',
  personality   TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_characters_world_id ON public.characters (world_id);

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  world_id     BIGINT NOT NULL REFERENCES public.worlds (id) ON DELETE CASCADE,
  locked_until TIMESTAMPTZ,
  payment_intent_clicks INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversations_user_world_unique UNIQUE (user_id, world_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_world_id ON public.conversations (world_id);
CREATE INDEX IF NOT EXISTS idx_conversations_locked_until
  ON public.conversations (locked_until)
  WHERE locked_until IS NOT NULL;

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  character_id    BIGINT REFERENCES public.characters (id) ON DELETE SET NULL,
  content         TEXT NOT NULL,
  audio_url       TEXT,
  image_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_content_not_empty CHECK (char_length(trim(content)) > 0)
);

-- Primary hot-path index: per-conversation chronological retrieval
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at
  ON public.messages (conversation_id, created_at DESC, id DESC);

-- Covering index for conversation message counts (avoids heap lookups)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_covering
  ON public.messages (conversation_id)
  INCLUDE (id, character_id, created_at);

-- Global narrative synthesis: world-scoped history via conversations join
CREATE INDEX IF NOT EXISTS idx_messages_created_at_id
  ON public.messages (created_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- updated_at trigger for conversations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_conversations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON public.conversations;
CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_conversations_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (defense-in-depth; service role bypasses RLS)
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worlds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY worlds_select_all ON public.worlds
  FOR SELECT USING (true);

CREATE POLICY characters_select_all ON public.characters
  FOR SELECT USING (true);

CREATE POLICY conversations_select_own ON public.conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY conversations_insert_own ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY conversations_update_own ON public.conversations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY messages_select_own ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY messages_insert_own ON public.messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );

-- Global narrative synthesis RPC (single round-trip, index-friendly)
CREATE OR REPLACE FUNCTION public.get_world_narrative_history(
  p_world_id BIGINT,
  p_limit INT DEFAULT 15
)
RETURNS TABLE (
  id BIGINT,
  conversation_id BIGINT,
  character_id BIGINT,
  content TEXT,
  audio_url TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ,
  character_name TEXT,
  user_id UUID
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.conversation_id,
    m.character_id,
    m.content,
    m.audio_url,
    m.image_url,
    m.created_at,
    ch.name AS character_name,
    c.user_id
  FROM public.messages m
  INNER JOIN public.conversations c ON c.id = m.conversation_id
  LEFT JOIN public.characters ch ON ch.id = m.character_id
  WHERE c.world_id = p_world_id
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT GREATEST(p_limit, 1);
$$;

COMMIT;
