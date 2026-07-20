/**
 * GET /api/quest/progress — RPG achievement snapshot for Memories vault.
 */
import { buildQuestProgressSnapshot } from "@/lib/chat/quest-progress";
import {
  DEEPEST_SIN_AFFINITY_MIN_PERCENT,
  DEEPEST_SIN_VERIFIED_QUEST_MIN,
  SECRETS_UNLOCK_CONSECUTIVE_MILESTONES,
} from "@/lib/chat/quest-progress-constants";
import { isValidUuid, jsonError } from "@/lib/chat/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const characterIdRaw = searchParams.get("characterId");
  const worldIdRaw = searchParams.get("worldId");
  const trustRaw = searchParams.get("trust");
  const characterFirstName = searchParams.get("characterFirstName")?.trim() || "They";

  if (!userId || !isValidUuid(userId)) {
    return jsonError("userId query param must be a valid UUID.", 400);
  }

  const characterId = Number(characterIdRaw);
  const worldId = Number(worldIdRaw);
  const trust = Number(trustRaw);

  if (!Number.isInteger(characterId) || characterId <= 0) {
    return jsonError("characterId must be a positive integer.", 400);
  }

  if (!Number.isInteger(worldId) || worldId <= 0) {
    return jsonError("worldId must be a positive integer.", 400);
  }

  if (!Number.isFinite(trust) || trust < -1 || trust > 1) {
    return jsonError("trust must be a number between -1 and 1.", 400);
  }

  try {
    const snapshot = await buildQuestProgressSnapshot({
      userId,
      characterId,
      worldId,
      trust,
      characterFirstName,
    });

    return Response.json({
      ...snapshot,
      unlockThresholds: {
        secretsConsecutiveMilestones: SECRETS_UNLOCK_CONSECUTIVE_MILESTONES,
        deepestSinAffinityPercent: DEEPEST_SIN_AFFINITY_MIN_PERCENT,
        deepestSinVerifiedQuests: DEEPEST_SIN_VERIFIED_QUEST_MIN,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Quest progress fetch failed.";
    console.error("[velvet/quest/progress] request failed:", error);
    return jsonError(message, 500);
  }
}

export async function POST(): Promise<Response> {
  return jsonError("Method not allowed. Use GET.", 405);
}
