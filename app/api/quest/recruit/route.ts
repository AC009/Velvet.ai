/**
 * POST /api/quest/recruit — Register active questmaster + gamified RPG session.
 * Always UPSERTs user_quest_profiles (insert when missing) with affinity defaults.
 */
import { recruitActiveQuestmaster } from "@/lib/chat/rpg-session-store";
import { isValidUuid, jsonError } from "@/lib/chat/sse";
import {
  QUEST_LINE_DEFINITIONS,
  type QuestLineId,
} from "@/lib/frontend/quest-line-matrix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RecruitRequestBody {
  userId: string;
  worldId: number;
  characterId: number;
  questLineId?: string;
}

function parseBody(raw: unknown): RecruitRequestBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.userId !== "string" || !isValidUuid(body.userId)) {
    throw new Error("userId must be a valid UUID string.");
  }

  if (
    typeof body.worldId !== "number" ||
    !Number.isInteger(body.worldId) ||
    body.worldId <= 0
  ) {
    throw new Error("worldId must be a positive integer.");
  }

  if (
    typeof body.characterId !== "number" ||
    !Number.isInteger(body.characterId) ||
    body.characterId <= 0
  ) {
    throw new Error("characterId must be a positive integer.");
  }

  const questLineId =
    typeof body.questLineId === "string" &&
    body.questLineId.trim().length > 0 &&
    body.questLineId in QUEST_LINE_DEFINITIONS
      ? (body.questLineId.trim() as QuestLineId)
      : undefined;

  return {
    userId: body.userId,
    worldId: body.worldId,
    characterId: body.characterId,
    questLineId,
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonError("Request body must be valid JSON.", 400);
    }

    const body = parseBody(raw);

    console.info("[velvet/quest/recruit] recruiting", {
      userId: body.userId,
      worldId: body.worldId,
      characterId: body.characterId,
      questLineId: body.questLineId ?? null,
    });

    const result = await recruitActiveQuestmaster({
      userId: body.userId,
      worldId: body.worldId,
      characterId: body.characterId,
      questLineId: (body.questLineId as QuestLineId) ?? null,
    });

    return Response.json({
      mentorCharacterId: result.mentorCharacterId,
      worldId: result.worldId,
      questLineId: result.questLineId,
      storyId: result.storyId,
      sessionState: result.sessionState,
      conversationId: result.conversationId,
      readyForColdOpen: result.readyForColdOpen,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Questmaster recruitment failed.";
    console.error("[velvet/quest/recruit] request failed:", error);
    const status =
      message.includes("must be") || message.includes("JSON") ? 400 : 500;
    return jsonError(message, status);
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
