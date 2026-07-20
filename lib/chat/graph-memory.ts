import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { completeRoutedLlm } from "@/lib/chat/llm-provider";
import { resolveInferenceRoute } from "@/lib/chat/model-router";
import { embedText, hashEmbed } from "@/lib/chat/vector-memory";
import type { RelationshipVector } from "@/lib/types/database";

export interface GraphHybridRow {
  source: "vector" | "graph";
  subject: string | null;
  predicate: string | null;
  object: string | null;
  edge_type: string;
  content: string;
  weight: number;
  similarity: number;
}

export interface GraphTriple {
  subject: string;
  predicate: string;
  object: string;
  edgeType: "relation" | "emotion";
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "are", "was", "were", "this",
  "that", "have", "has", "had", "but", "not", "what", "when", "why", "how",
  "who", "she", "him", "her", "his", "they", "them", "into", "from", "about",
  "just", "like", "yeah", "okay", "will", "would", "could", "should",
]);

const EMOTION_LEXICON: Record<string, string> = {
  angry: "anger",
  furious: "anger",
  mad: "anger",
  scared: "fear",
  afraid: "fear",
  terrified: "fear",
  anxious: "fear",
  sad: "sadness",
  hurt: "sadness",
  betrayed: "betrayal",
  jealous: "jealousy",
  love: "love",
  trust: "trust",
  frustrated: "frustration",
  frustration: "frustration",
  excited: "excitement",
  happy: "joy",
};

export interface ExtractedIntent {
  keywords: string[];
  entities: string[];
  emotions: string[];
}

