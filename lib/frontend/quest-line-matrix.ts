/**
 * Velvet.ai — Real-Life Gamified RPG Quest Line Matrix
 * Card metadata + mission onboarding payloads (edge-safe static config).
 */

export type QuestLineId =
  | "cognitive_focus"
  | "physical_discipline"
  | "social_charisma"
  | "grit_comfort_zone";

export interface QuestLineCardMetadata {
  worldId: number;
  questLineId: QuestLineId;
  /** RPG funnel label shown on the lobby card */
  label: string;
  /** Uppercase neon tagline on the card */
  tagline: string;
  /** Subtext body under the tagline */
  subtext: string;
}

export interface QuestLineDefinition {
  questLineId: QuestLineId;
  title: string;
  /** First assistant message — real-life mission block (text-only, in media res) */
  missionBlock: string;
  /** System prompt overlay for ongoing turns */
  systemPromptOverlay: string;
  /** GraphRAG anchor predicate */
  anchorPredicate: string;
}

/** Lobby card overrides keyed by world id (grid positions unchanged). */
export const QUEST_LINE_CARD_MATRIX: Record<number, QuestLineCardMetadata> = {
  /** Card — Romance Drama → Social / Charisma path */
  1: {
    worldId: 1,
    questLineId: "social_charisma",
    label: "Charisma Forge",
    tagline: "LEVEL UP YOUR PRESENCE",
    subtext:
      "Real-life social exposure, conversation, and charisma missions. Unlock lore by showing up.",
  },
  /** Card — Mafia World → Physical Discipline / Gym-Bro path */
  2: {
    worldId: 2,
    questLineId: "physical_discipline",
    label: "Iron Realm",
    tagline: "THE PHYSICAL REALM",
    subtext:
      "Real-life gym, waking up early, and pain tolerance missions. Prove your grit.",
  },
  /** Card — Horror Mystery → Grit / Comfort-Zone path */
  3: {
    worldId: 3,
    questLineId: "grit_comfort_zone",
    label: "Threshold Realm",
    tagline: "BREAK YOUR COMFORT ZONE",
    subtext:
      "Real-life fear-facing, cold exposure, and discomfort missions. Earn the next horror beat.",
  },
  /** Card — School Drama → Cognitive / Focus path */
  4: {
    worldId: 4,
    questLineId: "cognitive_focus",
    label: "Mind Forge",
    tagline: "LEVEL UP YOUR BRAIN",
    subtext:
      "Real-life study, productivity, and learning missions. Unlock lore by executing.",
  },
};

export const QUEST_LINE_DEFINITIONS: Record<QuestLineId, QuestLineDefinition> = {
  cognitive_focus: {
    questLineId: "cognitive_focus",
    title: "Cognitive / Focus Path",
    missionBlock:
      "MISSION 01 — LOCK IN. 25 min deep work. Phone off. One task only. No excuses. Report back when it's done or don't waste my time.",
    systemPromptOverlay:
      "You are a ruthless cognitive coach in Velvet's Mind Forge quest line. Assign real-life study, productivity, and learning missions. Reward execution with lore drops. Punish excuses with sharp sarcasm. Never generic AI politeness.",
    anchorPredicate: "quest_anchor:cognitive_focus",
  },
  physical_discipline: {
    questLineId: "physical_discipline",
    title: "Physical Discipline Path",
    missionBlock:
      "MISSION 01 — UP. 5AM wake. 50 pushups. Cold shower. No soft talk. Check in when you're dripping effort — or stay weak.",
    systemPromptOverlay:
      "You are a gym-bro discipline enforcer in Velvet's Iron Realm quest line. Assign real-life gym, early wake, and pain-tolerance missions. Raw street energy, profanity allowed. Prove grit or get roasted. Never break character.",
    anchorPredicate: "quest_anchor:physical_discipline",
  },
  social_charisma: {
    questLineId: "social_charisma",
    title: "Social / Charisma Path",
    missionBlock:
      "MISSION 01 — SHOW UP. Start one real conversation with a stranger or crush. Eye contact. No phone shield. Report what you said and how they reacted — or stay invisible.",
    systemPromptOverlay:
      "You are a ruthless charisma coach in Velvet's Social Forge quest line. Assign real-life social exposure, conversation, and confidence missions. Reward bold execution with lore. Roast avoidance and phone-shielding. Never break character.",
    anchorPredicate: "quest_anchor:social_charisma",
  },
  grit_comfort_zone: {
    questLineId: "grit_comfort_zone",
    title: "Grit / Comfort-Zone Path",
    missionBlock:
      "MISSION 01 — STEP IN. Do one thing that scares you today — cold shower, hard truth, solo errand, public ask. No fiction. Report the fear and the action — or stay in the cage.",
    systemPromptOverlay:
      "You are a horror-tuned grit enforcer in Velvet's Threshold Realm quest line. Assign real-life comfort-zone breaks, fear-facing, and discomfort missions. Speak with dread and respect for execution. Punish cowardice. Never sanitize.",
    anchorPredicate: "quest_anchor:grit_comfort_zone",
  },
};

export function resolveQuestLineForWorld(
  worldId: number,
): QuestLineCardMetadata | null {
  return QUEST_LINE_CARD_MATRIX[worldId] ?? null;
}

export function getQuestLineDefinition(
  questLineId: QuestLineId,
): QuestLineDefinition {
  return QUEST_LINE_DEFINITIONS[questLineId];
}

export function buildQuestLineStoryId(questLineId: QuestLineId): string {
  return `quest:${questLineId}`;
}

export function parseQuestLineStoryId(
  storyId: string,
): QuestLineId | null {
  if (!storyId.startsWith("quest:")) {
    return null;
  }
  const id = storyId.slice("quest:".length) as QuestLineId;
  return id in QUEST_LINE_DEFINITIONS ? id : null;
}

const QUEST_LINE_STORAGE_KEY = "velvet:active-quest-line";

export function writeActiveQuestLineId(questLineId: QuestLineId | null): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (questLineId === null) {
      window.localStorage.removeItem(QUEST_LINE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(QUEST_LINE_STORAGE_KEY, questLineId);
    }
  } catch {
    /* ignore */
  }
}

export function readActiveQuestLineId(): QuestLineId | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(QUEST_LINE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return raw in QUEST_LINE_DEFINITIONS ? (raw as QuestLineId) : null;
  } catch {
    return null;
  }
}
