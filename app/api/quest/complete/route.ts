/**
 * POST /api/quest/complete — Validate IRL mission verification + unlock chat.
 */
import {
  getCharacter,
  getOrCreateConversation,
  insertAssistantMessage,
  insertUserMessage,
} from "@/lib/chat/conversation-store";
import { fetchGlobalNarrativeHistory } from "@/lib/chat/narrative-context";
import {
  computeXpAward,
  generateQuestCompletionNarrative,
  indexQuestCompletionIntoGraphRag,
  validateQuestVerificationString,
} from "@/lib/chat/quest-completion";
import { recordQuestMilestone } from "@/lib/chat/quest-progress";
import {
  applyPersistedAffinityBonus,
} from "@/lib/chat/quest-guard";
import { computeRelationshipVector } from "@/lib/chat/relationship-vectors";
import {
  completeQuestMissionRecord,
  getUserQuestProfile,
} from "@/lib/chat/rpg-session-store";
import { isValidUuid, jsonError } from "@/lib/chat/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CompleteRequestBody {
  userId: string;
  verification: string;
  worldId?: number;
  characterId?: number;
  storyId?: string;
}

function parseBody(raw: unknown): CompleteRequestBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.userId !== "string" || !isValidUuid(body.userId)) {
    throw new Error("userId must be a valid UUID string.");
  }

  if (typeof body.verification !== "string") {
    throw new Error("verification must be a string.");
  }

  const worldId =
    typeof body.worldId === "number" && Number.isInteger(body.worldId)
      ? body.worldId
      : undefined;

  const characterId =
    typeof body.characterId === "number" && Number.isInteger(body.characterId)
      ? body.characterId
      : undefined;

  const storyId =
    typeof body.storyId === "string" && body.storyId.trim().length > 0
      ? body.storyId.trim()
      : undefined;

  return {
    userId: body.userId,
    verification: body.verification,
    worldId,
    characterId,
    storyId,
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.json();
    const body = parseBody(raw);
    const verification = validateQuestVerificationString(body.verification);

    const profile = await getUserQuestProfile(body.userId);
    if (!profile) {
      return jsonError("No active quest session found.", 404);
    }

    if (profile.quest_status !== "PENDING") {
      return jsonError("No pending mission to complete.", 409);
    }

    const worldId = body.worldId ?? profile.active_world_id;
    const characterId = body.characterId ?? profile.active_mentor_character_id;
    const storyId = body.storyId ?? profile.active_story_id;

    const character = await getCharacter(characterId);
    const conversation = await getOrCreateConversation(
      body.userId,
      worldId,
      storyId,
      characterId,
    );

    const slimHistory = await fetchGlobalNarrativeHistory(worldId, 24);
    const baseRelationshipVector = computeRelationshipVector(
      slimHistory.filter(
        (entry) =>
          entry.character_id === null || entry.character_id === characterId,
      ),
      characterId,
    );
    const relationshipVector = applyPersistedAffinityBonus(
      baseRelationshipVector,
      Number(profile.affinity_trust_bonus ?? 0),
    );

    const narrativeBlock = await generateQuestCompletionNarrative({
      userId: body.userId,
      worldId,
      characterId,
      verification,
      profile,
      relationshipVector,
    });

    const { xpAwarded, nextMultiplier, xpTotalDelta } = computeXpAward(
      profile.mission_index ?? 1,
      Number(profile.xp_multiplier ?? 1),
    );

    await insertUserMessage(conversation.id, verification);
    const assistantMessageId = await insertAssistantMessage(
      conversation.id,
      characterId,
      narrativeBlock,
    );

    const updatedProfile = await completeQuestMissionRecord({
      userId: body.userId,
      verification,
      xpAwarded: xpTotalDelta,
      nextMultiplier,
      nextMissionIndex: (profile.mission_index ?? 1) + 1,
    });

    await recordQuestMilestone({
      userId: body.userId,
      characterId,
      worldId,
      missionIndex: profile.mission_index ?? 1,
      verification,
    });

    const boostedVector = applyPersistedAffinityBonus(
      baseRelationshipVector,
      Number(updatedProfile?.affinity_trust_bonus ?? 0),
    );

    await indexQuestCompletionIntoGraphRag({
      userId: body.userId,
      worldId,
      characterId,
      characterName: character.name,
      conversationId: conversation.id,
      verification,
      narrativeBlock,
      relationshipVector: boostedVector,
    });

    return Response.json({
      success: true,
      questStatus: "COMPLETED" as const,
      narrativeBlock,
      assistantMessageId,
      conversationId: conversation.id,
      relationshipVector: boostedVector,
      xpAwarded,
      xpTotal: updatedProfile?.xp_total ?? xpTotalDelta,
      xpMultiplier: nextMultiplier,
      missionIndex: updatedProfile?.mission_index ?? (profile.mission_index ?? 1) + 1,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Quest completion failed.";
    console.error("[velvet/quest/complete] request failed:", error);
    const status = message.includes("Verification must") ? 400 : 500;
    return jsonError(message, status);
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
