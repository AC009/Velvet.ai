/**
 * Client for Content Engine mission pool + Dynamic Game Master story nodes.
 */

export interface PoolMission {
  id: string;
  worldType: string;
  arcId: string;
  sequenceOrder: number;
  missionText: string;
  sensorType: string;
}

export interface StoryNodeResponse {
  success: boolean;
  messages: string[];
  messageCount: number;
  model?: string;
  source?: string;
  chapterId?: string;
  sequenceOrder?: number;
  nextMissionSequence?: number | null;
  nextMissionHint?: string | null;
}

export async function fetchNextPoolMission(params: {
  worldId?: number | null;
  worldType?: string;
  arcId?: string;
  afterSequence?: number;
}): Promise<PoolMission> {
  const query = new URLSearchParams();
  if (params.worldId != null) {
    query.set("worldId", String(params.worldId));
  }
  if (params.worldType) {
    query.set("worldType", params.worldType);
  }
  if (params.arcId) {
    query.set("arcId", params.arcId);
  }
  if (params.afterSequence != null) {
    query.set("afterSequence", String(params.afterSequence));
  }

  const response = await fetch(`/api/missions/next?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
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
        : `Failed to fetch next mission (${response.status}).`;
    throw new Error(message);
  }

  const body = payload as Record<string, unknown>;
  if (
    typeof body.id !== "string" ||
    typeof body.missionText !== "string" ||
    typeof body.sequenceOrder !== "number"
  ) {
    throw new Error("Malformed mission pool response.");
  }

  return {
    id: body.id,
    worldType: String(body.worldType ?? ""),
    arcId: String(body.arcId ?? "arc_1"),
    sequenceOrder: body.sequenceOrder,
    missionText: body.missionText,
    sensorType: String(body.sensorType ?? "CAMERA_VISION"),
  };
}

export async function generateStoryNode(params: {
  userId: string;
  missionText: string;
  watcherFeedback?: string;
  characterName?: string;
  worldType?: string;
  arcId?: string;
  sequenceOrder?: number;
  arcProgress?: number;
  affinityScore?: number;
  statusTag?: string;
}): Promise<StoryNodeResponse> {
  const response = await fetch("/api/generate-story-node", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
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
        : `Story node generation failed (${response.status}).`;
    throw new Error(message);
  }

  const body = payload as Record<string, unknown>;
  if (!Array.isArray(body.messages)) {
    throw new Error("Story node response missing messages.");
  }

  const messages = body.messages
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (messages.length === 0) {
    throw new Error("Story node returned no messages.");
  }

  return {
    success: Boolean(body.success),
    messages,
    messageCount: messages.length,
    model: typeof body.model === "string" ? body.model : undefined,
    source: typeof body.source === "string" ? body.source : undefined,
    chapterId: typeof body.chapterId === "string" ? body.chapterId : undefined,
    sequenceOrder:
      typeof body.sequenceOrder === "number" ? body.sequenceOrder : undefined,
    nextMissionSequence:
      typeof body.nextMissionSequence === "number"
        ? body.nextMissionSequence
        : body.nextMissionSequence === null
          ? null
          : undefined,
    nextMissionHint:
      typeof body.nextMissionHint === "string" ? body.nextMissionHint : null,
  };
}
