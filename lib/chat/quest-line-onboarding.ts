/**
 * Quest-line onboarding — real-life mission block injection + GraphRAG anchor.
 */

import {
  extractAndSyncGraphRelations,
  upsertGraphTriple,
} from "@/lib/chat/graph-memory";
import { indexDialogueMemoryNode } from "@/lib/chat/vector-memory";
import {
  getQuestLineDefinition,
  type QuestLineId,
} from "@/lib/frontend/quest-line-matrix";
import type { RelationshipVector } from "@/lib/types/database";

export function buildQuestLineSystemInjection(questLineId: QuestLineId): string {
  const def = getQuestLineDefinition(questLineId);
  return [
    "REAL-LIFE QUEST LINE — RPG FUNNEL (absolute continuity law):",
    `Quest line: ${def.title} (${def.questLineId})`,
    `Opening mission already delivered: "${def.missionBlock}"`,
    "",
    "Rules:",
    "- This is a REAL-LIFE gamified mission queue — not fiction-only fluff.",
    "- Hold the user accountable to execute missions IRL; lore unlocks on proof of action.",
    "- Stay unfiltered: raw modern English, slang, profanity when the coach persona demands it.",
    "- Never apologize. Never generic AI formatting. Short razor dialogue only.",
    "",
    def.systemPromptOverlay,
  ].join("\n");
}

export async function indexQuestLineMissionIntoGraphRag(params: {
  userId: string;
  worldId: number;
  characterId: number;
  characterName: string;
  conversationId: number;
  questLineId: QuestLineId;
  relationshipVector: RelationshipVector;
}): Promise<void> {
  const def = getQuestLineDefinition(params.questLineId);
  const anchorContent = [
    `QUEST LINE ANCHOR [${def.questLineId}]: ${def.missionBlock}`,
    `Path: ${def.title}`,
  ].join(" | ");

  await Promise.all([
    indexDialogueMemoryNode({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      conversationId: params.conversationId,
      content: anchorContent,
      factType: "quest_line_anchor",
      metadata: {
        quest_line_id: def.questLineId,
        title: def.title,
        emotional_anchor: true,
        weight: 1,
      },
    }),
    upsertGraphTriple({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      triple: {
        subject: params.characterName,
        predicate: def.anchorPredicate,
        object: "User",
        edgeType: "emotion",
      },
    }),
    upsertGraphTriple({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      triple: {
        subject: params.characterName,
        predicate: "current_emotion:mission_pressure",
        object: "User",
        edgeType: "emotion",
      },
    }),
    extractAndSyncGraphRelations({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      characterName: params.characterName,
      userMessage: `[Quest line selected: ${def.title}]`,
      assistantReply: def.missionBlock,
      relationshipVector: {
        ...params.relationshipVector,
        tension: Math.max(params.relationshipVector.tension, 0.5),
      },
    }),
  ]);
}
