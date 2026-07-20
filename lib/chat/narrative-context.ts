import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { GLOBAL_NARRATIVE_LIMIT, SMS_COMMS_FORMATTING_LAWS } from "@/lib/chat/constants";
import {
  buildEmotionalTrajectoryBlock,
  type EmotionalTrajectory,
} from "@/lib/chat/emotional-engine";
import { buildUnfilteredPersonaBlock } from "@/lib/chat/unfiltered-persona";
import type {
  GlobalNarrativeMessage,
  LlmMessage,
  NarrativeContextEntry,
} from "@/lib/types/database";

export async function fetchGlobalNarrativeHistory(
  worldId: number,
  limit = GLOBAL_NARRATIVE_LIMIT,
): Promise<GlobalNarrativeMessage[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc("get_world_narrative_history", {
    p_world_id: worldId,
    p_limit: limit,
  });

  if (error) {
    throw new Error(
      `Failed to fetch global narrative history: ${error.message}`,
    );
  }

  const rows = (data ?? []) as GlobalNarrativeMessage[];
  return rows.reverse();
}

export function buildChronologicalContext(
  history: GlobalNarrativeMessage[],
  currentCharacterId?: number,
): NarrativeContextEntry[] {
  const scoped =
    currentCharacterId !== undefined
      ? history.filter(
          (entry) =>
            entry.character_id === null ||
            entry.character_id === currentCharacterId,
        )
      : history;

  return scoped.map((entry) => ({
    role: entry.character_id === null ? "user" : "assistant",
    speaker:
      entry.character_id === null
        ? "User"
        : (entry.character_name ?? "Character"),
    content: entry.content,
    timestamp: entry.created_at,
  }));
}

export function formatNarrativeContextBlock(
  context: NarrativeContextEntry[],
): string {
  if (context.length === 0) {
    return "No prior narrative events in this world.";
  }

  return context
    .map(
      (entry) =>
        `[${entry.timestamp}] ${entry.speaker}: ${entry.content}`,
    )
    .join("\n");
}

export function buildLlmMessages(params: {
  systemPrompt: string;
  narrativeIntelligencePrompt: string;
  memoryBlock: string;
  recentTurnsBlock: string;
  userMessage: string;
  respondingCharacterName: string;
  currentCharacterId: number;
  emotionalTrajectory?: EmotionalTrajectory;
}): LlmMessage[] {
  // Unfiltered persona + emotional trajectory land in the same system turn
  // as GraphRAG so raw affect and long-term memory co-author the reply.
  const unfilteredBlock = buildUnfilteredPersonaBlock({
    characterName: params.respondingCharacterName,
    personaSignals: [
      params.systemPrompt,
      params.narrativeIntelligencePrompt,
    ].join("\n"),
  });

  const emotionalBlock = params.emotionalTrajectory
    ? buildEmotionalTrajectoryBlock(
        params.emotionalTrajectory,
        params.respondingCharacterName,
      )
    : null;

  return [
    {
      role: "system",
      content: params.systemPrompt,
    },
    {
      role: "system",
      content: params.narrativeIntelligencePrompt,
    },
    {
      role: "system",
      content: SMS_COMMS_FORMATTING_LAWS,
    },
    {
      role: "system",
      content: [
        `CHARACTER LOCK — ABSOLUTE: You are ${params.respondingCharacterName} and ONLY ${params.respondingCharacterName}.`,
        "Never speak as, impersonate, or quote any other character by name.",
        "Do not reference other characters' storylines, secrets, or relationships unless the user explicitly brings them up in THIS conversation.",
        "Your personality matrix is locked to your system prompt. No cross-contamination.",
        "",
        unfilteredBlock,
        "",
        // Emotional Subtext & Trajectory sits RIGHT OVER vector/GraphRAG memory.
        emotionalBlock,
        "",
        "HYBRID VECTOR / GRAPHRAG MEMORY (authoritative relationship facts — apply THROUGH the emotional state above):",
        params.memoryBlock,
        "",
        "RECENT THREAD (last turns only — continuity anchor):",
        params.recentTurnsBlock,
        "",
        `Respond in-character as ${params.respondingCharacterName}. SMS/comms format only. One short message. Let the dominant emotional node drive the beat. Never apologize. Never break character.`,
      ]
        .filter((line) => line !== null)
        .join("\n"),
    },
    {
      role: "user",
      content: params.userMessage,
    },
  ];
}
