import { getOrCreateConversation, getCharacter } from "@/lib/chat/conversation-store";
import { WORLD_ID_TO_NAME } from "@/lib/chat/character-fallbacks";
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

export type EmpathyModeTag = "STANDARD" | "RECOVERY" | "FOCUS";

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
  arc_progress: number;
  affinity_score: number;
  status_tag: "TOXIC ATTRACTION" | "RESPECT";
  last_energy_level: number | null;
  empathy_mode: EmpathyModeTag;
  empathy_checkin_count: number;
  last_empathy_at: string | null;
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
  const now = new Date().toISOString();

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

  // Ensure world + character FK targets exist (seed may be empty on fresh prod).
  const worldName =
    WORLD_ID_TO_NAME[input.worldId] ?? `World ${input.worldId}`;
  {
    const { error: worldError } = await supabase.from("worlds").upsert(
      {
        id: input.worldId,
        name: worldName,
      },
      { onConflict: "id" },
    );
    if (worldError) {
      console.warn("[rpg-session] world upsert warning:", worldError.message);
    }
  }

  // Ensures a characters row exists (fallback upsert when seed is empty).
  await getCharacter(input.characterId);

  const fullProfilePayload: Record<string, unknown> = {
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
    arc_progress: 0,
    affinity_score: 50,
    status_tag: "TOXIC ATTRACTION",
    updated_at: now,
  };

  // Minimal payload for DBs that only have hardware columns + session core.
  const minimalProfilePayload: Record<string, unknown> = {
    user_id: input.userId,
    active_mentor_character_id: input.characterId,
    active_world_id: input.worldId,
    active_story_id: storyId,
    session_state: sessionState,
    arc_progress: 0,
    affinity_score: 50,
    status_tag: "TOXIC ATTRACTION",
    updated_at: now,
  };

  const hardwareOnlyPayload: Record<string, unknown> = {
    user_id: input.userId,
    arc_progress: 0,
    affinity_score: 50,
    status_tag: "TOXIC ATTRACTION",
  };

  let profileErrorMessage: string | null = null;
  for (const payload of [
    fullProfilePayload,
    minimalProfilePayload,
    hardwareOnlyPayload,
  ]) {
    const { error } = await supabase
      .from("user_quest_profiles")
      .upsert(payload, { onConflict: "user_id" });
    if (!error) {
      profileErrorMessage = null;
      break;
    }
    profileErrorMessage = error.message;
    console.warn(
      "[rpg-session] profile upsert attempt failed:",
      error.message,
    );
  }

  if (profileErrorMessage) {
    throw new Error(
      `Failed to register active questmaster: ${profileErrorMessage}`,
    );
  }

  let conversation;
  try {
    conversation = await getOrCreateConversation(
      input.userId,
      input.worldId,
      storyId,
      input.characterId,
    );
  } catch (error) {
    console.error(
      "[rpg-session] getOrCreateConversation failed — degraded stub:",
      error,
    );
    conversation = {
      id: 0,
      user_id: input.userId,
      world_id: input.worldId,
      story_id: storyId,
      character_id: input.characterId,
      questmaster_id: input.characterId,
      locked_until: null,
      payment_intent_clicks: 0,
      created_at: now,
      updated_at: now,
    };
  }

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

  if (!data) {
    return null;
  }

  const row = data as Record<string, unknown>;
  return {
    user_id: String(row.user_id ?? userId),
    active_mentor_character_id: Number(row.active_mentor_character_id ?? 0),
    active_world_id: Number(row.active_world_id ?? 0),
    quest_line_id: (row.quest_line_id as string | null) ?? null,
    active_story_id: String(row.active_story_id ?? "default"),
    session_state:
      (row.session_state as UserQuestProfile["session_state"]) ??
      "onboarding_cold_open",
    quest_status:
      (row.quest_status as UserQuestProfile["quest_status"]) ?? "UNLOCKED",
    xp_total: Number(row.xp_total ?? 0),
    xp_multiplier: Number(row.xp_multiplier ?? 1),
    mission_index: Number(row.mission_index ?? 1),
    last_verification: (row.last_verification as string | null) ?? null,
    verified_quest_count: Number(row.verified_quest_count ?? 0),
    consecutive_milestone_streak: Number(
      row.consecutive_milestone_streak ?? 0,
    ),
    quest_pending_at: (row.quest_pending_at as string | null) ?? null,
    last_completed_at: (row.last_completed_at as string | null) ?? null,
    affinity_trust_bonus: Number(row.affinity_trust_bonus ?? 0),
    arc_progress: Number(row.arc_progress ?? 0),
    affinity_score: Number(row.affinity_score ?? 50),
    status_tag:
      (row.status_tag as UserQuestProfile["status_tag"]) ?? "TOXIC ATTRACTION",
    last_energy_level:
      row.last_energy_level === null || row.last_energy_level === undefined
        ? null
        : Number(row.last_energy_level),
    empathy_mode:
      row.empathy_mode === "RECOVERY"
        ? "RECOVERY"
        : row.empathy_mode === "FOCUS"
          ? "FOCUS"
          : "STANDARD",
    empathy_checkin_count: Number(row.empathy_checkin_count ?? 0),
    last_empathy_at: (row.last_empathy_at as string | null) ?? null,
    updated_at: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

/** Ensure a quest profile row exists for auth user id (canonical user_id PK). */
export async function ensureMissionQuestProfile(
  userId: string,
): Promise<UserQuestProfile> {
  const existing = await getUserQuestProfile(userId);
  if (existing) {
    return existing;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("user_quest_profiles").upsert(
    {
      user_id: userId,
      arc_progress: 0,
      affinity_score: 50,
      status_tag: "TOXIC ATTRACTION",
      active_story_id: "default",
      session_state: "onboarding_cold_open",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(`Failed to create quest profile: ${error.message}`);
  }

  const created = await getUserQuestProfile(userId);
  if (!created) {
    throw new Error("Quest profile upsert succeeded but row could not be read.");
  }

  return created;
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

const ARC_PROGRESS_REWARD = 25;
const AFFINITY_SCORE_REWARD = 10;
const RESPECT_AFFINITY_THRESHOLD = 60;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function resolveStatusTag(
  affinityScore: number,
): "TOXIC ATTRACTION" | "RESPECT" {
  return affinityScore >= RESPECT_AFFINITY_THRESHOLD
    ? "RESPECT"
    : "TOXIC ATTRACTION";
}

export interface MissionVerificationRewardResult {
  profile: UserQuestProfile;
  arcProgress: number;
  affinityScore: number;
  statusTag: "TOXIC ATTRACTION" | "RESPECT";
  previousArcProgress: number;
  previousAffinityScore: number;
}

/**
 * Hardware-verified mission rewards:
 * - ARC progress +25% (cap 100)
 * - Affinity score +10 (cap 100) → status RESPECT at >= 60, else TOXIC ATTRACTION
 */
export async function applyHardwareMissionRewards(
  userId: string,
  _verificationNote: string,
): Promise<MissionVerificationRewardResult> {
  const profile = await ensureMissionQuestProfile(userId);

  const previousArcProgress = clampPercent(Number(profile.arc_progress ?? 0));
  const previousAffinityScore = clampPercent(
    Number(profile.affinity_score ?? 50),
  );
  const nextArcProgress = clampPercent(
    previousArcProgress + ARC_PROGRESS_REWARD,
  );
  const nextAffinityScore = clampPercent(
    previousAffinityScore + AFFINITY_SCORE_REWARD,
  );
  const nextStatusTag = resolveStatusTag(nextAffinityScore);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_quest_profiles")
    .update({
      arc_progress: nextArcProgress,
      affinity_score: nextAffinityScore,
      status_tag: nextStatusTag,
      last_verification: _verificationNote,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to sync mission rewards to database: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error("Mission reward update returned no profile row.");
  }

  const updated = await getUserQuestProfile(userId);
  if (!updated) {
    throw new Error("Mission reward update succeeded but profile re-read failed.");
  }

  return {
    profile: updated,
    arcProgress: clampPercent(Number(updated.arc_progress ?? nextArcProgress)),
    affinityScore: clampPercent(
      Number(updated.affinity_score ?? nextAffinityScore),
    ),
    statusTag: updated.status_tag ?? nextStatusTag,
    previousArcProgress,
    previousAffinityScore,
  };
}

export interface EmpathyCheckInInput {
  userId: string;
  energyLevel: 1 | 2 | 3 | 4 | 5;
  empathyMode: EmpathyModeTag;
  note?: string;
}

/**
 * Persist Human Check-In energy + empathy routing onto user_quest_profiles.
 * Soft-fails missing columns so older DBs without migration 017 still unlock.
 */
export async function logEmpathyCheckIn(
  input: EmpathyCheckInInput,
): Promise<UserQuestProfile> {
  const profile = await ensureMissionQuestProfile(input.userId);
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const nextCount = Number(profile.empathy_checkin_count ?? 0) + 1;
  const note =
    input.note ?? `EMPATHY:${input.empathyMode}:E${input.energyLevel}`;

  const attempts: Record<string, unknown>[] = [
    {
      last_energy_level: input.energyLevel,
      empathy_mode: input.empathyMode,
      empathy_checkin_count: nextCount,
      last_empathy_at: now,
      last_verification: note,
    },
    {
      last_energy_level: input.energyLevel,
      empathy_mode: input.empathyMode,
      empathy_checkin_count: nextCount,
      last_empathy_at: now,
    },
    {
      last_verification: note,
    },
  ];

  let lastError: string | null = null;
  for (const payload of attempts) {
    const { error } = await supabase
      .from("user_quest_profiles")
      .update(payload)
      .eq("user_id", input.userId);
    if (!error) {
      const updated = await getUserQuestProfile(input.userId);
      return updated ?? profile;
    }
    lastError = error.message;
  }

  console.warn("[rpg-session] empathy log failed:", lastError);
  return profile;
}
