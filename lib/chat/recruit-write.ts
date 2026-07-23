/**
 * Self-healing questmaster recruitment write layer.
 * Never propagates raw Postgres constraint errors to the client.
 */
import {
  getCharacter,
  getOrCreateConversation,
} from "@/lib/chat/conversation-store";
import { WORLD_ID_TO_NAME } from "@/lib/chat/character-fallbacks";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildQuestLineStoryId,
  resolveQuestLineForWorld,
  type QuestLineId,
} from "@/lib/frontend/quest-line-matrix";
import type { Conversation } from "@/lib/types/database";
import type {
  RecruitQuestmasterInput,
  RecruitQuestmasterResult,
  RpgSessionState,
} from "@/lib/chat/rpg-session-store";

/** Horror Mystery + The Watcher — Threshold Realm defaults. */
export const DEFAULT_QUESTMASTER_ID = 8;
export const DEFAULT_WORLD_ID = 3;

function resolveStoryId(
  characterId: number,
  questLineId: QuestLineId | null,
): string {
  if (questLineId) {
    return buildQuestLineStoryId(questLineId);
  }
  return `mentor:${characterId}`;
}

async function softUpsert(
  table: string,
  payload: Record<string, unknown>,
  onConflict: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from(table).upsert(payload, { onConflict });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "upsert failed",
    };
  }
}

async function ensureUserRow(userId: string): Promise<void> {
  const attempts: Record<string, unknown>[] = [
    {
      id: userId,
      email: `${userId}@oauth.velvet.ai`,
      tier: "free",
    },
    {
      id: userId,
      email: `${userId}@oauth.velvet.ai`,
    },
    { id: userId },
  ];

  for (const payload of attempts) {
    const result = await softUpsert("users", payload, "id");
    if (result.ok) {
      return;
    }
    console.warn("[recruit-write] users upsert:", result.error);
  }
}

async function ensureWorldRow(worldId: number): Promise<void> {
  const worldName = WORLD_ID_TO_NAME[worldId] ?? `World ${worldId}`;
  const attempts: Record<string, unknown>[] = [
    { id: worldId, name: worldName, description: `${worldName} narrative realm.` },
    { id: worldId, name: worldName },
    { id: worldId },
  ];

  for (const payload of attempts) {
    const result = await softUpsert("worlds", payload, "id");
    if (result.ok) {
      return;
    }
    console.warn("[recruit-write] worlds upsert:", result.error);
  }
}

/**
 * Build progressive profile payloads covering legacy + modern column aliases
 * (questmaster_id, character_id, active_mentor_character_id, …).
 */
function buildProfilePayloadAttempts(params: {
  userId: string;
  characterId: number;
  worldId: number;
  questLineId: QuestLineId | null;
  storyId: string;
  sessionState: RpgSessionState;
  now: string;
}): Record<string, unknown>[] {
  const {
    userId,
    characterId,
    worldId,
    questLineId,
    storyId,
    sessionState,
    now,
  } = params;

  const full: Record<string, unknown> = {
    user_id: userId,
    id: userId,
    // Modern mentor columns
    active_mentor_character_id: characterId,
    active_world_id: worldId,
    // Legacy / production alias columns that may be NOT NULL
    questmaster_id: characterId,
    character_id: characterId,
    mentor_character_id: characterId,
    mentor_id: characterId,
    world_id: worldId,
    quest_line_id: questLineId,
    active_story_id: storyId,
    story_id: storyId,
    session_state: sessionState,
    quest_status: questLineId ? "NONE" : "UNLOCKED",
    xp_total: 0,
    xp_multiplier: 1.0,
    mission_index: 1,
    verified_quest_count: 0,
    consecutive_milestone_streak: 0,
    quest_pending_at: null,
    last_completed_at: null,
    affinity_trust_bonus: 0,
    arc_progress: 0,
    affinity_score: 50,
    status_tag: "TOXIC ATTRACTION",
    updated_at: now,
    created_at: now,
  };

  const mentorCore: Record<string, unknown> = {
    user_id: userId,
    active_mentor_character_id: characterId,
    active_world_id: worldId,
    questmaster_id: characterId,
    character_id: characterId,
    world_id: worldId,
    active_story_id: storyId,
    session_state: sessionState,
    arc_progress: 0,
    affinity_score: 50,
    status_tag: "TOXIC ATTRACTION",
    updated_at: now,
  };

  const questmasterAlias: Record<string, unknown> = {
    user_id: userId,
    questmaster_id: characterId,
    world_id: worldId,
    arc_progress: 0,
    affinity_score: 50,
    status_tag: "TOXIC ATTRACTION",
  };

  const hardwareOnly: Record<string, unknown> = {
    user_id: userId,
    arc_progress: 0,
    affinity_score: 50,
    status_tag: "TOXIC ATTRACTION",
  };

  const idPkHardware: Record<string, unknown> = {
    id: userId,
    arc_progress: 0,
    affinity_score: 50,
    status_tag: "TOXIC ATTRACTION",
    questmaster_id: characterId,
    character_id: characterId,
  };

  return [full, mentorCore, questmasterAlias, hardwareOnly, idPkHardware];
}

