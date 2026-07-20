import { completeRoutedLlm } from "@/lib/chat/llm-provider";
import { resolveInferenceRoute } from "@/lib/chat/model-router";
import { SMS_COMMS_FORMATTING_LAWS } from "@/lib/chat/constants";
import { buildFallbackCharacter } from "@/lib/chat/character-fallbacks";
import { getCharacter } from "@/lib/chat/conversation-store";
import {
  recordProactiveAmbientContact,
  synthesizeGraphMemoryPayload,
  traverseGraphMemory,
} from "@/lib/chat/graph-memory";
import {
  buildMatrixScopedSystemPrompt,
  resolveMatrixArchetype,
} from "@/lib/chat/greeting-constants";
import { fetchGlobalNarrativeHistory } from "@/lib/chat/narrative-context";
import {
  buildPersistentMemoryFacts,
  formatAbsenceLabel,
} from "@/lib/chat/persistent-relationship-engine";
import {
  buildPeripheralAmbientPayload,
  formatPeripheralContextBlock,
  fetchUserWorldMilestones,
  type PeripheralAmbientPayload,
} from "@/lib/chat/peripheral-awareness";
import { computeRelationshipVector } from "@/lib/chat/relationship-vectors";
import {
  buildEmotionalTrajectoryBlock,
  computeEmotionalTrajectory,
} from "@/lib/chat/emotional-engine";
import { buildUnfilteredPersonaBlock } from "@/lib/chat/unfiltered-persona";
import { buildCharacterDeepLink } from "@/lib/push/deep-link";
import type { RelationshipVector } from "@/lib/types/database";
import type { LlmMessage } from "@/lib/types/database";
import type { PhantomPushPacket } from "@/lib/push/types";

export interface ProactivePingCandidate {
  conversationId: number;
  userId: string;
  worldId: number;
  characterId: number;
  updatedAt: string;
  lockedUntil: string | null;
}

export interface ProactiveCheckInContext {
  characterName: string;
  worldName: string;
  systemPrompt: string;
  personality: string;
  relationshipVector: RelationshipVector;
  absenceLabel: string;
  memoryHeadline: string | null;
  ambient: PeripheralAmbientPayload;
  graphMemoryBlock: string;
}

export interface ProactivePushEnvelope {
  packet: PhantomPushPacket;
  checkInMessage: string;
  simulatedWebPush: {
    title: string;
    body: string;
    data: {
      url: string;
      tag: string;
      phase: "dashboard";
      characterId: number;
      worldId: number;
      proactive: true;
      ambientSlot: string;
      timelineIndicator: string;
    };
  };
}

const WORLD_NAMES: Record<number, string> = {
  1: "Romance Drama",
  2: "Mafia World",
  3: "Horror Mystery",
  4: "School Drama",
};

