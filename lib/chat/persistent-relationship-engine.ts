import type {
  GlobalNarrativeMessage,
  RelationshipVector,
} from "@/lib/types/database";
import { computeRelationshipVector } from "@/lib/chat/relationship-vectors";

export type DialogueStance =
  | "cold"
  | "warm"
  | "neutral"
  | "defiant"
  | "flirtatious";

export interface DialogueBehaviorSnapshot {
  lastChoiceIndex: 0 | 1 | null;
  lastChoiceText: string | null;
  stance: DialogueStance;
  consecutiveColdChoices: number;
}

export interface PersistentMemoryFacts {
  factLines: string[];
  hasPriorHistory: boolean;
  lastUserStatement: string | null;
  lastCharacterStatement: string | null;
  headlineCallback: string | null;
}

export interface RelationshipInitContext {
  memory: PersistentMemoryFacts;
  vector: RelationshipVector;
  absenceMs: number;
  absenceLabel: string;
  dialogueBehavior: DialogueBehaviorSnapshot;
  isResumeSession: boolean;
}

const COLD_SIGNALS = [
  "cold",
  "distant",
  "don't care",
  "whatever",
  "leave",
  "back off",
  "not interested",
  "stop",
  "fine",
  "guard",
  "wall",
  "silent",
  "ignore",
  "walk away",
  "no",
  "won't",
  "can't",
  "busy",
  "later",
];

const WARM_SIGNALS = [
  "miss",
  "love",
  "want",
  "stay",
  "sorry",
  "trust",
  "need you",
  "hold",
  "kiss",
  "yes",
  "please",
  "together",
  "care",
];

const DEFIANT_SIGNALS = [
  "won't",
  "make me",
  "try me",
  "your problem",
  "don't tell",
  "who are you",
  "whatever you say",
];

const FLIRT_SIGNALS = [
  "flirt",
  "tease",
  "come here",
  "dangerous",
  "want you",
  "hands",
  "closer",
  "prove",
];

const ABSENCE_PULSE_THRESHOLD_MS = 20 * 60 * 1000;

function truncate(text: string, max = 140): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
}

function countSignals(text: string, signals: readonly string[]): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const signal of signals) {
    if (lower.includes(signal)) {
      hits += 1;
    }
  }
  return hits;
}

function conversationIdsForCharacter(
  history: GlobalNarrativeMessage[],
  characterId: number,
): Set<number> {
  return new Set(
    history
      .filter((entry) => entry.character_id === characterId)
      .map((entry) => entry.conversation_id),
  );
}

export function buildPersistentMemoryFacts(
  globalHistory: GlobalNarrativeMessage[],
  characterId: number,
): PersistentMemoryFacts {
  const characterConversations = conversationIdsForCharacter(
    globalHistory,
    characterId,
  );

  const relevant = globalHistory.filter(
    (entry) =>
      entry.character_id === characterId ||
      (entry.character_id === null &&
        characterConversations.has(entry.conversation_id)),
  );

  const userLines = relevant
    .filter((entry) => entry.character_id === null)
    .map((entry) => entry.content);
  const characterLines = relevant
    .filter((entry) => entry.character_id === characterId)
    .map((entry) => entry.content);

  const factLines: string[] = [];

  if (userLines.length > 0) {
    factLines.push(`User previously said: "${truncate(userLines.at(-1) ?? "")}"`);
  }
  if (userLines.length > 1) {
    factLines.push(
      `Earlier user statement: "${truncate(userLines.at(-2) ?? "")}"`,
    );
  }
  if (characterLines.length > 0) {
    factLines.push(
      `You previously told them: "${truncate(characterLines.at(-1) ?? "")}"`,
    );
  }

  const memorableUser = userLines.find(
    (line) =>
      countSignals(line, [...COLD_SIGNALS, ...WARM_SIGNALS, ...DEFIANT_SIGNALS]) >
      0,
  );

  const headlineCallback = memorableUser
    ? truncate(memorableUser)
    : userLines.at(-1)
      ? truncate(userLines.at(-1)!)
      : null;

  return {
    factLines,
    hasPriorHistory: relevant.length > 0,
    lastUserStatement: userLines.at(-1) ?? null,
    lastCharacterStatement: characterLines.at(-1) ?? null,
    headlineCallback,
  };
}

export function inferDialogueStance(
  text: string | null,
  choiceIndex: 0 | 1 | null,
): DialogueStance {
  if (!text) {
    return choiceIndex === 1 ? "cold" : "neutral";
  }

  const coldScore = countSignals(text, COLD_SIGNALS);
  const warmScore = countSignals(text, WARM_SIGNALS);
  const defiantScore = countSignals(text, DEFIANT_SIGNALS);
  const flirtScore = countSignals(text, FLIRT_SIGNALS);

  if (defiantScore >= warmScore && defiantScore >= coldScore) {
    return "defiant";
  }
  if (flirtScore >= warmScore && flirtScore > coldScore) {
    return "flirtatious";
  }
  if (coldScore > warmScore) {
    return "cold";
  }
  if (warmScore > coldScore) {
    return "warm";
  }
  if (choiceIndex === 1) {
    return "cold";
  }
  if (choiceIndex === 0) {
    return "warm";
  }
  return "neutral";
}

