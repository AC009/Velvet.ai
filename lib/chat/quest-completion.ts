/**
 * Quest mission completion validator + next narrative beat generator.
 */

import { getCharacter } from "@/lib/chat/conversation-store";
import { completeRoutedLlm } from "@/lib/chat/llm-provider";
import { resolveInferenceRoute } from "@/lib/chat/model-router";
import {
  extractAndSyncGraphRelations,
  upsertGraphTriple,
} from "@/lib/chat/graph-memory";
import { buildUnfilteredPersonaBlock } from "@/lib/chat/unfiltered-persona";
import { buildQuestLineSystemInjection } from "@/lib/chat/quest-line-onboarding";
import { indexDialogueMemoryNode } from "@/lib/chat/vector-memory";
import { buildMatrixScopedSystemPrompt, resolveMatrixArchetype } from "@/lib/chat/greeting-constants";
import { SMS_COMMS_FORMATTING_LAWS } from "@/lib/chat/constants";
import {
  getQuestLineDefinition,
  type QuestLineId,
} from "@/lib/frontend/quest-line-matrix";
import type { LlmMessage, RelationshipVector } from "@/lib/types/database";
import type { UserQuestProfile } from "@/lib/chat/rpg-session-store";

const MIN_VERIFICATION_LENGTH = 12;

export function validateQuestVerificationString(verification: string): string {
  const trimmed = verification.trim();
  if (trimmed.length < MIN_VERIFICATION_LENGTH) {
    throw new Error(
      `Verification must be at least ${MIN_VERIFICATION_LENGTH} characters — describe what you completed in character.`,
    );
  }
  return trimmed;
}

export function computeAffinityTrustBoost(currentTrust: number): number {
  // +5 affinity percentage points on the 0–100 meter ≈ +0.10 trust.
  return Math.min(1, currentTrust + 0.1);
}

export function computeXpAward(
  missionIndex: number,
  currentMultiplier: number,
): { xpAwarded: number; nextMultiplier: number; xpTotalDelta: number } {
  const baseXp = 100;
  const xpAwarded = Math.round(baseXp * currentMultiplier);
  const nextMultiplier = Math.min(3, Number((currentMultiplier + 0.15).toFixed(2)));
  return { xpAwarded, nextMultiplier, xpTotalDelta: xpAwarded };
}

function fallbackNarrative(
  characterName: string,
  questLineId: QuestLineId | null,
  verification: string,
): string {
  if (questLineId === "physical_discipline") {
    return `Good. I felt that energy through the wire. "${verification.slice(0, 40)}…" — mission logged. Don't get soft on me now.`;
  }
  if (questLineId === "cognitive_focus") {
    return `Executed. I see the proof in what you wrote. "${verification.slice(0, 40)}…" — lore unlocked. Next mission drops when you slip.`;
  }
  if (questLineId === "social_charisma") {
    return `You actually showed up. "${verification.slice(0, 40)}…" — charisma logged. Don't hide behind the phone next time.`;
  }
  if (questLineId === "grit_comfort_zone") {
    return `Fear faced. Proof accepted. "${verification.slice(0, 40)}…" — threshold crossed. The next horror beat is waiting.`;
  }
  return `${characterName}: Verified. "${verification.slice(0, 50)}…" — you earned the next beat. Stay sharp.`;
}

export async function generateQuestCompletionNarrative(params: {
  userId: string;
  worldId: number;
  characterId: number;
  verification: string;
  profile: UserQuestProfile;
  relationshipVector: RelationshipVector;
}): Promise<string> {
  const character = await getCharacter(params.characterId);
  const matrixArchetype = resolveMatrixArchetype(
    params.worldId,
    params.characterId,
    character.name,
  );

  const questLineId = params.profile.quest_line_id as QuestLineId | null;
  const scopedPrompt = questLineId
    ? buildMatrixScopedSystemPrompt(
        buildQuestLineSystemInjection(questLineId),
        matrixArchetype,
      )
    : buildMatrixScopedSystemPrompt(character.system_prompt, matrixArchetype);

  const unfilteredBlock = buildUnfilteredPersonaBlock({
    characterName: matrixArchetype.characterDisplayName,
    personaSignals: scopedPrompt,
  });

  const questDef = questLineId ? getQuestLineDefinition(questLineId) : null;

  const llmMessages: LlmMessage[] = [
    {
      role: "system",
      content: [
        scopedPrompt,
        "",
        unfilteredBlock,
        "",
        SMS_COMMS_FORMATTING_LAWS,
        "",
        "QUEST COMPLETION BEAT — MANDATORY:",
        "The user just completed their real-life mission and submitted a verification string.",
        `Verification: "${params.verification}"`,
        questDef ? `Active mission was: ${questDef.missionBlock}` : "",
        "",
        "Write ONE unfiltered in-character SMS response:",
        "- Acknowledge their proof with bite — reward execution, roast if it sounds weak.",
        "- Drop the next story hook / harder mission tease.",
        "- Never apologize. Never break character. No generic AI tone.",
        "Output only the character message text.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      role: "user",
      content: `Mission index ${params.profile.mission_index} complete. Generate the completion narrative now.`,
    },
  ];

  const route = resolveInferenceRoute({
    userMessage: params.verification,
    messageCount: 3,
    relationshipVector: params.relationshipVector,
    isOptionSelection: false,
  });

  try {
    const raw = await completeRoutedLlm(llmMessages, route, { maxTokens: 120 });
    const cleaned = raw.replace(/\s+/g, " ").trim();
    if (cleaned.length > 0) {
      return cleaned;
    }
  } catch (error) {
    console.warn("[quest-completion] LLM narrative failed:", error);
  }

  return fallbackNarrative(
    matrixArchetype.characterDisplayName,
    questLineId,
    params.verification,
  );
}

export async function indexQuestCompletionIntoGraphRag(params: {
  userId: string;
  worldId: number;
  characterId: number;
  characterName: string;
  conversationId: number;
  verification: string;
  narrativeBlock: string;
  relationshipVector: RelationshipVector;
}): Promise<void> {
  await Promise.all([
    indexDialogueMemoryNode({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      conversationId: params.conversationId,
      content: `QUEST COMPLETE — User verification: ${params.verification} | Mentor reply: ${params.narrativeBlock}`,
      factType: "quest_completion",
      metadata: { verified: true, weight: 1.2 },
    }),
    upsertGraphTriple({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      triple: {
        subject: params.characterName,
        predicate: "quest_mission_completed",
        object: "User",
        edgeType: "emotion",
      },
    }),
    extractAndSyncGraphRelations({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      characterName: params.characterName,
      userMessage: params.verification,
      assistantReply: params.narrativeBlock,
      relationshipVector: params.relationshipVector,
    }),
  ]);
}
