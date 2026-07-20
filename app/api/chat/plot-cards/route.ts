/**
 * POST /api/chat/plot-cards — Groq-powered plot card re-roll for the live deck.
 *
 * Required in `.env.local`:
 *   GROQ_API_KEY=gsk_...
 */
import {
  buildFallbackCharacter,
  isUsableCharacter,
} from "@/lib/chat/character-fallbacks";
import { getCharacter } from "@/lib/chat/conversation-store";
import { generatePlotCards } from "@/lib/chat/greeting-generator";
import { fetchGlobalNarrativeHistory } from "@/lib/chat/narrative-context";
import {
  buildMatrixScopedSystemPrompt,
  resolveMatrixArchetype,
} from "@/lib/chat/greeting-constants";
import { mergeDialogueBehavior } from "@/lib/chat/persistent-relationship-engine";
import { getQuestLockResponseIfPending } from "@/lib/chat/quest-guard";
import { getWorldThemeName } from "@/lib/chat/world-names";
import { isValidUuid, jsonError } from "@/lib/chat/sse";
import type { ChatInitRequestBody, PlotCardPayload } from "@/lib/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface PlotCardsRequestBody {
  userId: string;
  worldId: number;
  characterId: number;
  excludeCardIds?: string[];
  dialogueBehavior?: ChatInitRequestBody["dialogueBehavior"];
}

interface PlotCardsResponse {
  plot_cards: PlotCardPayload[];
}

function parseBody(raw: unknown): PlotCardsRequestBody {
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

  const excludeCardIds = Array.isArray(body.excludeCardIds)
    ? body.excludeCardIds
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim())
    : undefined;

  let dialogueBehavior: PlotCardsRequestBody["dialogueBehavior"];
  if (body.dialogueBehavior && typeof body.dialogueBehavior === "object") {
    const behavior = body.dialogueBehavior as Record<string, unknown>;
    const stance = behavior.stance;
    const validStances = new Set([
      "cold",
      "warm",
      "neutral",
      "defiant",
      "flirtatious",
    ]);
    dialogueBehavior = {
      lastChoiceIndex:
        behavior.lastChoiceIndex === 0 || behavior.lastChoiceIndex === 1
          ? behavior.lastChoiceIndex
          : null,
      lastChoiceText:
        typeof behavior.lastChoiceText === "string"
          ? behavior.lastChoiceText
          : null,
      stance:
        typeof stance === "string" && validStances.has(stance)
          ? (stance as NonNullable<PlotCardsRequestBody["dialogueBehavior"]>["stance"])
          : "neutral",
      consecutiveColdChoices:
        typeof behavior.consecutiveColdChoices === "number"
          ? Math.max(0, Math.floor(behavior.consecutiveColdChoices))
          : 0,
    };
  }

  return {
    userId: body.userId,
    worldId: body.worldId,
    characterId: body.characterId,
    excludeCardIds,
    dialogueBehavior,
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: PlotCardsRequestBody;

  try {
    const raw = await request.json();
    body = parseBody(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request payload.";
    return jsonError(message, 400);
  }

  try {
    const questLock = await getQuestLockResponseIfPending(body.userId);
    if (questLock) {
      return questLock;
    }

    let character = await getCharacter(body.characterId);
    if (!isUsableCharacter(character)) {
      character = buildFallbackCharacter(body.characterId);
    }

    if (character.world_id !== body.worldId) {
      console.warn(
        `[chat/plot-cards] character/world mismatch — applying multiverse matrix overlay for genre ${body.worldId}.`,
      );
      character = {
        ...character,
        world_id: body.worldId,
      };
    }

    const matrixArchetype = resolveMatrixArchetype(
      body.worldId,
      body.characterId,
      character.name,
    );

    const matrixSystemPrompt = buildMatrixScopedSystemPrompt(
      character.system_prompt,
      matrixArchetype,
    );

    const matrixPersonality = `${matrixArchetype.personaTitle}. ${matrixArchetype.psychologicalProfile}`;

    const globalHistory = await fetchGlobalNarrativeHistory(body.worldId);
    const dialogueBehavior = mergeDialogueBehavior(
      body.dialogueBehavior,
      globalHistory,
      character.id,
    );

    const plotCards = await generatePlotCards({
      characterName: matrixArchetype.characterDisplayName,
      systemPrompt: matrixSystemPrompt,
      personality: matrixPersonality,
      worldName: getWorldThemeName(body.worldId),
      excludeCardIds: body.excludeCardIds,
      dialogueBehavior,
      matrixArchetype,
    });

    const response: PlotCardsResponse = { plot_cards: plotCards };
    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error.";
    console.error("[velvet/chat/plot-cards] request failed:", error);
    return jsonError(message, 500);
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
