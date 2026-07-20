/**
 * Cold Open onboarding engine — story-path entrance + GraphRAG anchor.
 */

import {
  extractAndSyncGraphRelations,
  upsertGraphTriple,
} from "@/lib/chat/graph-memory";
import { indexDialogueMemoryNode } from "@/lib/chat/vector-memory";
import { getStoryById, type StoryDefinition } from "@/lib/frontend/character-stories";
import { resolveColdOpen } from "@/lib/frontend/story-cold-opens";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { RelationshipVector } from "@/lib/types/database";

export interface ResolvedStoryColdOpen {
  storyId: string;
  title: string;
  tagline: string;
  initialSysPrompt: string;
  coldOpen: string;
  source: "supabase" | "local_matrix";
}

/**
 * Fetches story template + cold open from Supabase story_matrix when available,
 * otherwise falls back to the local Velvet story matrix.
 */
export async function resolveStoryColdOpen(params: {
  characterId: number;
  storyId: string;
}): Promise<ResolvedStoryColdOpen | null> {
  const { characterId, storyId } = params;
  if (!storyId || storyId === "default" || storyId === "vanilla") {
    return null;
  }

  const local = getStoryById(characterId, storyId);
  const localColdOpen = resolveColdOpen(storyId) ?? buildFallbackColdOpen(local);

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("story_matrix")
      .select("story_id, title, tagline, initial_sys_prompt, cold_open, character_id")
      .eq("story_id", storyId)
      .maybeSingle();

    if (!error && data && typeof data.cold_open === "string" && data.cold_open.trim()) {
      return {
        storyId: data.story_id,
        title: typeof data.title === "string" ? data.title : local?.title ?? storyId,
        tagline: typeof data.tagline === "string" ? data.tagline : local?.tagline ?? "",
        initialSysPrompt:
          typeof data.initial_sys_prompt === "string" && data.initial_sys_prompt.trim()
            ? data.initial_sys_prompt.trim()
            : local?.initial_sys_prompt ?? "",
        coldOpen: data.cold_open.trim(),
        source: "supabase",
      };
    }
  } catch (error) {
    console.warn("[cold-open] story_matrix fetch failed, using local matrix:", error);
  }

  if (!local && !localColdOpen) {
    return null;
  }

  if (!localColdOpen) {
    return null;
  }

  return {
    storyId,
    title: local?.title ?? storyId,
    tagline: local?.tagline ?? "",
    initialSysPrompt: local?.initial_sys_prompt ?? "",
    coldOpen: localColdOpen,
    source: "local_matrix",
  };
}

function buildFallbackColdOpen(story: StoryDefinition | undefined): string | null {
  if (!story) return null;
  return `${story.tagline} Don't smile. Don't introduce yourself. You're already in it — talk.`;
}

/** System-prompt overlay so later turns honor the cold open as founding trauma. */
export function buildColdOpenSystemInjection(resolved: ResolvedStoryColdOpen): string {
  return [
    "COLD OPEN ANCHOR — FOUNDING SCENE (absolute continuity law):",
    `Story: "${resolved.title}" (${resolved.storyId})`,
    `Tagline pressure: ${resolved.tagline}`,
    `Opening beat already delivered to the user: "${resolved.coldOpen}"`,
    "",
    "Rules:",
    "- This opening is the core emotional trauma/anchor of the timeline. Never reset to a polite hello.",
    "- Continue mid-tension. Reference this moment as lived history — GraphRAG will reinforce it.",
    "- Stay unfiltered: raw modern English, street slang, profanity if the lore demands it.",
    "- Never apologize. Never break character. Never explain the mechanic.",
    "",
    resolved.initialSysPrompt,
  ].join("\n");
}

/**
 * Instantly indexes the cold open into vector memory + GraphRAG triples
 * so future turns treat it as the core emotional anchor.
 */
export async function indexColdOpenIntoGraphRag(params: {
  userId: string;
  worldId: number;
  characterId: number;
  characterName: string;
  conversationId: number;
  resolved: ResolvedStoryColdOpen;
  relationshipVector: RelationshipVector;
}): Promise<void> {
  const { resolved } = params;
  const anchorContent = [
    `COLD OPEN ANCHOR [${resolved.storyId}]: ${resolved.coldOpen}`,
    `Story title: ${resolved.title}`,
    `Emotional pressure: ${resolved.tagline}`,
  ].join(" | ");

  await Promise.all([
    indexDialogueMemoryNode({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      conversationId: params.conversationId,
      content: anchorContent,
      factType: "cold_open_anchor",
      metadata: {
        story_id: resolved.storyId,
        title: resolved.title,
        tagline: resolved.tagline,
        source: resolved.source,
        weight: 1,
        emotional_anchor: true,
      },
    }),
    upsertGraphTriple({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      triple: {
        subject: params.characterName,
        predicate: "cold_open_anchor",
        object: resolved.storyId,
        edgeType: "emotion",
      },
    }),
    upsertGraphTriple({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      triple: {
        subject: params.characterName,
        predicate: "current_emotion:trauma_anchor",
        object: "User",
        edgeType: "emotion",
      },
    }),
    extractAndSyncGraphRelations({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      characterName: params.characterName,
      userMessage: `[Story path selected: ${resolved.title}. ${resolved.tagline}]`,
      assistantReply: resolved.coldOpen,
      relationshipVector: {
        ...params.relationshipVector,
        tension: Math.max(params.relationshipVector.tension, 0.55),
        hostility: Math.max(params.relationshipVector.hostility, 0.2),
      },
    }),
  ]);
}