async function upsertQuestProfile(params: {
  userId: string;
  characterId: number;
  worldId: number;
  questLineId: QuestLineId | null;
  storyId: string;
  sessionState: RpgSessionState;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const attempts = buildProfilePayloadAttempts({ ...params, now });

  for (const payload of attempts) {
    // Prefer user_id conflict target; fall back to id PK layouts.
    for (const onConflict of ["user_id", "id"] as const) {
      if (!(onConflict in payload)) {
        continue;
      }
      const result = await softUpsert(
        "user_quest_profiles",
        payload,
        onConflict,
      );
      if (result.ok) {
        return true;
      }
      console.warn(
        `[recruit-write] profile upsert (${onConflict}) failed:`,
        result.error,
      );
    }
  }

  return false;
}

async function safeCreateConversation(
  userId: string,
  worldId: number,
  storyId: string,
  characterId: number,
): Promise<Conversation> {
  try {
    return await getOrCreateConversation(userId, worldId, storyId, characterId);
  } catch (error) {
    console.warn(
      "[recruit-write] conversation create failed, trying minimal insert:",
      error,
    );
  }

  const supabase = getSupabaseAdmin();
  const minimalAttempts: Record<string, unknown>[] = [
    {
      user_id: userId,
      world_id: worldId,
      story_id: storyId,
      character_id: characterId,
      questmaster_id: characterId,
    },
    {
      user_id: userId,
      world_id: worldId,
      story_id: storyId,
      character_id: characterId,
    },
    {
      user_id: userId,
      world_id: worldId,
      story_id: storyId,
    },
    {
      user_id: userId,
      world_id: worldId,
    },
  ];

  for (const payload of minimalAttempts) {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .insert(payload)
        .select("*")
        .maybeSingle();
      if (!error && data) {
        return data as Conversation;
      }
      console.warn("[recruit-write] conversation insert:", error?.message);
    } catch (error) {
      console.warn("[recruit-write] conversation insert threw:", error);
    }
  }

  // Absolute last resort — ephemeral in-memory stub so UI can proceed.
  // Chat init will reconcile a real conversation on next message.
  const stub: Conversation = {
    id: 0,
    user_id: userId,
    world_id: worldId,
    story_id: storyId,
    character_id: characterId,
    questmaster_id: characterId,
    locked_until: null,
    payment_intent_clicks: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return stub;
}

/**
 * Bulletproof recruit — never throws. Always returns a usable session result.
 */
export async function recruitActiveQuestmasterSafe(
  input: RecruitQuestmasterInput,
): Promise<RecruitQuestmasterResult & { degraded: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  const characterId =
    Number.isFinite(input.characterId) && input.characterId > 0
      ? input.characterId
      : DEFAULT_QUESTMASTER_ID;
  const worldId =
    Number.isFinite(input.worldId) && input.worldId > 0
      ? input.worldId
      : DEFAULT_WORLD_ID;

  if (characterId !== input.characterId) {
    warnings.push(
      `characterId missing/invalid — defaulted to Watcher (${DEFAULT_QUESTMASTER_ID}).`,
    );
  }
  if (worldId !== input.worldId) {
    warnings.push(
      `worldId missing/invalid — defaulted to Horror Mystery (${DEFAULT_WORLD_ID}).`,
    );
  }

  const questLineId =
    input.questLineId ??
    resolveQuestLineForWorld(worldId)?.questLineId ??
    null;
  const storyId = resolveStoryId(characterId, questLineId);
  const sessionState: RpgSessionState = "onboarding_cold_open";

  try {
    await ensureUserRow(input.userId);
  } catch (error) {
    warnings.push(
      `user ensure failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  try {
    await ensureWorldRow(worldId);
  } catch (error) {
    warnings.push(
      `world ensure failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  try {
    await getCharacter(characterId);
  } catch (error) {
    warnings.push(
      `character ensure failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  const profileOk = await upsertQuestProfile({
    userId: input.userId,
    characterId,
    worldId,
    questLineId,
    storyId,
    sessionState,
  });
  if (!profileOk) {
    warnings.push(
      "user_quest_profiles upsert exhausted all payload shapes — continuing with conversation.",
    );
  }

  const conversation = await safeCreateConversation(
    input.userId,
    worldId,
    storyId,
    characterId,
  );

  return {
    mentorCharacterId: characterId,
    worldId,
    questLineId,
    storyId,
    sessionState,
    conversationId: conversation.id,
    readyForColdOpen: questLineId !== null,
    degraded: warnings.length > 0 || !profileOk || conversation.id === 0,
    warnings,
  };
}
