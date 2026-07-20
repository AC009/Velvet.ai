import type { QuestPunctualityState } from "@/lib/chat/quest-progress-constants";

export interface QuestProgressResponse {
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
  affinityPercent: number;
  unlockThresholds: {
    secretsConsecutiveMilestones: number;
    deepestSinAffinityPercent: number;
    deepestSinVerifiedQuests: number;
  };
}

export async function fetchQuestProgress(params: {
  userId: string;
  characterId: number;
  worldId: number;
  trust: number;
  characterFirstName: string;
}): Promise<QuestProgressResponse> {
  const query = new URLSearchParams({
    userId: params.userId,
    characterId: String(params.characterId),
    worldId: String(params.worldId),
    trust: String(params.trust),
    characterFirstName: params.characterFirstName,
  });

  const response = await fetch(`/api/quest/progress?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error ?? `Quest progress fetch failed (${response.status}).`,
    );
  }

  return (await response.json()) as QuestProgressResponse;
}