export async function generatePeripheralProactiveCheckIn(
  ctx: ProactiveCheckInContext,
): Promise<string> {
  const route = resolveInferenceRoute({
    userMessage: ctx.ambient.narrativeQuery,
    messageCount: 1,
    relationshipVector: ctx.relationshipVector,
    isOptionSelection: false,
  });

  const peripheralBlock = formatPeripheralContextBlock(ctx.ambient);

  const unfilteredBlock = buildUnfilteredPersonaBlock({
    characterName: ctx.characterName,
    personaSignals: `${ctx.systemPrompt}\n${ctx.personality}`,
  });

  const emotionalTrajectory = computeEmotionalTrajectory({
    userMessage: ctx.memoryHeadline ?? ctx.ambient.narrativeQuery,
    recentHistory: [],
    characterId: 0,
    relationshipVector: ctx.relationshipVector,
  });
  const emotionalBlock = buildEmotionalTrajectoryBlock(
    emotionalTrajectory,
    ctx.characterName,
  );

  const llmMessages: LlmMessage[] = [
    {
      role: "system",
      content: [
        ctx.systemPrompt,
        "",
        `Personality: ${ctx.personality}`,
        "",
        SMS_COMMS_FORMATTING_LAWS,
        "",
        peripheralBlock,
        "",
        unfilteredBlock,
        "",
        emotionalBlock,
        "",
        "GRAPHRAG MEMORY SUB-GRAPH:",
        ctx.graphMemoryBlock,
        "",
        "PERIPHERAL PROACTIVE ENGAGEMENT — MANDATORY:",
        "The user has been silent. Synthesize ONE hyper-contextual in-character SMS using the LIVE ambient data above.",
        "You MUST reference the ambient condition and timeline indicator when relevant.",
        "Let the dominant emotional node drive the ping. Forbidden: generic pings like 'miss you' or 'where are you'. Never apologize.",
        "Example (Horror, stormy late night, red timeline):",
        "'The storm rolling past your perimeter is getting heavy. I see your timeline indicator flashing red. Are you contained?'",
        "Output only the character message text.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Character: ${ctx.characterName}`,
        `World: ${ctx.worldName}`,
        `Silence: ${ctx.absenceLabel}`,
        `Ambient: ${ctx.ambient.ambientCondition}`,
        `Time slot: ${ctx.ambient.localTimeSlot}`,
        `Timeline: ${ctx.ambient.stateDrift.timelineIndicator}`,
        ctx.memoryHeadline ? `Last hook: ${ctx.memoryHeadline}` : "",
        "",
        "Write the ambient-aware proactive check-in now.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  try {
    const content = await completeRoutedLlm(llmMessages, route, {
      maxTokens: 72,
    });
    return content.replace(/\s+/g, " ").trim();
  } catch (error) {
    console.warn("[proactive-ping] peripheral LLM failed:", error);
    if (
      ctx.worldName === "Horror Mystery" &&
      ctx.ambient.localTimeSlot === "late_night"
    ) {
      return "The storm rolling past your perimeter is getting heavy. I see your timeline indicator flashing red. Are you contained?";
    }
    return `${ctx.characterName}: ${ctx.absenceLabel} of silence near the ${ctx.ambient.ambientCondition}. Your timeline is ${ctx.ambient.stateDrift.timelineIndicator}. Open Velvet.`;
  }
}

export function assembleProactivePushEnvelope(params: {
  candidate: ProactivePingCandidate;
  characterName: string;
  checkInMessage: string;
  ambient: PeripheralAmbientPayload;
}): ProactivePushEnvelope {
  const url = buildCharacterDeepLink({
    worldId: params.candidate.worldId,
    characterId: params.candidate.characterId,
  });
  const tag = `proactive-${params.candidate.conversationId}-${Date.now()}`;
  const title = `${params.characterName} ✦`;
  const body = params.checkInMessage.slice(0, 220);

  return {
    checkInMessage: params.checkInMessage,
    packet: {
      title,
      body,
      url,
      tag,
    },
    simulatedWebPush: {
      title,
      body,
      data: {
        url,
        tag,
        phase: "dashboard",
        characterId: params.candidate.characterId,
        worldId: params.candidate.worldId,
        proactive: true,
        ambientSlot: params.ambient.localTimeSlot,
        timelineIndicator: params.ambient.stateDrift.timelineIndicator,
      },
    },
  };
}

export function computeProactiveAbsenceMs(updatedAt: string): number {
  const parsed = Date.parse(updatedAt);
  if (Number.isNaN(parsed)) {
    return 16 * 60 * 60 * 1000;
  }
  return Math.max(0, Date.now() - parsed);
}

export interface PeripheralProactiveDispatchResult {
  checkInMessage: string;
  envelope: ProactivePushEnvelope;
  ambient: PeripheralAmbientPayload;
}

export async function buildPeripheralProactiveDispatch(
  candidate: ProactivePingCandidate,
): Promise<PeripheralProactiveDispatchResult> {
  let character = buildFallbackCharacter(candidate.characterId);
  try {
    character = await getCharacter(candidate.characterId);
  } catch {
    // fallback retained
  }

  const matrixArchetype = resolveMatrixArchetype(
    candidate.worldId,
    candidate.characterId,
    character.name,
  );

  const absenceMs = computeProactiveAbsenceMs(candidate.updatedAt);
  const absenceLabel = formatAbsenceLabel(absenceMs);

  const [milestones, slimHistory] = await Promise.all([
    fetchUserWorldMilestones(candidate.userId),
    fetchGlobalNarrativeHistory(candidate.worldId, 8),
  ]);

  const relationshipVector = computeRelationshipVector(
    slimHistory.filter(
      (entry) =>
        entry.character_id === null ||
        entry.character_id === candidate.characterId,
    ),
    candidate.characterId,
  );

  const memory = buildPersistentMemoryFacts(slimHistory, candidate.characterId);

  const ambient = buildPeripheralAmbientPayload({
    userId: candidate.userId,
    worldId: candidate.worldId,
    lastActivityIso: candidate.updatedAt,
    absenceMs,
    relationshipVector,
    milestones,
    memoryHeadline: memory.headlineCallback,
  });

  const graphMemoryRows = await traverseGraphMemory({
    userId: candidate.userId,
    worldId: candidate.worldId,
    characterId: candidate.characterId,
    query: [
      ambient.narrativeQuery,
      memory.headlineCallback ?? "",
      ambient.ambientCondition,
      `silence ${absenceLabel}`,
    ]
      .filter(Boolean)
      .join(" "),
    matchCount: 5,
  });

  const graphMemoryBlock = synthesizeGraphMemoryPayload(graphMemoryRows);

  const checkInMessage = await generatePeripheralProactiveCheckIn({
    characterName: matrixArchetype.characterDisplayName,
    worldName: WORLD_NAMES[candidate.worldId] ?? "Velvet World",
    systemPrompt: buildMatrixScopedSystemPrompt(
      character.system_prompt,
      matrixArchetype,
    ),
    personality: `${matrixArchetype.personaTitle}. ${matrixArchetype.psychologicalProfile}`,
    relationshipVector,
    absenceLabel,
    memoryHeadline: memory.headlineCallback,
    ambient,
    graphMemoryBlock,
  });

  const envelope = assembleProactivePushEnvelope({
    candidate,
    characterName: matrixArchetype.characterDisplayName,
    checkInMessage,
    ambient,
  });

  await recordProactiveAmbientContact({
    userId: candidate.userId,
    worldId: candidate.worldId,
    characterId: candidate.characterId,
    characterName: matrixArchetype.characterDisplayName,
    conversationId: candidate.conversationId,
    checkInMessage,
    ambientContext: {
      localTimeSlot: ambient.localTimeSlot,
      ambientCondition: ambient.ambientCondition,
      timelineIndicator: ambient.stateDrift.timelineIndicator,
      silenceHours: ambient.stateDrift.silenceHours,
      crossWorldActivity: ambient.crossWorldActivity,
    },
  });

  return { checkInMessage, envelope, ambient };
}
