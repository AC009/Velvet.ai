import { getOrCreateConversation } from "@/lib/chat/conversation-store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildQuestLineStoryId,
  resolveQuestLineForWorld,
  type QuestLineId,
} from "@/lib/frontend/quest-line-matrix";

export type RpgSessionState =
  | "onboarding_cold_open"
  | "active_mission"
  | "mission_complete"
  | "paused";

export type QuestStatus = "NONE" | "PENDING" | "COMPLETED" | "UNLOCKED";

export interface UserQuestProfile {
  user_id: string;
  active_mentor_character_id: number;
  active_world_id: number;
  quest_line_id: string | null;
  active_story_id: string;
  session_state: RpgSessionState;
  quest_status: QuestStatus;
  xp_total: number;
  xp_multiplier: number;
  mission_index: number;
  last_verification: string | null;
  verified_quest_count: number;
  consecutive_milestone_streak: number;
  quest_pending_at: string | null;
  last_completed_at: string | null;
  affinity_trust_bonus: number;
  updated_at: string;
}

export interface QuestSessionSnapshot {
  questStatus: QuestStatus;
  xpTotal: number;
  xpMultiplier: number;
  missionIndex: number;
  mentorCharacterId: number;
  worldId: number;
  questLineId: string | null;
  storyId: string;
  sessionState: RpgSessionState;
}

export interface RecruitQuestmasterInput {
  userId: string;
  worldId: number;
  characterId: number;
  questLineId?: QuestLineId | null;
}

export interface RecruitQuestmasterResult {
  mentorCharacterId: number;
  worldId: number;
  questLineId: QuestLineId | null;
  storyId: string;
  sessionState: RpgSessionState;
  conversationId: number;
  readyForColdOpen: boolean;
}

function resolveStoryId(
  characterId: number,
  questLineId: QuestLineId | null,
): string {
  if (questLineId) {
    return buildQuestLineStoryId(questLineId);
  }
  return `mentor:${characterId}`;
}

export async function recruitActiveQuestmaster(
  input: RecruitQuestmasterInput,
): Promise<RecruitQuestmasterResult> {
  const questLineId =
    input.questLineId ??
    resolveQuestLineForWorld(input.worldId)?.questLineId ??
    null;

  const storyId = resolveStoryId(input.characterId, questLineId);
  const sessionState: RpgSessionState = "onboarding_cold_open";
  const supabase = getSupabaseAdmin();

  // Ensure user row exists before mentor FK upsert (OAuth users may skip provision).
  const { error: userUpsertError } = await supabase.from("users").upsert(
    {
      id: input.userId,
      email: `${input.userId}@oauth.velvet.ai`,
      tier: "free",
    },
    { onConflict: "id" },
  );

  if (userUpsertError) {
    console.warn("[rpg-session] user upsert warning:", userUpsertError.message);
  }

  const { error: profileError } = await supabase.from("user_quest_profiles").upsert(
    {
      user_id: input.userId,
      active_mentor_character_id: input.characterId,
      active_world_id: input.worldId,
      quest_line_id: questLineId,
      active_story_id: storyId,
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
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (profileError) {
    throw new Error(
      `Failed to register active questmaster: ${profileError.message}`,
    );
  }

  const conversation = await getOrCreateConversation(
    input.userId,
    input.worldId,
    storyId,
    input.characterId,
  );

  return {
    mentorCharacterId: input.characterId,
    worldId: input.worldId,
    questLineId,
    storyId,
    sessionState,
    conversationId: conversation.id,
    readyForColdOpen: questLineId !== null,
  };
}

export async function getUserQuestProfile(
  userId: string,
): Promise<UserQuestProfile | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_quest_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[rpg-session] profile fetch failed:", error.message);
    return null;
  }

  return (data as UserQuestProfile | null) ?? null;
}

function toQuestSessionSnapshot(profile: UserQuestProfile): QuestSessionSnapshot {
  return {
    questStatus: profile.quest_status ?? "UNLOCKED",
    xpTotal: profile.xp_total ?? 0,
    xpMultiplier: Number(profile.xp_multiplier ?? 1),
    missionIndex: profile.mission_index ?? 1,
    mentorCharacterId: profile.active_mentor_character_id,
    worldId: profile.active_world_id,
    questLineId: profile.quest_line_id,
    storyId: profile.active_story_id,
    sessionState: profile.session_state,
  };
}

export async function getQuestSessionSnapshot(
  userId: string,
): Promise<QuestSessionSnapshot | null> {
  const profile = await getUserQuestProfile(userId);
  if (!profile) {
    return null;
  }
  return toQuestSessionSnapshot(profile);
}

export async function setQuestPending(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("user_quest_profiles")
    .update({
      quest_status: "PENDING",
      session_state: "active_mission",
      quest_pending_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    console.warn("[rpg-session] setQuestPending failed:", error.message);
  }
}

export interface CompleteQuestMissionInput {
  userId: string;
  verification: string;
  xpAwarded: number;
  nextMultiplier: number;
  nextMissionIndex: number;
}

export async function completeQuestMissionRecord(
  input: CompleteQuestMissionInput,
): Promise<UserQuestProfile | null> {
  const supabase = getSupabaseAdmin();
  const profile = await getUserQuestProfile(input.userId);
  if (!profile) {
    return null;
  }

  const nextAffinityBonus = Math.min(
    0.5,
    Number(profile.affinity_trust_bonus ?? 0) + 0.1,
  );

  const { data, error } = await supabase
    .from("user_quest_profiles")
    .update({
      quest_status: "COMPLETED",
      session_state: "mission_complete",
      last_verification: input.verification,
      xp_total: (profile.xp_total ?? 0) + input.xpAwarded,
      xp_multiplier: input.nextMultiplier,
      mission_index: input.nextMissionIndex,
      affinity_trust_bonus: nextAffinityBonus,
      quest_pending_at: null,
      last_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to complete quest mission: ${error.message}`);
  }

  return (data as UserQuestProfile | null) ?? null;
}
