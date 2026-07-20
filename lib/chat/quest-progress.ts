/**
 * Server-side RPG progress snapshot for Memories vault + achievement tracker.
 */

import {
  areDiscoveredSecretsUnlocked,
  formatMilestoneSecretLabel,
  isDeepestSinUnlocked,
  resolveQuestPunctuality,
  trustToAffinityPercent,
  type QuestPunctualityState,
} from "@/lib/chat/quest-progress-constants";
import { resolveQuestThoughtStream } from "@/lib/chat/quest-thought-stream";
import { applyPersistedAffinityBonus } from "@/lib/chat/quest-guard";
import {
  getUserQuestProfile,
  type UserQuestProfile,
} from "@/lib/chat/rpg-session-store";
import { fetchQuestCompletionMemoryNodes } from "@/lib/chat/vector-memory";
import type { QuestLineId } from "@/lib/frontend/quest-line-matrix";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface QuestProgressSnapshot {
  verifiedQuestCount: number;
  consecutiveMilestoneStreak: number;
  secretsUnlocked: boolean;
  discoveredSecrets: string[];
  currentThought: string;
  deepestSinUnlocked: boolean;
  punctuality: QuestPunctualityState;
  questStatus: string;
  xpTotal: number;
  missionIndex: number;
  /** Server-authoritative affinity % (includes persisted quest bonuses). */
  affinityPercent: number;
}

interface QuestMilestoneRow {
  secret_label: string;
  verification: string;
  mission_index: number;
}

function parseQuestLineId(value: string | null): QuestLineId | null {
  if (
    value === "cognitive_focus" ||
    value === "physical_discipline" ||
    value === "social_charisma" ||
    value === "grit_comfort_zone"
  ) {
    return value;
  }
  return null;
}

