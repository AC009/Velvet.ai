/**
 * POST /api/chat/init — Groq greeting bootstrap + story-path Cold Open entrance.
 *
 * Required in `.env.local`:
 *   GROQ_API_KEY=gsk_...
 */
import { after } from "next/server";
import {
  buildFallbackCharacter,
  isUsableCharacter,
} from "@/lib/chat/character-fallbacks";
import {
  buildColdOpenSystemInjection,
  indexColdOpenIntoGraphRag,
  resolveStoryColdOpen,
} from "@/lib/chat/cold-open";
import {
  countConversationMessages,
  fetchConversationMessages,
  getCharacter,
  getOrCreateConversation,
  insertAssistantMessage,
  isConversationLocked,
  resolveConversationWorldId,
  resolveQuestmasterId,
} from "@/lib/chat/conversation-store";
import {
  generateGreetingBundle,
  generateReturnPulseMessage,
} from "@/lib/chat/greeting-generator";
import { fetchGlobalNarrativeHistory } from "@/lib/chat/narrative-context";
import {
  buildRelationshipInitContext,
  shouldInjectReturnPulse,
} from "@/lib/chat/persistent-relationship-engine";
import { getWorldThemeName } from "@/lib/chat/world-names";
import {
  buildQuestLineSystemInjection,
  indexQuestLineMissionIntoGraphRag,
} from "@/lib/chat/quest-line-onboarding";
import { setQuestPending } from "@/lib/chat/rpg-session-store";
import {
  loadQuestProfileForUser,
  QUEST_INPUT_LOCKED_MESSAGE,
} from "@/lib/chat/quest-guard";
import {
  getQuestLineDefinition,
  parseQuestLineStoryId,
  QUEST_LINE_DEFINITIONS,
  type QuestLineId,
} from "@/lib/frontend/quest-line-matrix";
import { getStoryById } from "@/lib/frontend/character-stories";
import {
  buildMatrixScopedSystemPrompt,
  getMatrixPlotCards,
  resolveMatrixArchetype,
} from "@/lib/chat/greeting-constants";
import { isValidUuid, jsonError } from "@/lib/chat/sse";
import type {
  ChatInitRequestBody,
  ChatInitResponse,
  RelationshipVector,
} from "@/lib/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ParsedInitBody extends ChatInitRequestBody {
  storyId?: string;
  lastSeenAt?: string;
  dialogueBehavior?: ChatInitRequestBody["dialogueBehavior"];
}

function toQuestmasterNumericId(token: string): number {
  const parsed = Number(token);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return 8; // watcher
}

function toWorldNumericId(token: string): number {
  const parsed = Number(token);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  const normalized = token.toLowerCase().replace(/[\s-]+/g, "_");
  if (
    normalized.includes("horror") ||
    normalized.includes("threshold") ||
    normalized === "horror_mystery"
  ) {
    return 3;
  }
  if (normalized.includes("romance")) return 1;
  if (normalized.includes("mafia")) return 2;
  if (normalized.includes("school")) return 4;
  return 3; // horror_mystery
}

