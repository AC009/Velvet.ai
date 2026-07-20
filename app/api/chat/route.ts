/**
 * POST /api/chat — Hybrid vector memory + adaptive SLM routing stream.
 *
 * Required in `.env.local`:
 *   GROQ_API_KEY=gsk_...
 * Optional:
 *   TOGETHER_API_KEY=... (edge SLM + embeddings)
 */
import { after } from "next/server";
import { SESSION_MESSAGE_CLIFFHANGER_THRESHOLD, SLIM_NARRATIVE_LIMIT } from "@/lib/chat/constants";
import {
  applyConversationLock,
  countAssistantMessages,
  countConversationMessages,
  fetchRecentConversationTurns,
  getCharacter,
  getOrCreateConversation,
  insertAssistantMessage,
  insertUserMessage,
  isConversationLocked,
} from "@/lib/chat/conversation-store";
import { generateReplySuggestionsSafe } from "@/lib/chat/reply-suggestions";
import { streamLlmCompletion } from "@/lib/chat/llm-stream";
import { resolveInferenceRoute } from "@/lib/chat/model-router";
import {
  buildLlmMessages,
  fetchGlobalNarrativeHistory,
} from "@/lib/chat/narrative-context";
import { assembleNarrativeIntelligencePrompt } from "@/lib/chat/narrative-intelligence";
import {
  computeRelationshipVector,
  injectRelationshipVectorIntoPrompt,
} from "@/lib/chat/relationship-vectors";
import { computeEmotionalTrajectory } from "@/lib/chat/emotional-engine";
import {
  buildQuestLineSystemInjection,
} from "@/lib/chat/quest-line-onboarding";
import {
  parseQuestLineStoryId,
  type QuestLineId,
} from "@/lib/frontend/quest-line-matrix";
import {
  buildColdOpenSystemInjection,
  resolveStoryColdOpen,
} from "@/lib/chat/cold-open";
import {
  buildMatrixScopedSystemPrompt,
  resolveMatrixArchetype,
} from "@/lib/chat/greeting-constants";
import {
  createSseResponse,
  isValidUuid,
  jsonError,
} from "@/lib/chat/sse";
import {
  formatRecentTurnsBlock,
  indexDialogueMemoryNode,
} from "@/lib/chat/vector-memory";
import {
  extractAndSyncGraphRelations,
  synthesizeGraphMemoryPayload,
  traverseGraphMemory,
} from "@/lib/chat/graph-memory";
import {
  applyPersistedAffinityBonus,
  loadQuestProfileForUser,
  QUEST_INPUT_LOCKED_MESSAGE,
} from "@/lib/chat/quest-guard";
import type { ChatRequestBody, RelationshipVector, SseEvent } from "@/lib/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseRequestBody(raw: unknown): ChatRequestBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.userId !== "string" || !isValidUuid(body.userId)) {
    throw new Error("userId must be a valid UUID string.");
  }

  if (typeof body.worldId !== "number" || !Number.isInteger(body.worldId) || body.worldId <= 0) {
    throw new Error("worldId must be a positive integer.");
  }

  if (
    typeof body.characterId !== "number" ||
    !Number.isInteger(body.characterId) ||
    body.characterId <= 0
  ) {
    throw new Error("characterId must be a positive integer.");
  }

  if (typeof body.message !== "string") {
    throw new Error("message must be a string.");
  }

  const message = body.message.trim();
  if (message.length === 0) {
    throw new Error("message must not be empty.");
  }

  if (message.length > 8000) {
    throw new Error("message exceeds maximum length of 8000 characters.");
  }

  const storyId =
    typeof body.storyId === "string" && body.storyId.trim().length > 0
      ? body.storyId.trim()
      : undefined;

  const behaviorSystemPrompt =
    typeof body.behaviorSystemPrompt === "string" &&
    body.behaviorSystemPrompt.trim().length > 0
      ? body.behaviorSystemPrompt.trim()
      : undefined;

  const isOptionSelection = body.isOptionSelection === true;

  return {
    userId: body.userId,
    worldId: body.worldId,
    characterId: body.characterId,
    message,
    storyId,
    behaviorSystemPrompt,
    isOptionSelection,
  };
}