async function resetStreakIfOverdue(profile: UserQuestProfile): Promise<UserQuestProfile> {
  const punctuality = resolveQuestPunctuality({
    questStatus: profile.quest_status ?? "UNLOCKED",
    questPendingAt: profile.quest_pending_at ?? null,
    lastCompletedAt: profile.last_completed_at ?? null,
  });

  if (punctuality !== "overdue" || (profile.consecutive_milestone_streak ?? 0) === 0) {
    return profile;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_quest_profiles")
    .update({
      consecutive_milestone_streak: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", profile.user_id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.warn("[quest-progress] streak reset failed:", error?.message);
    return { ...profile, consecutive_milestone_streak: 0 };
  }

  return data as UserQuestProfile;
}

async function fetchMilestoneSecrets(
  userId: string,
  characterId: number,
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("quest_milestones")
    .select("secret_label, verification, mission_index")
    .eq("user_id", userId)
    .eq("character_id", characterId)
    .order("completed_at", { ascending: false })
    .limit(12);

  if (error) {
    console.warn("[quest-progress] milestone fetch failed:", error.message);
    return [];
  }

  return ((data ?? []) as QuestMilestoneRow[]).map(
    (row) => row.secret_label || formatMilestoneSecretLabel(row.mission_index, row.verification),
  );
}

function mergeGraphRagSecrets(
  milestoneSecrets: string[],
  graphNodes: Array<{ content: string }>,
): string[] {
  const merged = [...milestoneSecrets];
  for (const node of graphNodes) {
    const match = /User verification:\s*(.+?)\s*\|/i.exec(node.content);
    const label = match?.[1]?.trim();
    if (label && !merged.some((entry) => entry.includes(label.slice(0, 24)))) {
      merged.push(
        label.length > 80 ? `${label.slice(0, 80).trim()}…` : label,
      );
    }
  }
  return merged.slice(0, 8);
}

export async function recordQuestMilestone(params: {
  userId: string;
  characterId: number;
  worldId: number;
  missionIndex: number;
  verification: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const profile = await getUserQuestProfile(params.userId);
  const priorStreak = profile?.consecutive_milestone_streak ?? 0;
  const priorVerified = profile?.verified_quest_count ?? 0;

  const { data: existing } = await supabase
    .from("quest_milestones")
    .select("id")
    .eq("user_id", params.userId)
    .eq("character_id", params.characterId)
    .eq("mission_index", params.missionIndex)
    .maybeSingle();

  if (existing) {
    return;
  }

  const secretLabel = formatMilestoneSecretLabel(
    params.missionIndex,
    params.verification,
  );

  await supabase.from("quest_milestones").insert({
    user_id: params.userId,
    character_id: params.characterId,
    world_id: params.worldId,
    mission_index: params.missionIndex,
    verification: params.verification,
    secret_label: secretLabel,
  });

  await supabase
    .from("user_quest_profiles")
    .update({
      verified_quest_count: priorVerified + 1,
      consecutive_milestone_streak: priorStreak + 1,
      last_completed_at: new Date().toISOString(),
      quest_pending_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", params.userId);
}

export async function buildQuestProgressSnapshot(params: {
  userId: string;
  characterId: number;
  worldId: number;
  trust: number;
  characterFirstName: string;
}): Promise<QuestProgressSnapshot> {
  let profile = await getUserQuestProfile(params.userId);
  const boostedTrust = applyPersistedAffinityBonus(
    { trust: params.trust, tension: 0, intimacy: 0, hostility: 0, affinity: 0 },
    Number(profile?.affinity_trust_bonus ?? 0),
  ).trust;
  const affinityPercent = trustToAffinityPercent(boostedTrust);

  if (!profile) {
    return {
      verifiedQuestCount: 0,
      consecutiveMilestoneStreak: 0,
      secretsUnlocked: false,
      discoveredSecrets: [],
      currentThought: resolveQuestThoughtStream({
        characterFirstName: params.characterFirstName,
        questLineId: null,
        punctuality: "idle",
        consecutiveStreak: 0,
        verifiedQuestCount: 0,
        lastVerification: null,
        affinityPercent,
      }),
      deepestSinUnlocked: isDeepestSinUnlocked(affinityPercent, 0),
      punctuality: "idle",
      questStatus: "UNLOCKED",
      xpTotal: 0,
      missionIndex: 1,
      affinityPercent,
    };
  }

  profile = await resetStreakIfOverdue(profile);

  const verifiedQuestCount = Math.max(
    profile.verified_quest_count ?? 0,
    Math.max(0, (profile.mission_index ?? 1) - 1),
  );
  const consecutiveStreak = profile.consecutive_milestone_streak ?? 0;
  const secretsUnlocked = areDiscoveredSecretsUnlocked(consecutiveStreak);
  const punctuality = resolveQuestPunctuality({
    questStatus: profile.quest_status ?? "UNLOCKED",
    questPendingAt: profile.quest_pending_at ?? null,
    lastCompletedAt: profile.last_completed_at ?? null,
  });

  let discoveredSecrets: string[] = [];
  if (secretsUnlocked) {
    const milestoneSecrets = await fetchMilestoneSecrets(
      params.userId,
      params.characterId,
    );
    const graphNodes = await fetchQuestCompletionMemoryNodes({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      limit: 6,
    });
    discoveredSecrets = mergeGraphRagSecrets(milestoneSecrets, graphNodes);
  }

  const questLineId = parseQuestLineId(profile.quest_line_id);

  const currentThought = resolveQuestThoughtStream({
    characterFirstName: params.characterFirstName,
    questLineId,
    punctuality,
    consecutiveStreak,
    verifiedQuestCount,
    lastVerification: profile.last_verification,
    affinityPercent,
  });

  return {
    verifiedQuestCount,
    consecutiveMilestoneStreak: consecutiveStreak,
    secretsUnlocked,
    discoveredSecrets,
    currentThought,
    deepestSinUnlocked: isDeepestSinUnlocked(affinityPercent, verifiedQuestCount),
    punctuality,
    questStatus: profile.quest_status ?? "UNLOCKED",
    xpTotal: profile.xp_total ?? 0,
    missionIndex: profile.mission_index ?? 1,
    affinityPercent,
  };
}
