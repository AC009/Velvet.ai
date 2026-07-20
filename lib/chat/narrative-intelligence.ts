import type { GlobalNarrativeMessage } from "@/lib/types/database";
import {
  CLIFFHANGER_APPROACH_MODIFIER,
  CLIFFHANGER_APPROACH_THRESHOLD,
  CLIFFHANGER_SYSTEM_MODIFIER,
  NARRATIVE_PROGRESSION_DIRECTIVE,
  SESSION_MESSAGE_CLIFFHANGER_THRESHOLD,
  SHARED_MEMORY_DIRECTIVE,
  SMS_COMMS_FORMATTING_LAWS,
} from "@/lib/chat/constants";

export type DetectedInteractionType =
  | "confession"
  | "lie"
  | "argument"
  | "intimacy"
  | "secret"
  | "betrayal";

export interface CrossCharacterThread {
  characterId: number;
  characterName: string;
  userMessages: string[];
  characterMessages: string[];
  detectedEvents: DetectedInteractionType[];
}

export interface SharedMemoryAnalysis {
  threads: CrossCharacterThread[];
  hasCrossCharacterHistory: boolean;
  summaryLines: string[];
}

export type RetentionPhase = "normal" | "approaching" | "climax";

export interface RetentionState {
  phase: RetentionPhase;
  messageCount: number;
  messagesUntilLock: number;
  modifier: string | null;
}

const CONFESSION_SIGNALS = [
  "confess",
  "admit",
  "truth is",
  "i love",
  "i feel",
  "never told",
  "secret is",
  "the truth",
  "i can't hide",
];

const LIE_SIGNALS = [
  "lie",
  "lying",
  "not true",
  "deceive",
  "pretend",
  "fake",
  "cover up",
  "hide the truth",
  "wasn't me",
];

const ARGUMENT_SIGNALS = [
  "angry",
  "fight",
  "argue",
  "how dare",
  "betray",
  "trust you",
  "wrong",
  "hate",
  "leave me",
  "don't ever",
];

const INTIMACY_SIGNALS = [
  "kiss",
  "touch",
  "hold",
  "close",
  "miss you",
  "want you",
  "stay with",
  "in love",
  "heart",
];

const SECRET_SIGNALS = [
  "secret",
  "don't tell",
  "between us",
  "no one knows",
  "whisper",
  "private",
  "classified",
];

const BETRAYAL_SIGNALS = [
  "betray",
  "traitor",
  "cheat",
  "behind my back",
  "with him",
  "with her",
  "you and",
];

function containsSignal(text: string, signals: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return signals.some((signal) => lower.includes(signal));
}

function detectEvents(text: string): DetectedInteractionType[] {
  const events: DetectedInteractionType[] = [];
  if (containsSignal(text, CONFESSION_SIGNALS)) events.push("confession");
  if (containsSignal(text, LIE_SIGNALS)) events.push("lie");
  if (containsSignal(text, ARGUMENT_SIGNALS)) events.push("argument");
  if (containsSignal(text, INTIMACY_SIGNALS)) events.push("intimacy");
  if (containsSignal(text, SECRET_SIGNALS)) events.push("secret");
  if (containsSignal(text, BETRAYAL_SIGNALS)) events.push("betrayal");
  return events;
}

