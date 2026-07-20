import type { RelationshipVector } from "@/lib/types/database";
import type { QuestStatus } from "@/lib/chat/rpg-session-store";

export interface QuestSessionResponse {
  active: boolean;
  questStatus: QuestStatus;
  xpTotal: number;
  xpMultiplier: number;
  missionIndex: number;
  mentorCharacterId?: number;
  worldId?: number;
  questLineId?: string | null;
  storyId?: string;
  sessionState?: string;
}

export interface QuestCompleteResponse {
  success: boolean;
  questStatus: QuestStatus;
  narrativeBlock: string;
  assistantMessageId: number;
  conversationId: number;
  relationshipVector: RelationshipVector;
  xpAwarded: number;
  xpTotal: number;
  xpMultiplier: number;
  missionIndex: number;
}

export async function fetchQuestSession(
  userId: string,
): Promise<QuestSessionResponse> {
  const response = await fetch(
    `/api/quest/session?userId=${encodeURIComponent(userId)}`,
    { method: "GET", cache: "no-store" },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error ?? `Quest session fetch failed (${response.status}).`,
    );
  }

  return (await response.json()) as QuestSessionResponse;
}

export async function submitQuestCompletion(params: {
  userId: string;
  verification: string;
  worldId: number;
  characterId: number;
  storyId: string;
}): Promise<QuestCompleteResponse> {
  const response = await fetch("/api/quest/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: params.userId,
      verification: params.verification,
      worldId: params.worldId,
      characterId: params.characterId,
      storyId: params.storyId,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error ?? `Quest completion failed (${response.status}).`,
    );
  }

  return (await response.json()) as QuestCompleteResponse;
}
