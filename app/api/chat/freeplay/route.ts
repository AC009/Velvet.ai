/**
 * POST /api/chat/freeplay — generates a free-roleplay launchpad double-message
 * for when the user skips the plot card selection.
 *
 * Required in `.env.local`:
 *   GROQ_API_KEY=gsk_...
 */
import {
  buildFallbackCharacter,
  isUsableCharacter,
} from "@/lib/chat/character-fallbacks";
import { getCharacter } from "@/lib/chat/conversation-store";
import { generateFreePlayLaunchpad } from "@/lib/chat/greeting-generator";
import { getQuestLockResponseIfPending } from "@/lib/chat/quest-guard";
import {
  buildMatrixScopedSystemPrompt,
  resolveMatrixArchetype,
} from "@/lib/chat/greeting-constants";
import { getWorldThemeName } from "@/lib/chat/world-names";
import { isValidUuid, jsonError } from "@/lib/chat/sse";
import type { GreetingBundle } from "@/lib/chat/greeting-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface FreePlayRequestBody {
  userId: string;
  worldId: number;
  characterId: number;
}

interface FreePlayResponse {
  messages: [string, string];
  suggestions: [string, string];
}

function parseBody(raw: unknown): FreePlayRequestBody {
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
  return {
    userId: body.userId,
    worldId: body.worldId,
    characterId: body.characterId,
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: FreePlayRequestBody;
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

    const matrixArchetype = resolveMatrixArchetype(
      body.worldId,
      body.characterId,
      character.name,
    );

    const worldName = getWorldThemeName(body.worldId);

    const bundle: GreetingBundle = await generateFreePlayLaunchpad({
      characterName: matrixArchetype.characterDisplayName,
      systemPrompt: buildMatrixScopedSystemPrompt(
        character.system_prompt,
        matrixArchetype,
      ),
      personality: `${matrixArchetype.personaTitle}. ${matrixArchetype.psychologicalProfile}`,
      worldName,
      matrixArchetype,
    });

    const response: FreePlayResponse = {
      messages: bundle.messages,
      suggestions: bundle.suggestions,
    };

    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error.";
    console.error("[velvet/chat/freeplay] request failed:", error);
    return jsonError(message, 500);
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
