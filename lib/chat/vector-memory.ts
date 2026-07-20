import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const VECTOR_EMBED_DIMS = 384;
export const VECTOR_MEMORY_TOP_K = 5;

export interface RelationshipMemoryNode {
  id: number;
  content: string;
  fact_type: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface IndexMemoryNodeParams {
  userId: string;
  worldId: number;
  characterId: number;
  conversationId: number;
  content: string;
  factType?: string;
  metadata?: Record<string, unknown>;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Deterministic fallback embed when no external embedding API is configured. */
export function hashEmbed(text: string, dims = VECTOR_EMBED_DIMS): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = normalizeText(text)
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 1);

  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    vec[Math.abs(hash) % dims] += 1;
  }

  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vec.map((value) => value / norm);
}

async function embedWithTogether(text: string): Promise<number[] | null> {
  const apiKey = process.env.TOGETHER_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const response = await fetch("https://api.together.xyz/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "togethercomputer/m2-bert-80M-8k-retrieval",
      input: text,
    }),
  });

  if (!response.ok) {
    console.warn(
      `[vector-memory] Together embedding failed (${response.status})`,
    );
    return null;
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = payload.data?.[0]?.embedding;
  if (!embedding || embedding.length === 0) {
    return null;
  }

  if (embedding.length === VECTOR_EMBED_DIMS) {
    return embedding;
  }

  return embedding.slice(0, VECTOR_EMBED_DIMS);
}

export async function embedText(text: string): Promise<number[]> {
  const normalized = normalizeText(text);
  if (normalized.length === 0) {
    return hashEmbed("empty", VECTOR_EMBED_DIMS);
  }

  try {
    const togetherEmbedding = await embedWithTogether(normalized);
    if (togetherEmbedding) {
      return togetherEmbedding;
    }
  } catch (error) {
    console.warn("[vector-memory] embedding provider error:", error);
  }

  return hashEmbed(normalized, VECTOR_EMBED_DIMS);
}

function formatEmbeddingForPg(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

async function lexicalFallbackSearch(params: {
  userId: string;
  worldId: number;
  characterId: number;
  query: string;
  limit: number;
}): Promise<RelationshipMemoryNode[]> {
  const supabase = getSupabaseAdmin();
  const tokens = normalizeText(params.query)
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 2)
    .slice(0, 6);

  let query = supabase
    .from("relationship_memory_nodes")
    .select("id, content, fact_type, metadata")
    .eq("user_id", params.userId)
    .eq("world_id", params.worldId)
    .or(`character_id.eq.${params.characterId},character_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(Math.max(params.limit * 4, 12));

  if (tokens.length > 0) {
    const orFilter = tokens
      .map((token) => `content.ilike.%${token}%`)
      .join(",");
    query = query.or(orFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.warn("[vector-memory] lexical fallback failed:", error.message);
    return [];
  }

  return (data ?? []).slice(0, params.limit).map((row, index) => ({
    id: row.id as number,
    content: row.content as string,
    fact_type: (row.fact_type as string) ?? "dialogue",
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    similarity: 1 - index * 0.05,
  }));
}

export async function searchRelevantMemoryNodes(params: {
  userId: string;
  worldId: number;
  characterId: number;
  query: string;
  limit?: number;
}): Promise<RelationshipMemoryNode[]> {
  const limit = params.limit ?? VECTOR_MEMORY_TOP_K;
  const supabase = getSupabaseAdmin();
  const embedding = await embedText(params.query);

  const { data, error } = await supabase.rpc("match_relationship_memory", {
    p_user_id: params.userId,
    p_world_id: params.worldId,
    p_character_id: params.characterId,
    p_query_embedding: formatEmbeddingForPg(embedding),
    p_match_count: limit,
  });

  if (error) {
    console.warn("[vector-memory] pgvector search failed:", error.message);
    return lexicalFallbackSearch({ ...params, limit });
  }

  const rows = (data ?? []) as RelationshipMemoryNode[];
  if (rows.length > 0) {
    return rows;
  }

  return lexicalFallbackSearch({ ...params, limit });
}

export async function indexDialogueMemoryNode(
  params: IndexMemoryNodeParams,
): Promise<void> {
  const content = normalizeText(params.content);
  if (content.length === 0) {
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const embedding = await embedText(content);

    const { error } = await supabase.from("relationship_memory_nodes").insert({
      user_id: params.userId,
      world_id: params.worldId,
      character_id: params.characterId,
      conversation_id: params.conversationId,
      fact_type: params.factType ?? "dialogue",
      content,
      metadata: params.metadata ?? {},
      embedding: formatEmbeddingForPg(embedding),
    });

    if (error) {
      console.warn("[vector-memory] index insert failed:", error.message);
    }
  } catch (error) {
    console.warn("[vector-memory] index failed:", error);
  }
}

export function formatVectorMemoryBlock(nodes: RelationshipMemoryNode[]): string {
  if (nodes.length === 0) {
    return "No indexed relationship memory matched this turn.";
  }

  return nodes
    .map(
      (node, index) =>
        `${index + 1}. [${node.fact_type}; score=${node.similarity.toFixed(3)}] ${node.content}`,
    )
    .join("\n");
}

/** GraphRAG quest completion nodes for DISCOVERED SECRETS vault feed. */
export async function fetchQuestCompletionMemoryNodes(params: {
  userId: string;
  worldId: number;
  characterId: number;
  limit?: number;
}): Promise<RelationshipMemoryNode[]> {
  const limit = params.limit ?? 6;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("relationship_memory_nodes")
    .select("id, content, fact_type, metadata")
    .eq("user_id", params.userId)
    .eq("world_id", params.worldId)
    .eq("character_id", params.characterId)
    .eq("fact_type", "quest_completion")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[vector-memory] quest completion fetch failed:", error.message);
    return [];
  }

  return (data ?? []).map((row, index) => ({
    id: row.id as number,
    content: row.content as string,
    fact_type: (row.fact_type as string) ?? "quest_completion",
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    similarity: 1 - index * 0.04,
  }));
}

export function formatRecentTurnsBlock(
  turns: Array<{ speaker: string; content: string; timestamp: string }>,
): string {
  if (turns.length === 0) {
    return "No recent thread turns.";
  }

  return turns
    .map((turn) => `[${turn.timestamp}] ${turn.speaker}: ${turn.content}`)
    .join("\n");
}