function scheduleBackgroundPersistence(
  conversationId: number,
  characterId: number,
  assistantContent: string,
): void {
  after(async () => {
    try {
      await insertAssistantMessage(conversationId, characterId, assistantContent);
    } catch (error) {
      console.error("[velvet/chat] background persistence failed:", error);
    }
  });
}

function scheduleMemoryIndexing(params: {
  userId: string;
  worldId: number;
  characterId: number;
  characterName: string;
  conversationId: number;
  userMessage: string;
  assistantContent?: string;
  relationshipVector: RelationshipVector;
}): void {
  after(async () => {
    await indexDialogueMemoryNode({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      conversationId: params.conversationId,
      content: params.userMessage,
      factType: "user_turn",
      metadata: { source: "chat_route" },
    });

    if (params.assistantContent?.trim()) {
      await indexDialogueMemoryNode({
        userId: params.userId,
        worldId: params.worldId,
        characterId: params.characterId,
        conversationId: params.conversationId,
        content: params.assistantContent,
        factType: "assistant_turn",
        metadata: { source: "chat_route" },
      });

      await extractAndSyncGraphRelations({
        userId: params.userId,
        worldId: params.worldId,
        characterId: params.characterId,
        characterName: params.characterName,
        userMessage: params.userMessage,
        assistantReply: params.assistantContent,
        relationshipVector: params.relationshipVector,
      });
    }
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: ChatRequestBody;

  try {
    const raw = await request.json();
    body = parseRequestBody(raw);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid request payload.";
    return jsonError(message, 400);
  }

  try {
    const storyId = body.storyId ?? "default";

    const questProfile = await loadQuestProfileForUser(body.userId);
    if (questProfile && questProfile.quest_status === "PENDING") {
      return jsonError(QUEST_INPUT_LOCKED_MESSAGE, 423);
    }

    const conversation = await getOrCreateConversation(
      body.userId,
      body.worldId,
      storyId,
      body.characterId,
    );

    const character = await getCharacter(body.characterId);

    const matrixArchetype = resolveMatrixArchetype(
      body.worldId,
      body.characterId,
      character.name,
    );

    if (character.world_id !== body.worldId) {
      console.warn(
        `[chat] character/world mismatch — multiverse node ${matrixArchetype.nodeKey} active.`,
      );
    }

    if (isConversationLocked(conversation)) {
      return jsonError(`Conversation locked until ${conversation.locked_until}.`, 423);
    }

    const priorCount = await countConversationMessages(conversation.id);
    const messageCountAfterUser = priorCount + 1;
    const triggerCliffhanger =
      messageCountAfterUser >= SESSION_MESSAGE_CLIFFHANGER_THRESHOLD;

    await insertUserMessage(conversation.id, body.message);

    const [graphMemoryRows, recentTurns, slimHistory] = await Promise.all([
      traverseGraphMemory({
        userId: body.userId,
        worldId: body.worldId,
        characterId: body.characterId,
        query: body.message,
        matchCount: 5,
      }),
      fetchRecentConversationTurns(
        conversation.id,
        6,
        matrixArchetype.characterDisplayName,
      ),
      fetchGlobalNarrativeHistory(body.worldId, SLIM_NARRATIVE_LIMIT),
    ]);

    const relationshipVector = applyPersistedAffinityBonus(
      computeRelationshipVector(
        slimHistory.filter(
          (entry) =>
            entry.character_id === null || entry.character_id === character.id,
        ),
        character.id,
      ),
      Number(questProfile?.affinity_trust_bonus ?? 0),
    );

    const emotionalTrajectory = computeEmotionalTrajectory({
      userMessage: body.message,
      recentHistory: slimHistory.filter(
        (entry) =>
          entry.character_id === null || entry.character_id === character.id,
      ),
      characterId: character.id,
      relationshipVector,
    });

    const baseSystemPrompt =
      body.behaviorSystemPrompt?.trim() || character.system_prompt;

    const activeQuestLineId: QuestLineId | null = parseQuestLineStoryId(storyId);

    const resolvedColdOpen =
      activeQuestLineId === null
        ? await resolveStoryColdOpen({
            characterId: body.characterId,
            storyId,
          })
        : null;

    const scopedBasePrompt = activeQuestLineId
      ? buildQuestLineSystemInjection(activeQuestLineId)
      : resolvedColdOpen
        ? buildColdOpenSystemInjection(resolvedColdOpen)
        : baseSystemPrompt;

    const matrixSystemPrompt = buildMatrixScopedSystemPrompt(
      scopedBasePrompt,
      matrixArchetype,
    );

    const systemPrompt = injectRelationshipVectorIntoPrompt(
      matrixSystemPrompt,
      `${matrixArchetype.personaTitle}. ${matrixArchetype.psychologicalProfile}`,
      relationshipVector,
      matrixArchetype.characterDisplayName,
    );

    const narrativeIntelligencePrompt = assembleNarrativeIntelligencePrompt({
      globalHistory: slimHistory,
      currentCharacterId: character.id,
      currentCharacterName: matrixArchetype.characterDisplayName,
      messageCount: messageCountAfterUser,
      worldId: body.worldId,
    });

    const memoryBlock = synthesizeGraphMemoryPayload(graphMemoryRows);
    const recentTurnsBlock = formatRecentTurnsBlock(recentTurns);

    const llmMessages = buildLlmMessages({
      systemPrompt,
      narrativeIntelligencePrompt,
      memoryBlock,
      recentTurnsBlock,
      userMessage: body.message,
      respondingCharacterName: matrixArchetype.characterDisplayName,
      currentCharacterId: character.id,
      emotionalTrajectory,
    });

    const inferenceRoute = resolveInferenceRoute({
      userMessage: body.message,
      messageCount: messageCountAfterUser,
      relationshipVector,
      isOptionSelection: body.isOptionSelection,
    });

    let lockedUntil: string | null = null;
    if (triggerCliffhanger) {
      lockedUntil = await applyConversationLock(conversation.id);
    }

    const metaEvent: SseEvent = {
      type: "meta",
      conversationId: conversation.id,
      messageCount: messageCountAfterUser,
      cliffhanger: triggerCliffhanger,
      lockedUntil,
      relationshipVector,
      emotionalState: {
        anger: emotionalTrajectory.state.anger,
        lust: emotionalTrajectory.state.lust,
        pride: emotionalTrajectory.state.pride,
        trauma: emotionalTrajectory.state.trauma,
        affection: emotionalTrajectory.state.affection,
        dominant: emotionalTrajectory.dominant,
        twistActive: emotionalTrajectory.twistActive,
      },
    };

    return createSseResponse(async (enqueue, close) => {
      enqueue(metaEvent);

      let fullAssistantContent = "";

      try {
        for await (const chunk of streamLlmCompletion(llmMessages, inferenceRoute)) {
          if (chunk.done) {
            break;
          }
          if (chunk.content.length > 0) {
            fullAssistantContent += chunk.content;
            enqueue({ type: "token", content: chunk.content });
          }
        }

        if (fullAssistantContent.trim().length === 0) {
          throw new Error("LLM returned an empty completion.");
        }

        enqueue({ type: "done", fullContent: fullAssistantContent });
        scheduleBackgroundPersistence(conversation.id, character.id, fullAssistantContent);
        scheduleMemoryIndexing({
          userId: body.userId,
          worldId: body.worldId,
          characterId: body.characterId,
          characterName: matrixArchetype.characterDisplayName,
          conversationId: conversation.id,
          userMessage: body.message,
          assistantContent: fullAssistantContent,
          relationshipVector,
        });

        if (!triggerCliffhanger) {
          const replySuggestions = await generateReplySuggestionsSafe({
            characterName: matrixArchetype.characterDisplayName,
            personality: matrixArchetype.psychologicalProfile,
            userMessage: body.message,
            assistantReply: fullAssistantContent,
          });
          enqueue({ type: "options", suggestions: replySuggestions });
        }
      } catch (streamError) {
        const message =
          streamError instanceof Error ? streamError.message : "LLM streaming failed.";
        enqueue({ type: "error", message });
      } finally {
        close();
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error.";
    console.error("[velvet/chat] request failed:", error);
    return jsonError(message, 500);
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
