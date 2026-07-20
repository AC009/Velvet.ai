import type { QuestLineId } from "@/lib/frontend/quest-line-matrix";

export interface RecruitQuestmasterResponse {
  mentorCharacterId: number;
  worldId: number;
  questLineId: QuestLineId | null;
  storyId: string;
  sessionState: string;
  conversationId: number;
  readyForColdOpen: boolean;
}

export async function recruitQuestmaster(params: {
  userId: string;
  worldId: number;
  characterId: number;
  questLineId?: QuestLineId | null;
}): Promise<RecruitQuestmasterResponse> {
  const response = await fetch("/api/quest/recruit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      ...(params.questLineId ? { questLineId: params.questLineId } : {}),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error ?? `Questmaster recruitment failed (${response.status}).`,
    );
  }

  return (await response.json()) as RecruitQuestmasterResponse;
}
