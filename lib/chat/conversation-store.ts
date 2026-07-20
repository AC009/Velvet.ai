import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { LOCK_DURATION_HOURS } from "@/lib/chat/constants";
import {
  buildFallbackCharacter,
  isUsableCharacter,
} from "@/lib/chat/character-fallbacks";
import type { Character, Conversation } from "@/lib/types/database";

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) {
    return false;
  }
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42703" ||
    message.includes("character_id") ||
    message.includes("story_id")
  );
}

export async function getOrCreateConversation(
  userId: string,
  worldId: number,
  storyId = "default",
  characterId?: number,
): Promise<Conversation> {
  const supabase = getSupabaseAdmin();
  const scopedCharacterId = characterId ?? null;

  try {
    let findQuery = supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("world_id", worldId)
      .eq("story_id", storyId);

    if (scopedCharacterId !== null) {
      findQuery = findQuery.eq("character_id", scopedCharacterId);
    }

    const { data: existing, error: findError } = await findQuery.maybeSingle();

    const columnMissing = isMissingColumnError(findError);

    if (findError !== null && !columnMissing) {
      console.warn(
        "[getOrCreateConversation] SELECT error, trying fallback path:",
        findError.message,
      );
    }

    if (existing !== null && existing !== undefined) {
      return existing as Conversation;
    }

    if (!columnMissing) {
      const insertPayload: Record<string, unknown> = {
        user_id: userId,
        world_id: worldId,
        story_id: storyId,
      };

      if (scopedCharacterId !== null) {
        insertPayload.character_id = scopedCharacterId;
      }

      const { data: created, error: insertError } = await supabase
        .from("conversations")
        .insert(insertPayload)
        .select("*")
        .single();

      if (created !== null && created !== undefined) {
        return created as Conversation;
      }

      console.warn(
        "[getOrCreateConversation] INSERT failed, retrying SELECT:",
        insertError?.message ?? "unknown",
      );

      let recoveryQuery = supabase
        .from("conversations")
        .select("*")
        .eq("user_id", userId)
        .eq("world_id", worldId)
        .eq("story_id", storyId);

      if (scopedCharacterId !== null) {
        recoveryQuery = recoveryQuery.eq("character_id", scopedCharacterId);
      }

      const { data: recovered, error: recoveryError } =
        await recoveryQuery.maybeSingle();

      if (recovered !== null && recovered !== undefined) {
        return recovered as Conversation;
      }

      if (recoveryError) {
        console.warn(
          "[getOrCreateConversation] Recovery SELECT failed:",
          recoveryError.message,
        );
      }
    }
  } catch (err) {
    console.warn("[getOrCreateConversation] scoped path threw, falling back:", err);
  }

  const { data: worldExisting } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("world_id", worldId)
    .maybeSingle();

  if (worldExisting !== null && worldExisting !== undefined) {
    return worldExisting as Conversation;
  }

  const legacyInsert: Record<string, unknown> = {
    user_id: userId,
    world_id: worldId,
  };

  const { data: worldCreated, error: worldInsertError } = await supabase
    .from("conversations")
    .insert(legacyInsert)
    .select("*")
    .single();

  if (worldCreated !== null && worldCreated !== undefined) {
    return worldCreated as Conversation;
  }

  const { data: worldRetried, error: worldRetryError } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("world_id", worldId)
    .maybeSingle();

  if (worldRetried !== null && worldRetried !== undefined) {
    return worldRetried as Conversation;
  }

  throw new Error(
    `getOrCreateConversation: all attempts exhausted. Last error: ${worldRetryError?.message ?? worldInsertError?.message ?? "unknown"}`,
  );
}

export function isConversationLocked(conversation: Conversation): boolean {
  if (!conversation.locked_until) {
    return false;
  }
  return new Date(conversation.locked_until).getTime() > Date.now();
}

async function upsertFallbackCharacterRecord(character: Character): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("characters").upsert(
      {
        id: character.id,
        world_id: character.world_id,
        name: character.name,
        avatar_url: character.avatar_url,
        system_prompt: character.system_prompt,
        personality: character.personality,
      },
      { onConflict: "id" },
    );

    if (error) {
      console.warn(
        `[getCharacter] fallback upsert failed for ID ${character.id}:`,
        error.message,
      );
    }
  } catch (error) {
    console.warn(
      `[getCharacter] fallback upsert failed for ID ${character.id}:`,
      error,
    );
  }
}