function truncateExcerpt(text: string, maxLength: number = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function uniqueEvents(events: DetectedInteractionType[]): DetectedInteractionType[] {
  return [...new Set(events)];
}

function formatEventLabel(event: DetectedInteractionType): string {
  const labels: Record<DetectedInteractionType, string> = {
    confession: "confession / vulnerable admission",
    lie: "deception or evasion",
    argument: "conflict or heated argument",
    intimacy: "intimate or romantic exchange",
    secret: "shared secret",
    betrayal: "betrayal or double-cross subtext",
  };
  return labels[event];
}

export function analyzeCrossCharacterMemory(
  history: GlobalNarrativeMessage[],
  currentCharacterId: number,
): SharedMemoryAnalysis {
  const otherCharacterIds = [
    ...new Set(
      history
        .map((entry) => entry.character_id)
        .filter(
          (id): id is number =>
            id !== null && id !== currentCharacterId,
        ),
    ),
  ];

  const threads: CrossCharacterThread[] = otherCharacterIds.map(
    (characterId) => {
      const characterEntries = history.filter(
        (entry) => entry.character_id === characterId,
      );
      const characterName =
        characterEntries.find((entry) => entry.character_name)?.character_name ??
        `Character #${characterId}`;

      const characterMessages = characterEntries.map((entry) => entry.content);

      const conversationIds = new Set(
        characterEntries.map((entry) => entry.conversation_id),
      );

      const userMessages = history
        .filter(
          (entry) =>
            entry.character_id === null &&
            conversationIds.has(entry.conversation_id),
        )
        .map((entry) => entry.content);

      const allText = [...userMessages, ...characterMessages].join(" ");
      const detectedEvents = uniqueEvents(detectEvents(allText));

      return {
        characterId,
        characterName,
        userMessages,
        characterMessages,
        detectedEvents,
      };
    },
  );

  const summaryLines: string[] = [];

  for (const thread of threads) {
    if (thread.userMessages.length === 0 && thread.characterMessages.length === 0) {
      continue;
    }

    const latestUser = thread.userMessages.at(-1);
    const latestCharacter = thread.characterMessages.at(-1);

    summaryLines.push(
      `• Thread with ${thread.characterName}:`,
    );

    if (thread.detectedEvents.length > 0) {
      summaryLines.push(
        `  Detected dynamics: ${thread.detectedEvents.map(formatEventLabel).join("; ")}.`,
      );
    }

    if (latestUser) {
      summaryLines.push(
        `  User said: "${truncateExcerpt(latestUser)}"`,
      );
    }

    if (latestCharacter) {
      summaryLines.push(
        `  ${thread.characterName} replied: "${truncateExcerpt(latestCharacter)}"`,
      );
    }
  }

  return {
    threads: threads.filter(
      (thread) =>
        thread.userMessages.length > 0 || thread.characterMessages.length > 0,
    ),
    hasCrossCharacterHistory: summaryLines.length > 0,
    summaryLines,
  };
}

export function buildSharedMemoryBlock(
  _analysis: SharedMemoryAnalysis,
  currentCharacterName: string,
): string {
  return [
    SHARED_MEMORY_DIRECTIVE,
    "",
    `CHARACTER ISOLATION PROTOCOL — ACTIVE for ${currentCharacterName}:`,
    "You operate in a sealed narrative thread. Other characters' scripts, names, and plotlines are OFF-LIMITS.",
    "Do not reference Kael, Lucien, Ayame, Dante, or any other character unless the user explicitly mentions them in this session.",
    "If the user mentions another character, react with YOUR personality only — curiosity, jealousy, or dismissal — but never invent their private scenes.",
    "",
    "Focus exclusively on your relationship with this user. Your canon is the session log below.",
  ].join("\n");
}

export function buildRetentionState(messageCount: number): RetentionState {
  const messagesUntilLock = Math.max(
    0,
    SESSION_MESSAGE_CLIFFHANGER_THRESHOLD - messageCount,
  );

  if (messageCount >= SESSION_MESSAGE_CLIFFHANGER_THRESHOLD) {
    return {
      phase: "climax",
      messageCount,
      messagesUntilLock: 0,
      modifier: CLIFFHANGER_SYSTEM_MODIFIER,
    };
  }

  if (messageCount >= CLIFFHANGER_APPROACH_THRESHOLD) {
    return {
      phase: "approaching",
      messageCount,
      messagesUntilLock,
      modifier: CLIFFHANGER_APPROACH_MODIFIER,
    };
  }

  return {
    phase: "normal",
    messageCount,
    messagesUntilLock,
    modifier: null,
  };
}

export function assembleNarrativeIntelligencePrompt(params: {
  globalHistory: GlobalNarrativeMessage[];
  currentCharacterId: number;
  currentCharacterName: string;
  messageCount: number;
  worldId: number;
}): string {
  const memoryAnalysis = analyzeCrossCharacterMemory(
    params.globalHistory,
    params.currentCharacterId,
  );

  const sharedMemoryBlock = buildSharedMemoryBlock(
    memoryAnalysis,
    params.currentCharacterName,
  );

  const retention = buildRetentionState(params.messageCount);

  const sections: string[] = [
    "═══ VELVET NARRATIVE INTELLIGENCE CORE ═══",
    "",
    SMS_COMMS_FORMATTING_LAWS,
    "",
    sharedMemoryBlock,
    "",
    NARRATIVE_PROGRESSION_DIRECTIVE,
  ];

  if (retention.phase === "approaching") {
    sections.push(
      "",
      `SESSION STATUS: Message ${retention.messageCount}/${SESSION_MESSAGE_CLIFFHANGER_THRESHOLD}. ${retention.messagesUntilLock} exchange(s) until narrative lock.`,
      "",
      retention.modifier ?? "",
    );
  }

  if (retention.phase === "climax") {
    sections.push(
      "",
      `SESSION STATUS: Message ${retention.messageCount}/${SESSION_MESSAGE_CLIFFHANGER_THRESHOLD}. FINAL EXCHANGE — 12-hour lock triggers after this response.`,
      "",
      retention.modifier ?? "",
    );
  }

  sections.push(
    "",
    `World context: All events occur within World #${params.worldId}. Continuity is absolute across every character thread.`,
  );

  return sections.filter(Boolean).join("\n");
}

export function getRetentionPhase(messageCount: number): RetentionPhase {
  return buildRetentionState(messageCount).phase;
}
