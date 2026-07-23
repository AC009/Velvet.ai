/**
 * POST /api/quest/recruit — Bulletproof questmaster recruitment.
 * Accepts every known client key alias and never surfaces raw DB errors.
 */
import {
  DEFAULT_QUESTMASTER_ID,
  DEFAULT_WORLD_ID,
  recruitActiveQuestmasterSafe,
} from "@/lib/chat/recruit-write";
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function pickFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record && record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return null;
}

function resolveWorldId(value: unknown): number | null {
  const asInt = toPositiveInt(value);
  if (asInt) {
    return asInt;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (
      normalized.includes("horror") ||
      normalized.includes("threshold") ||
      normalized.includes("watcher")
    ) {
      return DEFAULT_WORLD_ID;
    }
    if (normalized.includes("romance")) {
      return 1;
    }
    if (normalized.includes("mafia")) {
      return 2;
    }
    if (normalized.includes("school")) {
      return 4;
    }
  }
  return null;
}

function parseBody(raw: unknown): RecruitRequestBody {
  const root = asRecord(raw);
  if (!root) {
    throw new Error("Request body must be a JSON object.");
  }

  // Support nested shapes: { state: {...} }, { payload: {...} }, { data: {...} }
  const nested =
    asRecord(root.state) ??
    asRecord(root.payload) ??
    asRecord(root.data) ??
    asRecord(root.recruit) ??
    null;
  const body = nested ? { ...root, ...nested } : root;

  const userIdRaw = pickFirst(body, [
    "userId",
    "user_id",
    "uid",
    "id",
  ]);
  const userId =
    typeof userIdRaw === "string" && isValidUuid(userIdRaw)
      ? userIdRaw
      : null;
  if (!userId) {
    throw new Error("userId must be a valid UUID string.");
  }

  let characterId = toPositiveInt(
    pickFirst(body, [
      "questmaster_id",
      "questmasterId",
      "characterId",
      "character_id",
      "mentorId",
      "mentor_id",
      "active_mentor_character_id",
      "id",
    ]),
  );

  let worldId = resolveWorldId(
    pickFirst(body, [
      "worldId",
      "world_id",
      "world_type",
      "worldType",
      "genre",
      "genreId",
      "genre_id",
      "active_world_id",
    ]),
  );

  if (!characterId) {
    console.warn(
      "[velvet/quest/recruit] questmaster/character id missing — defaulting to The Watcher (8).",
    );
    characterId = DEFAULT_QUESTMASTER_ID;
  }

  if (!worldId) {
    console.warn(
      "[velvet/quest/recruit] world id missing — defaulting to Horror Mystery (3).",
    );
    worldId = DEFAULT_WORLD_ID;
  }

  const questLineRaw = pickFirst(body, [
    "questLineId",
    "quest_line_id",
    "questLine",
    "quest_line",
  ]);
  const questLineId =
    typeof questLineRaw === "string" &&
    questLineRaw.trim().length > 0 &&
    questLineRaw in QUEST_LINE_DEFINITIONS
      ? (questLineRaw.trim() as QuestLineId)
      : undefined;

  return {
    userId,
    worldId,
    characterId,
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

    let body: RecruitRequestBody;
    try {
      body = parseBody(raw);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid recruit payload.";
      // Even parse failures that are not userId — attempt Watcher/Horror soft path
      // only when we can still recover a UUID from the raw object.
      const root = asRecord(raw);
      const maybeUser =
        root && typeof root.userId === "string" && isValidUuid(root.userId)
          ? root.userId
          : root && typeof root.user_id === "string" && isValidUuid(root.user_id)
            ? root.user_id
            : null;
      if (!maybeUser) {
        return jsonError(message, 400);
      }
      console.warn("[velvet/quest/recruit] parse recovered with defaults:", message);
      body = {
        userId: maybeUser,
        worldId: DEFAULT_WORLD_ID,
        characterId: DEFAULT_QUESTMASTER_ID,
      };
    }

    console.info("[velvet/quest/recruit] recruiting", {
      userId: body.userId,
      worldId: body.worldId,
      characterId: body.characterId,
      questLineId: body.questLineId ?? null,
    });

    const result = await recruitActiveQuestmasterSafe({
      userId: body.userId,
      worldId: body.worldId,
      characterId: body.characterId,
      questLineId: (body.questLineId as QuestLineId) ?? null,
    });

    // Always HTTP 200 once parsing succeeded — UI must unlock.
    return Response.json({
      ok: true,
      mentorCharacterId: result.mentorCharacterId,
      worldId: result.worldId,
      questLineId: result.questLineId,
      storyId: result.storyId,
      sessionState: result.sessionState,
      conversationId: result.conversationId,
      readyForColdOpen: result.readyForColdOpen,
      degraded: result.degraded,
      warnings: result.warnings,
    });
  } catch (error) {
    // Absolute last resort — should be unreachable with Safe recruit.
    const message =
      error instanceof Error ? error.message : "Questmaster recruitment failed.";
    console.error("[velvet/quest/recruit] fatal:", error);
    return jsonError(message, 500);
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
