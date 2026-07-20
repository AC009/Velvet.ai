/**
 * Server-side quest input lock guards — authoritative chat gate.
 */

import type { RelationshipVector } from "@/lib/types/database";
import {
  getUserQuestProfile,
  type QuestStatus,
  type UserQuestProfile,
} from "@/lib/chat/rpg-session-store";

export const QUEST_INPUT_LOCKED_MESSAGE =
  "Quest mission active — complete your real-life objective and report proof before chatting.";

export function isQuestInputLocked(
  status: QuestStatus | string | null | undefined,
): boolean {
  return status === "PENDING";
}

export function isQuestChatAllowed(
  status: QuestStatus | string | null | undefined,
): boolean {
  return (
    status === "UNLOCKED" ||
    status === "COMPLETED" ||
    status === "NONE" ||
    status == null
  );
}

export async function loadQuestProfileForUser(
  userId: string,
): Promise<UserQuestProfile | null> {
  return getUserQuestProfile(userId);
}

export async function assertQuestChatUnlocked(userId: string): Promise<void> {
  const profile = await getUserQuestProfile(userId);
  if (profile && isQuestInputLocked(profile.quest_status)) {
    throw new Error(QUEST_INPUT_LOCKED_MESSAGE);
  }
}

export function applyPersistedAffinityBonus(
  vector: RelationshipVector,
  affinityTrustBonus: number,
): RelationshipVector {
  if (!Number.isFinite(affinityTrustBonus) || affinityTrustBonus <= 0) {
    return vector;
  }

  const trust = Math.min(1, vector.trust + affinityTrustBonus);
  const affinity = Math.min(
    1,
    trust * 0.35 +
      vector.intimacy * 0.35 -
      vector.hostility * 0.45 +
      vector.tension * 0.05,
  );

  return { ...vector, trust, affinity };
}

export const AFFINITY_BONUS_PER_QUEST = 0.1;

/** Authoritative 423 payload for routes that must not run during PENDING. */
export function buildQuestLockResponse(): Response {
  return Response.json({ error: QUEST_INPUT_LOCKED_MESSAGE }, { status: 423 });
}

export async function getQuestLockResponseIfPending(
  userId: string,
): Promise<Response | null> {
  const profile = await getUserQuestProfile(userId);
  if (profile && isQuestInputLocked(profile.quest_status)) {
    return buildQuestLockResponse();
  }
  return null;
}
