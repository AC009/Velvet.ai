import type { QuestLineId } from "@/lib/frontend/quest-line-matrix";

export interface RecruitQuestmasterResponse {
  ok?: boolean;
  mentorCharacterId: number;
  worldId: number;
  questLineId: QuestLineId | null;
  storyId: string;
  sessionState: string;
  conversationId: number;
  readyForColdOpen: boolean;
  degraded?: boolean;
  warnings?: string[];
}

/**
 * Client recruit payload — emits every known backend alias so parsers never miss IDs.
 */
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
      // Canonical
      userId: params.userId,
      user_id: params.userId,
      worldId: params.worldId,
      world_id: params.worldId,
      characterId: params.characterId,
      character_id: params.characterId,
      // Production / legacy aliases
      questmaster_id: params.characterId,
      questmasterId: params.characterId,
      mentor_id: params.characterId,
      mentorId: params.characterId,
      active_mentor_character_id: params.characterId,
      active_world_id: params.worldId,
      ...(params.questLineId
        ? {
            questLineId: params.questLineId,
            quest_line_id: params.questLineId,
          }
        : {}),
    }),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Questmaster recruitment failed (${response.status}).`;
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Questmaster recruitment returned an empty response.");
  }

  const body = payload as Record<string, unknown>;
  return {
    ok: body.ok !== false,
    mentorCharacterId: Number(
      body.mentorCharacterId ?? body.characterId ?? params.characterId,
    ),
    worldId: Number(body.worldId ?? params.worldId),
    questLineId:
      typeof body.questLineId === "string"
        ? (body.questLineId as QuestLineId)
        : null,
    storyId: String(body.storyId ?? `mentor:${params.characterId}`),
    sessionState: String(body.sessionState ?? "onboarding_cold_open"),
    conversationId: Number(body.conversationId ?? 0),
    readyForColdOpen: Boolean(body.readyForColdOpen),
    degraded: Boolean(body.degraded),
    warnings: Array.isArray(body.warnings)
      ? body.warnings.map(String)
      : undefined,
  };
}
