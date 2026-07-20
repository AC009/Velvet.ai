import type { DialogueBehaviorSnapshot, DialogueStance } from "@/lib/chat/persistent-relationship-engine";

const LAST_SEEN_PREFIX = "velvet:last-seen:";
const DIALOGUE_PREFIX = "velvet:dialogue-behavior:";
const MEMORY_NOTES_PREFIX = "velvet:memory-notes:";

export const MEMORY_NOTES_UPDATED_EVENT = "velvet:memory-notes-updated";

function sessionKey(
  worldId: number,
  characterId: number,
  storyId: string,
): string {
  return `${worldId}:${characterId}:${storyId}`;
}

export function readSavedMemoryNotes(
  worldId: number,
  characterId: number,
  storyId: string,
): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(
    `${MEMORY_NOTES_PREFIX}${sessionKey(worldId, characterId, storyId)}`,
  );
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

export function appendSavedMemoryNote(
  worldId: number,
  characterId: number,
  storyId: string,
  snippet: string,
): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  const cleaned = snippet.trim();
  const existing = readSavedMemoryNotes(worldId, characterId, storyId);
  if (cleaned.length === 0 || existing.includes(cleaned)) {
    return existing;
  }
  const next = [...existing, cleaned];
  window.localStorage.setItem(
    `${MEMORY_NOTES_PREFIX}${sessionKey(worldId, characterId, storyId)}`,
    JSON.stringify(next),
  );
  window.dispatchEvent(new Event(MEMORY_NOTES_UPDATED_EVENT));
  return next;
}

export function readLastSeenAt(
  worldId: number,
  characterId: number,
  storyId: string,
): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const value = window.localStorage.getItem(
    `${LAST_SEEN_PREFIX}${sessionKey(worldId, characterId, storyId)}`,
  );
  return value ?? undefined;
}

export function writeLastSeenAt(
  worldId: number,
  characterId: number,
  storyId: string,
): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    `${LAST_SEEN_PREFIX}${sessionKey(worldId, characterId, storyId)}`,
    new Date().toISOString(),
  );
}

export function readDialogueBehavior(
  worldId: number,
  characterId: number,
  storyId: string,
): Partial<DialogueBehaviorSnapshot> | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const raw = window.localStorage.getItem(
    `${DIALOGUE_PREFIX}${sessionKey(worldId, characterId, storyId)}`,
  );
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as Partial<DialogueBehaviorSnapshot>;
  } catch {
    return undefined;
  }
}

export function writeDialogueBehavior(
  worldId: number,
  characterId: number,
  storyId: string,
  snapshot: DialogueBehaviorSnapshot,
): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    `${DIALOGUE_PREFIX}${sessionKey(worldId, characterId, storyId)}`,
    JSON.stringify(snapshot),
  );
}

export function inferStanceFromChoice(
  text: string,
  choiceIndex: 0 | 1,
): DialogueStance {
  const lower = text.toLowerCase();
  const coldHints = ["cold", "distant", "don't", "won't", "stop", "leave", "fine", "whatever"];
  const warmHints = ["miss", "want", "stay", "sorry", "trust", "yes", "please", "love"];

  const coldScore = coldHints.filter((hint) => lower.includes(hint)).length;
  const warmScore = warmHints.filter((hint) => lower.includes(hint)).length;

  if (coldScore > warmScore) {
    return choiceIndex === 1 ? "cold" : "defiant";
  }
  if (warmScore > coldScore) {
    return choiceIndex === 0 ? "warm" : "flirtatious";
  }
  return choiceIndex === 1 ? "cold" : "warm";
}

export function recordDialogueChoice(
  worldId: number,
  characterId: number,
  storyId: string,
  text: string,
  choiceIndex: 0 | 1,
): DialogueBehaviorSnapshot {
  const prior = readDialogueBehavior(worldId, characterId, storyId);
  const stance = inferStanceFromChoice(text, choiceIndex);
  const wasCold = stance === "cold" || stance === "defiant";
  const consecutiveColdChoices = wasCold
    ? (prior?.consecutiveColdChoices ?? 0) + 1
    : 0;

  const snapshot: DialogueBehaviorSnapshot = {
    lastChoiceIndex: choiceIndex,
    lastChoiceText: text.trim(),
    stance,
    consecutiveColdChoices,
  };

  writeDialogueBehavior(worldId, characterId, storyId, snapshot);
  return snapshot;
}