async function resolveCharacterFallback(characterId: number): Promise<Character> {
  console.warn(
    `[getCharacter] ID ${characterId} not found, using fallback Lucien/Kael data schema.`,
  );
  const fallback = buildFallbackCharacter(characterId);
  await upsertFallbackCharacterRecord(fallback);
  return fallback;
}

export async function getCharacter(characterId: number): Promise<Character> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("characters")
      .select("*")
      .eq("id", characterId)
      .maybeSingle();

    if (!error && isUsableCharacter(data as Character)) {
      return data as Character;
    }

    return resolveCharacterFallback(characterId);
  } catch (error) {
    console.warn(
      `[getCharacter] ID ${characterId} lookup failed, using fallback Lucien/Kael data schema.`,
      error,
    );
    return resolveCharacterFallback(characterId);
  }
}

export async function countAssistantMessages(
  conversationId: number,
): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .not("character_id", "is", null);

  if (error) {
    throw new Error(`Failed to count assistant messages: ${error.message}`);
  }

  return count ?? 0;
}

export async function countConversationMessages(
  conversationId: number,
): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  if (error) {
    throw new Error(`Failed to count messages: ${error.message}`);
  }

  return count ?? 0;
}

export async function insertUserMessage(
  conversationId: number,
  content: string,
): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      character_id: null,
      content,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to insert user message: ${error?.message ?? "unknown"}`,
    );
  }

  return data.id as number;
}

export async function insertAssistantMessage(
  conversationId: number,
  characterId: number,
  content: string,
): Promise<number> {
  const supabase = getSupabaseAdmin();

  const fallback = buildFallbackCharacter(characterId);
  const { error: characterUpsertError } = await supabase
    .from("characters")
    .upsert(
      {
        id: fallback.id,
        world_id: fallback.world_id,
        name: fallback.name,
        avatar_url: fallback.avatar_url,
        system_prompt: fallback.system_prompt,
        personality: fallback.personality,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );

  if (characterUpsertError) {
    throw new Error(
      `Failed to ensure character ${characterId} exists before message insert: ${characterUpsertError.message}`,
    );
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, character_id: characterId, content })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to insert assistant message: ${error?.message ?? "unknown"}`,
    );
  }

  return data.id as number;
}

export interface StoredConversationMessage {
  id: number;
  conversation_id: number;
  character_id: number | null;
  content: string;
  created_at: string;
}

export async function fetchConversationMessages(
  conversationId: number,
): Promise<StoredConversationMessage[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, character_id, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch conversation messages: ${error.message}`);
  }

  return (data ?? []) as StoredConversationMessage[];
}

export interface RecentConversationTurn {
  speaker: string;
  content: string;
  timestamp: string;
}

export async function fetchRecentConversationTurns(
  conversationId: number,
  limit = 6,
  characterName = "Character",
): Promise<RecentConversationTurn[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("messages")
    .select("character_id, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch recent conversation turns: ${error.message}`);
  }

  return (data ?? [])
    .reverse()
    .map((row) => ({
      speaker: row.character_id === null ? "User" : characterName,
      content: row.content as string,
      timestamp: row.created_at as string,
    }));
}

export async function applyConversationLock(
  conversationId: number,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const lockedUntil = new Date(
    Date.now() + LOCK_DURATION_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await supabase
    .from("conversations")
    .update({ locked_until: lockedUntil })
    .eq("id", conversationId);

  if (error) {
    throw new Error(`Failed to apply conversation lock: ${error.message}`);
  }

  return lockedUntil;
}

export async function clearConversationLock(
  conversationId: number,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("conversations")
    .update({ locked_until: null })
    .eq("id", conversationId);

  if (error) {
    throw new Error(`Failed to clear conversation lock: ${error.message}`);
  }
}

export async function incrementPaymentIntentClicks(
  conversationId: number,
): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data: current, error: fetchError } = await supabase
    .from("conversations")
    .select("payment_intent_clicks")
    .eq("id", conversationId)
    .single();

  if (fetchError || !current) {
    throw new Error(
      `Failed to fetch conversation for payment intent: ${fetchError?.message ?? "missing"}`,
    );
  }

  const nextCount = (current.payment_intent_clicks as number) + 1;

  const { error: updateError } = await supabase
    .from("conversations")
    .update({ payment_intent_clicks: nextCount })
    .eq("id", conversationId);

  if (updateError) {
    throw new Error(
      `Failed to increment payment intent clicks: ${updateError.message}`,
    );
  }

  return nextCount;
}
