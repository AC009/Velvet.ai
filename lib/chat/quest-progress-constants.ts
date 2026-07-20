/**
 * Velvet Quest — RPG progress constants + unlock algorithms (server source of truth).
 */

export const SECRETS_UNLOCK_CONSECUTIVE_MILESTONES = 3;
export const DEEPEST_SIN_AFFINITY_MIN_PERCENT = 80;
export const DEEPEST_SIN_VERIFIED_QUEST_MIN = 10;
/** Real-life mission punctuality window before streak breaks. */
export const QUEST_MISSION_DEADLINE_MS = 24 * 60 * 60 * 1000;

export type QuestPunctualityState =
  | "idle"
  | "pending_on_time"
  | "overdue"
  | "recently_completed";

export function trustToAffinityPercent(trust: number): number {
  return Math.round(((trust + 1) / 2) * 100);
}

export function areDiscoveredSecretsUnlocked(
  consecutiveMilestoneStreak: number,
): boolean {
  return consecutiveMilestoneStreak >= SECRETS_UNLOCK_CONSECUTIVE_MILESTONES;
}

export function isDeepestSinUnlocked(
  affinityPercent: number,
  verifiedQuestCount: number,
): boolean {
  return (
    affinityPercent >= DEEPEST_SIN_AFFINITY_MIN_PERCENT &&
    verifiedQuestCount >= DEEPEST_SIN_VERIFIED_QUEST_MIN
  );
}

export function resolveQuestPunctuality(params: {
  questStatus: string;
  questPendingAt: string | null;
  lastCompletedAt: string | null;
  nowMs?: number;
}): QuestPunctualityState {
  const now = params.nowMs ?? Date.now();

  if (
    params.lastCompletedAt &&
    now - new Date(params.lastCompletedAt).getTime() < 15 * 60 * 1000
  ) {
    return "recently_completed";
  }

  if (params.questStatus !== "PENDING" || !params.questPendingAt) {
    return "idle";
  }

  const pendingMs = now - new Date(params.questPendingAt).getTime();
  if (pendingMs > QUEST_MISSION_DEADLINE_MS) {
    return "overdue";
  }

  return "pending_on_time";
}

export function formatMilestoneSecretLabel(
  missionIndex: number,
  verification: string,
): string {
  const snippet =
    verification.length > 72
      ? `${verification.slice(0, 72).trim()}…`
      : verification.trim();
  return `MILESTONE ${String(Math.max(1, missionIndex - 1)).padStart(2, "0")} — ${snippet}`;
}