function parseInitRequestBody(raw: unknown): ParsedInitBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const body = raw as Record<string, unknown>;

  const userIdRaw =
    typeof body.userId === "string"
      ? body.userId
      : typeof body.user_id === "string"
        ? body.user_id
        : typeof body.uid === "string"
          ? body.uid
          : null;
  if (!userIdRaw || !isValidUuid(userIdRaw)) {
    throw new Error("userId must be a valid UUID string.");
  }

  const worldId = toWorldNumericId(resolveConversationWorldId(body));
  const characterId = toQuestmasterNumericId(resolveQuestmasterId(body));

  const storyId =
    typeof body.storyId === "string" && body.storyId.trim().length > 0
      ? body.storyId.trim()
      : undefined;

  const questLineIdRaw =
    typeof body.questLineId === "string" && body.questLineId.trim().length > 0
      ? body.questLineId.trim()
      : undefined;
  const questLineId =
    questLineIdRaw && questLineIdRaw in QUEST_LINE_DEFINITIONS
      ? (questLineIdRaw as QuestLineId)
      : undefined;

  const lastSeenAt =
    typeof body.lastSeenAt === "string" && body.lastSeenAt.trim().length > 0
      ? body.lastSeenAt.trim()
      : undefined;

  let dialogueBehavior: ParsedInitBody["dialogueBehavior"];
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
          ? (stance as NonNullable<ParsedInitBody["dialogueBehavior"]>["stance"])
          : "neutral",
      consecutiveColdChoices:
        typeof behavior.consecutiveColdChoices === "number"
          ? Math.max(0, Math.floor(behavior.consecutiveColdChoices))
          : 0,
    };
  }

  return {
    userId: userIdRaw,
    worldId,
    characterId,
    storyId,
    questLineId,
    lastSeenAt,
    dialogueBehavior,
    behaviorSystemPrompt:
      typeof body.behaviorSystemPrompt === "string" &&
      body.behaviorSystemPrompt.trim().length > 0
        ? body.behaviorSystemPrompt.trim()
        : undefined,
  };
}

function toInitResponse(
  conversationId: number,
  greeting: boolean,
  rows: Array<{
    id: number;
    character_id: number | null;
    content: string;
    plot_cards?: Array<{ card_id: string; title: string; teaser: string; theme: string }>;
  }>,
  suggestions: string[] = [],
  relationshipVector?: RelationshipVector,
  returnPulse = false,
  coldOpen = false,
  questMission = false,
  questLineId?: string,
  questStatus?: "PENDING" | "COMPLETED" | "UNLOCKED" | "NONE",
): ChatInitResponse {
  return {
    conversationId,
    greeting,
    ...(coldOpen ? { coldOpen: true } : {}),
    ...(questMission && questLineId
      ? { questMission: true, questLineId, questStatus: questStatus ?? "PENDING" }
      : {}),
    suggestions: greeting ? suggestions : [],
    messages: rows.map((row) => ({
      id: row.id,
      role: row.character_id === null ? "user" : "assistant",
      content: row.content,
      characterId: row.character_id,
      ...(row.plot_cards && row.plot_cards.length > 0
        ? { plot_cards: row.plot_cards }
        : {}),
    })),
    ...(relationshipVector ? { relationshipVector } : {}),
    ...(returnPulse ? { returnPulse: true } : {}),
  };
}

/** Never 500 — unlock UI with an empty, well-formed init payload. */
function degradedInitResponse(
  body?: Partial<ParsedInitBody>,
  reason?: string,
): Response {
  console.warn("[velvet/chat/init] returning degraded init payload:", reason);
  const payload: ChatInitResponse & { degraded?: boolean; reason?: string } = {
    conversationId: 0,
    greeting: false,
    messages: [],
    suggestions: [],
    relationshipVector: {
      trust: 0,
      tension: 0,
      intimacy: 0,
      hostility: 0,
      affinity: 0,
    },
    degraded: true,
    ...(reason ? { reason } : {}),
  };
  // Keep character/world hints in logs only — body may be incomplete.
  if (body?.userId) {
    console.warn("[velvet/chat/init] degraded for user:", body.userId);
  }
  return Response.json(payload);
}

