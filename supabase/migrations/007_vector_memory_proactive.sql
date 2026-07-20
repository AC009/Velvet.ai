-- Hybrid vector memory (pgvector) + proactive engagement deduplication
BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.relationship_memory_nodes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  world_id        BIGINT NOT NULL REFERENCES public.worlds (id) ON DELETE CASCADE,
  character_id    BIGINT REFERENCES public.characters (id) ON DELETE SET NULL,
  conversation_id BIGINT REFERENCES public.conversations (id) ON DELETE CASCADE,
  fact_type       TEXT NOT NULL DEFAULT 'dialogue',
  content         TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding       VECTOR(384),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT relationship_memory_nodes_content_not_empty
    CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_relationship_memory_nodes_scope
  ON public.relationship_memory_nodes (user_id, world_id, character_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_relationship_memory_nodes_embedding
  ON public.relationship_memory_nodes
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_proactive_ping_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_proactive_scan
  ON public.conversations (updated_at)
  WHERE last_proactive_ping_at IS NULL
     OR last_proactive_ping_at < updated_at;

CREATE OR REPLACE FUNCTION public.match_relationship_memory(
  p_user_id UUID,
  p_world_id BIGINT,
  p_character_id BIGINT,
  p_query_embedding VECTOR(384),
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  fact_type TEXT,
  metadata JSONB,
  similarity DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    n.id,
    n.content,
    n.fact_type,
    n.metadata,
    (1 - (n.embedding <=> p_query_embedding))::DOUBLE PRECISION AS similarity
  FROM public.relationship_memory_nodes AS n
  WHERE n.user_id = p_user_id
    AND n.world_id = p_world_id
    AND (n.character_id IS NULL OR n.character_id = p_character_id)
    AND n.embedding IS NOT NULL
  ORDER BY n.embedding <=> p_query_embedding
  LIMIT LEAST(GREATEST(p_match_count, 1), 10);
$$;

COMMIT;
