-- GraphRAG — hybrid vector + entity-relation-emotion graph memory
BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Graph nodes: entities (User, Character, Company, Place, Object, Concept)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.memory_graph_nodes (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  world_id     BIGINT NOT NULL REFERENCES public.worlds (id) ON DELETE CASCADE,
  character_id BIGINT REFERENCES public.characters (id) ON DELETE SET NULL,
  node_key     TEXT NOT NULL,
  node_type    TEXT NOT NULL DEFAULT 'entity',
  label        TEXT NOT NULL,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding    VECTOR(384),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT memory_graph_nodes_unique UNIQUE (user_id, world_id, character_id, node_key)
);

CREATE INDEX IF NOT EXISTS idx_memory_graph_nodes_scope
  ON public.memory_graph_nodes (user_id, world_id, character_id);

CREATE INDEX IF NOT EXISTS idx_memory_graph_nodes_key
  ON public.memory_graph_nodes USING gin (to_tsvector('simple', node_key || ' ' || label));

-- ---------------------------------------------------------------------------
-- Graph edges: [subject] -> (predicate / emotion) -> [object] triples
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.memory_graph_edges (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  world_id     BIGINT NOT NULL REFERENCES public.worlds (id) ON DELETE CASCADE,
  character_id BIGINT REFERENCES public.characters (id) ON DELETE SET NULL,
  subject      TEXT NOT NULL,
  predicate    TEXT NOT NULL,
  object       TEXT NOT NULL,
  edge_type    TEXT NOT NULL DEFAULT 'relation',
  weight       DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding    VECTOR(384),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT memory_graph_edges_content_not_empty
    CHECK (char_length(trim(subject)) > 0 AND char_length(trim(object)) > 0),
  CONSTRAINT memory_graph_edges_unique
    UNIQUE (user_id, world_id, character_id, subject, predicate, object)
);

CREATE INDEX IF NOT EXISTS idx_memory_graph_edges_scope
  ON public.memory_graph_edges (user_id, world_id, character_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_graph_edges_subject
  ON public.memory_graph_edges USING gin (
    to_tsvector('simple', subject || ' ' || predicate || ' ' || object)
  );

CREATE INDEX IF NOT EXISTS idx_memory_graph_edges_embedding
  ON public.memory_graph_edges
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- Safe temporal upsert of a graph triple (updates weight + timestamp drift)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_graph_edge(
  p_user_id UUID,
  p_world_id BIGINT,
  p_character_id BIGINT,
  p_subject TEXT,
  p_predicate TEXT,
  p_object TEXT,
  p_edge_type TEXT,
  p_metadata JSONB,
  p_embedding VECTOR(384)
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO public.memory_graph_edges (
    user_id, world_id, character_id, subject, predicate, object,
    edge_type, weight, metadata, embedding, updated_at
  )
  VALUES (
    p_user_id, p_world_id, p_character_id, p_subject, p_predicate, p_object,
    COALESCE(p_edge_type, 'relation'), 1.0, COALESCE(p_metadata, '{}'::jsonb),
    p_embedding, NOW()
  )
  ON CONFLICT (user_id, world_id, character_id, subject, predicate, object)
  DO UPDATE SET
    weight = public.memory_graph_edges.weight + 0.5,
    edge_type = EXCLUDED.edge_type,
    metadata = public.memory_graph_edges.metadata || EXCLUDED.metadata,
    embedding = COALESCE(EXCLUDED.embedding, public.memory_graph_edges.embedding),
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Batched hybrid GraphRAG query — one round-trip returning vector matches
-- AND traversed graph sub-clusters (source column disambiguates rows).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.graphrag_hybrid_query(
  p_user_id UUID,
  p_world_id BIGINT,
  p_character_id BIGINT,
  p_query_embedding VECTOR(384),
  p_keywords TEXT,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  source TEXT,
  subject TEXT,
  predicate TEXT,
  object TEXT,
  edge_type TEXT,
  content TEXT,
  weight DOUBLE PRECISION,
  similarity DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
AS $$
  WITH vector_hits AS (
    SELECT
      'vector'::TEXT AS source,
      NULL::TEXT AS subject,
      n.fact_type::TEXT AS predicate,
      NULL::TEXT AS object,
      'memory'::TEXT AS edge_type,
      n.content::TEXT AS content,
      1.0::DOUBLE PRECISION AS weight,
      (1 - (n.embedding <=> p_query_embedding))::DOUBLE PRECISION AS similarity
    FROM public.relationship_memory_nodes AS n
    WHERE n.user_id = p_user_id
      AND n.world_id = p_world_id
      AND (n.character_id IS NULL OR n.character_id = p_character_id)
      AND n.embedding IS NOT NULL
    ORDER BY n.embedding <=> p_query_embedding
    LIMIT LEAST(GREATEST(p_match_count, 1), 10)
  ),
  graph_vector AS (
    SELECT
      'graph'::TEXT AS source,
      e.subject::TEXT,
      e.predicate::TEXT,
      e.object::TEXT,
      e.edge_type::TEXT,
      (e.subject || ' -> (' || e.predicate || ') -> ' || e.object)::TEXT AS content,
      e.weight::DOUBLE PRECISION,
      CASE
        WHEN e.embedding IS NOT NULL AND p_query_embedding IS NOT NULL
          THEN (1 - (e.embedding <=> p_query_embedding))::DOUBLE PRECISION
        ELSE 0.5::DOUBLE PRECISION
      END AS similarity
    FROM public.memory_graph_edges AS e
    WHERE e.user_id = p_user_id
      AND e.world_id = p_world_id
      AND (e.character_id IS NULL OR e.character_id = p_character_id)
      AND (
        p_keywords = ''
        OR to_tsvector('simple', e.subject || ' ' || e.predicate || ' ' || e.object)
           @@ plainto_tsquery('simple', p_keywords)
        OR (e.embedding IS NOT NULL AND (e.embedding <=> p_query_embedding) < 0.75)
      )
    ORDER BY e.weight DESC, e.updated_at DESC
    LIMIT LEAST(GREATEST(p_match_count, 1), 12)
  )
  SELECT * FROM vector_hits
  UNION ALL
  SELECT * FROM graph_vector;
$$;

COMMIT;