export async function POST(request: Request): Promise<Response> {
  let body: ParsedInitBody | undefined;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return degradedInitResponse(undefined, "invalid_json");
  }

  try {
    body = parseInitRequestBody(raw);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid request payload.";
    console.warn("[velvet/chat/init] parse failed:", message);
    return degradedInitResponse(undefined, "parse_error");
  }

  try {
    const storyId = body.storyId ?? "default";
    const conversation = await getOrCreateConversation(
      body.userId,
      body.worldId,
      storyId,
      body.characterId,
    );

    let character: Awaited<ReturnType<typeof getCharacter>>;
    try {
      character = await getCharacter(body.characterId);
    } catch (characterError) {
      console.warn(
        `[chat/init] character fetch failed for ID ${body.characterId}, using fallback.`,
        characterError,
      );
      character = buildFallbackCharacter(body.characterId);
    }

    if (!isUsableCharacter(character)) {
      console.warn(
        `[chat/init] character record invalid for ID ${body.characterId}, using fallback.`,
      );
      character = buildFallbackCharacter(body.characterId);
    }

    if (character.world_id !== body.worldId) {
      console.warn(
        `[chat/init] character/world mismatch for ID ${body.characterId} — applying multiverse matrix overlay for genre ${body.worldId}.`,
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

    const baseSystemPrompt =
      body.behaviorSystemPrompt?.trim() || character.system_prompt;

    const matrixSystemPrompt = buildMatrixScopedSystemPrompt(
      baseSystemPrompt,
      matrixArchetype,
    );

    const matrixPersonality = `${matrixArchetype.personaTitle}. ${matrixArchetype.psychologicalProfile}`;

    if (isConversationLocked(conversation)) {
      return jsonError(`Conversation locked until ${conversation.locked_until}.`, 423);
    }

    const globalHistory = await fetchGlobalNarrativeHistory(body.worldId);
    const messageCount = await countConversationMessages(conversation.id);

    if (messageCount === 0) {
      const questProfile = await loadQuestProfileForUser(body.userId);
      if (questProfile?.quest_status === "PENDING") {
        return jsonError(QUEST_INPUT_LOCKED_MESSAGE, 423);
      }
    }

    if (messageCount > 0) {
      const existing = await fetchConversationMessages(conversation.id);
      const lastMessageAt = existing.at(-1)?.created_at;
      const relationshipContext = buildRelationshipInitContext({
        globalHistory,
        characterId: character.id,
        lastSeenAt: body.lastSeenAt,
        lastMessageAt,
        dialogueBehavior: body.dialogueBehavior,
        isResumeSession: true,
      });

      if (shouldInjectReturnPulse(relationshipContext.absenceMs)) {
        const storyDef =
          storyId !== "default"
            ? getStoryById(body.characterId, storyId)
            : undefined;
        const systemPrompt = storyDef
          ? buildMatrixScopedSystemPrompt(storyDef.initial_sys_prompt, matrixArchetype)
          : matrixSystemPrompt;

        let returnPulseApplied = false;

        try {
          const pulseContent = await generateReturnPulseMessage({
            characterName: matrixArchetype.characterDisplayName,
            systemPrompt,
            personality: matrixPersonality,
            worldName: getWorldThemeName(body.worldId),
            relationshipContext,
            matrixArchetype,
          });

          const pulseId = await insertAssistantMessage(
            conversation.id,
            character.id,
            pulseContent,
          );

          existing.push({
            id: pulseId,
            conversation_id: conversation.id,
            character_id: character.id,
            content: pulseContent,
            created_at: new Date().toISOString(),
          });
          returnPulseApplied = true;
        } catch (pulseError) {
          console.warn("[chat/init] return pulse generation failed:", pulseError);
        }

        return Response.json(
          toInitResponse(
            conversation.id,
            false,
            existing,
            [],
            relationshipContext.vector,
            returnPulseApplied,
          ),
        );
      }

      return Response.json(
        toInitResponse(
          conversation.id,
          false,
          existing,
          [],
          relationshipContext.vector,
          false,
        ),
      );
    }

    const storyDef =
      storyId !== "default"
        ? getStoryById(body.characterId, storyId)
        : undefined;

    const relationshipContext = buildRelationshipInitContext({
      globalHistory,
      characterId: character.id,
      lastSeenAt: body.lastSeenAt,
      dialogueBehavior: body.dialogueBehavior,
      isResumeSession: false,
    });

    const activeQuestLineId: QuestLineId | null =
      (body.questLineId as QuestLineId) ??
      (storyId ? (parseQuestLineStoryId(storyId) as QuestLineId) : null);

    // Real-life RPG quest line — fire mission block as assistant[0].
    if (activeQuestLineId) {
      const questDef = getQuestLineDefinition(activeQuestLineId);
      const missionId = await insertAssistantMessage(
        conversation.id,
        character.id,
        questDef.missionBlock,
      );

      after(() => {
        void indexQuestLineMissionIntoGraphRag({
          userId: body.userId,
          worldId: body.worldId,
          characterId: character.id,
          characterName: matrixArchetype.characterDisplayName,
          conversationId: conversation.id,
          questLineId: activeQuestLineId,
          relationshipVector: relationshipContext.vector,
        }).catch((error) => {
          console.warn("[chat/init] quest-line GraphRAG index failed:", error);
        });
      });

      await setQuestPending(body.userId);

      return Response.json(
        toInitResponse(
          conversation.id,
          true,
          [
            {
              id: missionId,
              character_id: character.id,
              content: questDef.missionBlock,
            },
          ],
          [],
          relationshipContext.vector,
          false,
          false,
          true,
          activeQuestLineId,
          "PENDING",
        ),
      );
    }

    const resolvedColdOpen = await resolveStoryColdOpen({
      characterId: body.characterId,
      storyId,
    });

    const systemPrompt = resolvedColdOpen
      ? buildMatrixScopedSystemPrompt(
          buildColdOpenSystemInjection(resolvedColdOpen),
          matrixArchetype,
        )
      : storyDef
        ? buildMatrixScopedSystemPrompt(storyDef.initial_sys_prompt, matrixArchetype)
        : matrixSystemPrompt;

    const worldThemeName = getWorldThemeName(body.worldId);

    // Story-path Cold Open: drop the user in media res — no blank chat, no polite hello.
    if (resolvedColdOpen) {
      const coldOpenId = await insertAssistantMessage(
        conversation.id,
        character.id,
        resolvedColdOpen.coldOpen,
      );

      after(() => {
        void indexColdOpenIntoGraphRag({
          userId: body.userId,
          worldId: body.worldId,
          characterId: character.id,
          characterName: matrixArchetype.characterDisplayName,
          conversationId: conversation.id,
          resolved: resolvedColdOpen,
          relationshipVector: relationshipContext.vector,
        }).catch((error) => {
          console.warn("[chat/init] cold-open GraphRAG index failed:", error);
        });
      });

      return Response.json(
        toInitResponse(
          conversation.id,
          true,
          [
            {
              id: coldOpenId,
              character_id: character.id,
              content: resolvedColdOpen.coldOpen,
            },
          ],
          [],
          relationshipContext.vector,
          false,
          true,
        ),
      );
    }

    const plotCards =
      storyId === "default" ? getMatrixPlotCards(matrixArchetype) : null;

    const bundle = await generateGreetingBundle({
      characterName: matrixArchetype.characterDisplayName,
      systemPrompt,
      personality: matrixPersonality,
      worldName: worldThemeName,
      characterHook: matrixArchetype.psychologicalProfile,
      relationshipContext,
      matrixArchetype,
    });

    const firstId = await insertAssistantMessage(
      conversation.id,
      character.id,
      bundle.messages[0],
    );

    const secondId = await insertAssistantMessage(
      conversation.id,
      character.id,
      bundle.messages[1],
    );

    return Response.json(
      toInitResponse(
        conversation.id,
        true,
        [
          { id: firstId, character_id: character.id, content: bundle.messages[0] },
          {
            id: secondId,
            character_id: character.id,
            content: bundle.messages[1],
            ...(plotCards && plotCards.length > 0 ? { plot_cards: plotCards } : {}),
          },
        ],
        [...bundle.suggestions],
        relationshipContext.vector,
      ),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error.";
    console.error("[velvet/chat/init] request failed:", error, message);
    return degradedInitResponse(body, "handler_exception");
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