export function mergeDialogueBehavior(
  clientSnapshot: Partial<DialogueBehaviorSnapshot> | undefined,
  globalHistory: GlobalNarrativeMessage[],
  characterId: number,
): DialogueBehaviorSnapshot {
  const characterConversations = conversationIdsForCharacter(
    globalHistory,
    characterId,
  );
  const userLines = globalHistory
    .filter(
      (entry) =>
        entry.character_id === null &&
        characterConversations.has(entry.conversation_id),
    )
    .map((entry) => entry.content);

  const lastChoiceText =
    clientSnapshot?.lastChoiceText?.trim() || userLines.at(-1) || null;
  const lastChoiceIndex = clientSnapshot?.lastChoiceIndex ?? null;
  const stance =
    clientSnapshot?.stance ??
    inferDialogueStance(lastChoiceText, lastChoiceIndex);

  let consecutiveColdChoices = clientSnapshot?.consecutiveColdChoices ?? 0;
  if (stance === "cold" || stance === "defiant") {
    consecutiveColdChoices = Math.max(1, consecutiveColdChoices);
  } else if (stance === "warm" || stance === "flirtatious") {
    consecutiveColdChoices = 0;
  }

  return {
    lastChoiceIndex,
    lastChoiceText,
    stance,
    consecutiveColdChoices,
  };
}

export function formatAbsenceLabel(absenceMs: number): string {
  if (absenceMs < 60 * 1000) {
    return "a minute";
  }
  const minutes = Math.floor(absenceMs / (60 * 1000));
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function computeAbsenceMs(params: {
  lastSeenAt?: string;
  lastMessageAt?: string;
}): number {
  const timestamps: number[] = [];
  if (params.lastSeenAt) {
    const parsed = Date.parse(params.lastSeenAt);
    if (!Number.isNaN(parsed)) {
      timestamps.push(parsed);
    }
  }
  if (params.lastMessageAt) {
    const parsed = Date.parse(params.lastMessageAt);
    if (!Number.isNaN(parsed)) {
      timestamps.push(parsed);
    }
  }
  if (timestamps.length === 0) {
    return 0;
  }
  const anchor = Math.max(...timestamps);
  return Math.max(0, Date.now() - anchor);
}

export function shouldInjectReturnPulse(absenceMs: number): boolean {
  return absenceMs >= ABSENCE_PULSE_THRESHOLD_MS;
}

export function buildRelationshipInitContext(params: {
  globalHistory: GlobalNarrativeMessage[];
  characterId: number;
  lastSeenAt?: string;
  lastMessageAt?: string;
  dialogueBehavior?: Partial<DialogueBehaviorSnapshot>;
  isResumeSession: boolean;
}): RelationshipInitContext {
  const memory = buildPersistentMemoryFacts(
    params.globalHistory,
    params.characterId,
  );
  const vector = computeRelationshipVector(
    params.globalHistory.filter(
      (entry) =>
        entry.character_id === null ||
        entry.character_id === params.characterId,
    ),
    params.characterId,
  );
  const absenceMs = computeAbsenceMs({
    lastSeenAt: params.lastSeenAt,
    lastMessageAt: params.lastMessageAt,
  });
  const dialogueBehavior = mergeDialogueBehavior(
    params.dialogueBehavior,
    params.globalHistory,
    params.characterId,
  );

  return {
    memory,
    vector,
    absenceMs,
    absenceLabel: formatAbsenceLabel(absenceMs),
    dialogueBehavior,
    isResumeSession: params.isResumeSession,
  };
}

export function formatMemoryBlockForPrompt(
  memory: PersistentMemoryFacts,
  vector: RelationshipVector,
): string {
  const lines = [
    "PERSISTENT RELATIONSHIP MEMORY GATEWAY (mandatory — never reset to day zero):",
    `- trust vector: ${vector.trust.toFixed(3)} | intimacy: ${vector.intimacy.toFixed(3)} | hostility: ${vector.hostility.toFixed(3)} | tension: ${vector.tension.toFixed(3)}`,
  ];

  if (memory.hasPriorHistory) {
    lines.push("- This is NOT a first meeting. Prior sessions exist in Supabase.");
    for (const fact of memory.factLines) {
      lines.push(`- ${fact}`);
    }
    if (memory.headlineCallback) {
      lines.push(
        `- CALLBACK ANCHOR (you MUST reference this or an adjacent fact in message 1): "${memory.headlineCallback}"`,
      );
    }
  } else {
    lines.push(
      "- No prior logged history — still forbid generic 'Hello' openers. Open with a charged in-world hook tied to your personality.",
    );
  }

  return lines.join("\n");
}

export function formatDialogueBehaviorBlock(
  behavior: DialogueBehaviorSnapshot,
): string {
  const lines = [
    "PLAYER DIALOGUE BEHAVIOR METRICS (plot engine must honor this):",
    `- last stance: ${behavior.stance}`,
    `- consecutive cold/defiant choices: ${behavior.consecutiveColdChoices}`,
  ];
  if (behavior.lastChoiceText) {
    lines.push(`- last user move: "${truncate(behavior.lastChoiceText)}"`);
  }
  if (behavior.stance === "cold" || behavior.stance === "defiant") {
    lines.push(
      "- Card 1 MUST confront their distance — title like 'The Consequence of Your Coldness' or equivalent. Force initiative; demand answers about their past withdrawal.",
    );
  }
  return lines.join("\n");
}