export function extractSemanticEntities(text: string): ExtractedIntent {
  const normalized = text.replace(/\s+/g, " ").trim();
  const tokens = normalized.split(/\s+/);

  const entities: string[] = [];
  const keywords: string[] = [];
  const emotions: string[] = [];

  for (const rawToken of tokens) {
    const clean = rawToken.replace(/[^\w'-]/g, "");
    if (clean.length < 3) {
      continue;
    }
    const lower = clean.toLowerCase();

    if (EMOTION_LEXICON[lower]) {
      emotions.push(EMOTION_LEXICON[lower]);
    }

    if (/^[A-Z][a-zA-Z]+$/.test(clean)) {
      entities.push(clean);
    }

    if (!STOPWORDS.has(lower)) {
      keywords.push(lower);
    }
  }

  return {
    keywords: Array.from(new Set(keywords)).slice(0, 12),
    entities: Array.from(new Set(entities)).slice(0, 8),
    emotions: Array.from(new Set(emotions)).slice(0, 4),
  };
}

/**
 * Single batched round-trip: pgvector matches + traversed graph sub-clusters.
 * Falls back to a bounded edge scan if the RPC is unavailable.
 */
export async function traverseGraphMemory(params: {
  userId: string;
  worldId: number;
  characterId: number;
  query: string;
  matchCount?: number;
}): Promise<GraphHybridRow[]> {
  const supabase = getSupabaseAdmin();
  const matchCount = params.matchCount ?? 5;
  const intent = extractSemanticEntities(params.query);
  const keywordQuery = [...intent.entities, ...intent.keywords]
    .slice(0, 10)
    .join(" ");
  const embedding = await embedText(params.query);

  const { data, error } = await supabase.rpc("graphrag_hybrid_query", {
    p_user_id: params.userId,
    p_world_id: params.worldId,
    p_character_id: params.characterId,
    p_query_embedding: `[${embedding.join(",")}]`,
    p_keywords: keywordQuery,
    p_match_count: matchCount,
  });

  if (error) {
    console.warn("[graph-memory] hybrid RPC failed:", error.message);
    return fallbackEdgeScan({ ...params, keywords: intent });
  }

  return (data ?? []) as GraphHybridRow[];
}

async function fallbackEdgeScan(params: {
  userId: string;
  worldId: number;
  characterId: number;
  keywords: ExtractedIntent;
}): Promise<GraphHybridRow[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("memory_graph_edges")
    .select("subject, predicate, object, edge_type, weight")
    .eq("user_id", params.userId)
    .eq("world_id", params.worldId)
    .or(`character_id.eq.${params.characterId},character_id.is.null`)
    .order("weight", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(10);

  const tokens = [...params.keywords.entities, ...params.keywords.keywords].slice(0, 6);
  if (tokens.length > 0) {
    const orFilter = tokens
      .map((token) => `subject.ilike.%${token}%,object.ilike.%${token}%`)
      .join(",");
    query = query.or(orFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[graph-memory] fallback edge scan failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    source: "graph" as const,
    subject: row.subject as string,
    predicate: row.predicate as string,
    object: row.object as string,
    edge_type: (row.edge_type as string) ?? "relation",
    content: `${row.subject} -> (${row.predicate}) -> ${row.object}`,
    weight: (row.weight as number) ?? 1,
    similarity: 0.5,
  }));
}

export function synthesizeGraphMemoryPayload(rows: GraphHybridRow[]): string {
  if (rows.length === 0) {
    return "No structured graph memory matched this turn.";
  }

  const vectorRows = rows.filter((row) => row.source === "vector");
  const graphRows = rows.filter((row) => row.source === "graph");

  const sections: string[] = [];

  if (graphRows.length > 0) {
    sections.push(
      "RELATIONAL GRAPH PATHS (entity-relation-emotion triples):",
      ...graphRows
        .sort((a, b) => b.weight - a.weight)
        .map(
          (row, index) =>
            `${index + 1}. [${row.edge_type}; w=${row.weight.toFixed(1)}] ${row.content}`,
        ),
    );
  }

  if (vectorRows.length > 0) {
    sections.push(
      "",
      "SEMANTIC VECTOR MATCHES (top relevance):",
      ...vectorRows
        .sort((a, b) => b.similarity - a.similarity)
        .map(
          (row, index) =>
            `${index + 1}. [score=${row.similarity.toFixed(3)}] ${row.content}`,
        ),
    );
  }

  return sections.join("\n");
}

interface RawTriple {
  subject?: unknown;
  predicate?: unknown;
  object?: unknown;
  type?: unknown;
}

function parseTriplePayload(raw: string): GraphTriple[] {
  const start = raw.indexOf("{");
  const candidate = start >= 0 ? raw.slice(start) : raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return [];
  }

  const list =
    parsed && typeof parsed === "object" && "triples" in parsed
      ? (parsed as { triples: unknown }).triples
      : parsed;

  if (!Array.isArray(list)) {
    return [];
  }

  const triples: GraphTriple[] = [];
  for (const item of list.slice(0, 8)) {
    const raw = item as RawTriple;
    const subject = String(raw.subject ?? "").trim();
    const predicate = String(raw.predicate ?? "").trim();
    const object = String(raw.object ?? "").trim();
    if (!subject || !predicate || !object) {
      continue;
    }
    const edgeType =
      String(raw.type ?? "relation").toLowerCase() === "emotion"
        ? "emotion"
        : "relation";
    triples.push({
      subject: subject.slice(0, 120),
      predicate: predicate.slice(0, 60),
      object: object.slice(0, 120),
      edgeType,
    });
  }
  return triples;
}

export async function upsertGraphTriple(params: {
  userId: string;
  worldId: number;
  characterId: number;
  triple: GraphTriple;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const embedding = hashEmbed(
    `${params.triple.subject} ${params.triple.predicate} ${params.triple.object}`,
  );

  const { error } = await supabase.rpc("upsert_graph_edge", {
    p_user_id: params.userId,
    p_world_id: params.worldId,
    p_character_id: params.characterId,
    p_subject: params.triple.subject,
    p_predicate: params.triple.predicate,
    p_object: params.triple.object,
    p_edge_type: params.triple.edgeType,
    p_metadata: { indexed_at: new Date().toISOString() },
    p_embedding: `[${embedding.join(",")}]`,
  });

  if (error) {
    console.warn("[graph-memory] triple upsert failed:", error.message);
  }
}

/**
 * Async background worker — analyzes the latest exchange, extracts new
 * facts / shifting emotional parameters, and writes formal graph triples.
 * Duplicate relations are upserted safely (weight + timestamp drift).
 */
export async function extractAndSyncGraphRelations(params: {
  userId: string;
  worldId: number;
  characterId: number;
  characterName: string;
  userMessage: string;
  assistantReply: string;
  relationshipVector: RelationshipVector;
}): Promise<void> {
  const heuristicTriples = heuristicExtract(params);

  let llmTriples: GraphTriple[] = [];
  try {
    const route = resolveInferenceRoute({
      userMessage: params.userMessage,
      messageCount: 2,
      relationshipVector: params.relationshipVector,
      isOptionSelection: true,
    });

    const raw = await completeRoutedLlm(
      [
        {
          role: "system",
          content: [
            "You are a GraphRAG relation extractor. Read the exchange and output ONLY JSON.",
            'Format: {"triples":[{"subject":"User","predicate":"employed_at","object":"Company XYZ","type":"relation"}]}',
            "Rules: subject is usually 'User' or the character. predicate is a snake_case action/relation or 'current_emotion:<emotion>'.",
            "type is 'relation' or 'emotion'. Extract at most 5 concrete, durable facts. No speculation.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Character: ${params.characterName}`,
            `User said: ${params.userMessage}`,
            `${params.characterName} said: ${params.assistantReply}`,
            "",
            "Extract durable graph triples now.",
          ].join("\n"),
        },
      ],
      route,
      { maxTokens: 220, jsonMode: true },
    );
    llmTriples = parseTriplePayload(raw);
  } catch (error) {
    console.warn("[graph-memory] LLM triple extraction failed:", error);
  }

  const deduped = new Map<string, GraphTriple>();
  for (const triple of [...heuristicTriples, ...llmTriples]) {
    const key = `${triple.subject.toLowerCase()}|${triple.predicate.toLowerCase()}|${triple.object.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, triple);
    }
  }

  await Promise.all(
    Array.from(deduped.values()).map((triple) =>
      upsertGraphTriple({
        userId: params.userId,
        worldId: params.worldId,
        characterId: params.characterId,
        triple,
      }),
    ),
  );
}

function heuristicExtract(params: {
  userMessage: string;
  characterName: string;
  relationshipVector: RelationshipVector;
}): GraphTriple[] {
  const triples: GraphTriple[] = [];
  const intent = extractSemanticEntities(params.userMessage);

  for (const emotion of intent.emotions) {
    triples.push({
      subject: "User",
      predicate: `current_emotion:${emotion}`,
      object: params.characterName,
      edgeType: "emotion",
    });
  }

  const employMatch = params.userMessage.match(
    /\b(?:work(?:s|ing)?\s+(?:at|for)|employed\s+at|job\s+at)\s+([A-Z][\w& ]{1,40})/i,
  );
  if (employMatch?.[1]) {
    triples.push({
      subject: "User",
      predicate: "employed_at",
      object: employMatch[1].trim(),
      edgeType: "relation",
    });
  }

  const { affinity, hostility } = params.relationshipVector;
  if (affinity >= 65) {
    triples.push({
      subject: "User",
      predicate: "current_emotion:affinity",
      object: params.characterName,
      edgeType: "emotion",
    });
  } else if (hostility >= 55) {
    triples.push({
      subject: "User",
      predicate: "current_emotion:hostility",
      object: params.characterName,
      edgeType: "emotion",
    });
  }

  return triples;
}

export async function recordProactiveAmbientContact(params: {
  userId: string;
  worldId: number;
  characterId: number;
  characterName: string;
  conversationId: number;
  checkInMessage: string;
  ambientContext: Record<string, unknown>;
}): Promise<void> {
  await upsertGraphTriple({
    userId: params.userId,
    worldId: params.worldId,
    characterId: params.characterId,
    triple: {
      subject: params.characterName,
      predicate: "initiated_contact:ambient_ping",
      object: "User",
      edgeType: "relation",
    },
  });

  const { indexDialogueMemoryNode } = await import("@/lib/chat/vector-memory");
  await indexDialogueMemoryNode({
    userId: params.userId,
    worldId: params.worldId,
    characterId: params.characterId,
    conversationId: params.conversationId,
    content: params.checkInMessage,
    factType: "proactive_ambient_ping",
    metadata: {
      source: "proactive_cron",
      ambient: params.ambientContext,
    },
  });

  const { insertAssistantMessage } = await import("@/lib/chat/conversation-store");
  await insertAssistantMessage(
    params.conversationId,
    params.characterId,
    params.checkInMessage,
  );
}
