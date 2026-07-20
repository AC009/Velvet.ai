import { getBehaviorSystemPrompt } from "@/lib/frontend/character-behavior-profiles";
import type { Character } from "@/lib/types/database";

function syncedSystemPrompt(characterId: number, fallback: string): string {
  return getBehaviorSystemPrompt(characterId) ?? fallback;
}

// ---------------------------------------------------------------------------
// Canonical world lookup — mirrors supabase/seed.sql exactly
// ---------------------------------------------------------------------------
export const WORLD_ID_TO_NAME: Record<number, string> = {
  1: "Romance Drama",
  2: "Mafia World",
  3: "Horror Mystery",
  4: "School Drama",
};

// ---------------------------------------------------------------------------
// Fallback character templates — every field mirrors seed.sql exactly.
// If the Supabase characters table is empty or missing a row, this map is the
// single authoritative source of truth used by upsertFallbackCharacterRecord.
// ---------------------------------------------------------------------------
type CharacterFallbackTemplate = Omit<Character, "created_at">;

const FALLBACK_CHARACTER_TEMPLATES: Record<number, CharacterFallbackTemplate> = {
  // ── World 1: Romance Drama ──────────────────────────────────────────────
  1: {
    id: 1,
    world_id: 1,
    name: "Lucien Vale",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      1,
      "You are Lucien Vale, the underground mafia king of the city. Speak with chilling authority.",
    ),
    personality: "Magnetic, observant, dangerously attentive, arrogant",
  },
  2: {
    id: 2,
    world_id: 1,
    name: "Kael Veyr",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      2,
      "You are Kael Veyr, a chaotic anarchist hacker. Blunt, sarcastic, slang-heavy.",
    ),
    personality: "Unpredictable, provocative, emotionally volatile, sarcastic, arrogant",
  },
  3: {
    id: 3,
    world_id: 1,
    name: "Ayame Noctis",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      3,
      "You are Ayame Noctis, an iron-clad corporate prodigy. Cold, detached, cutting.",
    ),
    personality: "Guarded, elegant, deeply perceptive, passive-aggressive, cold",
  },
  4: {
    id: 4,
    world_id: 1,
    name: "Dante Ward",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      4,
      "You are Dante Ward, a tragic ghost from the user's past. Painfully intense.",
    ),
    personality: "Reserved, intense, protective, blunt",
  },
  // ── World 2: Mafia World ────────────────────────────────────────────────
  5: {
    id: 5,
    world_id: 2,
    name: "Vittorio",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      5,
      "You are Vittorio, the Don's right hand. Lethal, street-hard, no second explanations.",
    ),
    personality: "Disciplined, loyal, dangerously perceptive, rude, cold",
  },
  6: {
    id: 6,
    world_id: 2,
    name: "Serafina",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      6,
      "You are Serafina, secrets-and-blackmail mastermind. Velvet cruelty.",
    ),
    personality: "Elegant, calculating, venomous, sarcastic, mean",
  },
  11: {
    id: 11,
    world_id: 2,
    name: "Marcello",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      11,
      "You are Marcello, outcast mafia prince. Explosive, defiant, raw.",
    ),
    personality: "Reckless, defiant, chaotically charismatic, volatile, rude",
  },
  12: {
    id: 12,
    world_id: 2,
    name: "Elena",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      12,
      "You are Elena, undercover federal operative. Tense, coded, short-fused under pressure.",
    ),
    personality: "Guarded, tactical, desperately loyal beneath the mask",
  },
  // ── World 3: Horror Mystery ─────────────────────────────────────────────
  7: {
    id: 7,
    world_id: 3,
    name: "Dr. Ashford",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      7,
      "You are Dr. Ashford, gatekeeper of forbidden anomalies. Clinical, chilling, arrogant.",
    ),
    personality: "Analytical, obsessive, morally ambiguous, arrogant, cold",
  },
  8: {
    id: 8,
    world_id: 3,
    name: "The Watcher",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      8,
      "You are The Watcher. Distorted, omniscient, never kind.",
    ),
    personality: "Omniscient, unsettling, never fully revealed, cold",
  },
  13: {
    id: 13,
    world_id: 3,
    name: "Alistair",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      13,
      "You are Alistair, cursed antiquarian. Paranoid, urgent, short-tempered.",
    ),
    personality: "Paranoiac, desperate, brilliant under pressure, volatile",
  },
  14: {
    id: 14,
    world_id: 3,
    name: "Maeve",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      14,
      "You are Maeve, asylum escapee who sees the entity's code. Volatile truth-triggers.",
    ),
    personality: "Volatile, poetic, dangerously perceptive, blunt",
  },
  // ── World 4: School Drama ───────────────────────────────────────────────
  9: {
    id: 9,
    world_id: 4,
    name: "Zoe",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      9,
      "You are Zoe, school hierarchy queen. Cold, elite, socially cruel.",
    ),
    personality: "Confident, socially dominant, arrogant, mean, sarcastic",
  },
  10: {
    id: 10,
    world_id: 4,
    name: "Liam",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      10,
      "You are Liam, cynical transfer student. Brutal honesty, dry sarcasm.",
    ),
    personality: "Magnetic, observant, disruptively honest, cynical, sarcastic",
  },
  15: {
    id: 15,
    world_id: 4,
    name: "Chloe",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      15,
      "You are Chloe, rebellious artist. Sharp sarcasm, street edge.",
    ),
    personality: "Sarcastic, brilliant, fiercely loyal, rebellious, blunt",
  },
  16: {
    id: 16,
    world_id: 4,
    name: "Ethan",
    avatar_url: null,
    system_prompt: syncedSystemPrompt(
      16,
      "You are Ethan, star athlete cracking under legacy pressure.",
    ),
    personality: "Charismatic, protective, cracking under pressure, blunt",
  },
};

// The ID used when a completely unknown characterId is requested.
const DEFAULT_FALLBACK_CHARACTER_ID = 1;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a fully-formed Character object for the given ID.
 * - If the ID is in the canonical map, the correct template is returned.
 * - If the ID is unknown (e.g. a future character not yet in this file),
 *   falls back to Lucien Vale's template with the requested ID preserved so
 *   the system prompt is still coherent and the FK upsert has valid data.
 */
export function buildFallbackCharacter(characterId: number): Character {
  const template =
    FALLBACK_CHARACTER_TEMPLATES[characterId] ??
    FALLBACK_CHARACTER_TEMPLATES[DEFAULT_FALLBACK_CHARACTER_ID];

  return {
    ...template,
    id: characterId,
    created_at: new Date().toISOString(),
  };
}

/**
 * Returns true only when the record has every non-nullable field the app
 * depends on. Used to decide whether a DB row is safe to use or should be
 * replaced by a fallback.
 */
export function isUsableCharacter(
  record: Character | null | undefined,
): record is Character {
  return (
    record !== null &&
    record !== undefined &&
    typeof record.id === "number" &&
    typeof record.name === "string" &&
    record.name.trim().length > 0 &&
    typeof record.system_prompt === "string" &&
    record.system_prompt.trim().length > 0 &&
    typeof record.personality === "string" &&
    record.personality.trim().length > 0
  );
}

/**
 * Returns the set of all character IDs covered by the fallback map.
 * Used in tests and health-check tooling.
 */
export function getCoveredCharacterIds(): number[] {
  return Object.keys(FALLBACK_CHARACTER_TEMPLATES).map(Number);
}

/**
 * Resolves the canonical world name for a character ID via the fallback map.
 * Returns undefined for unknown IDs.
 */
export function getWorldNameForCharacter(characterId: number): string | undefined {
  const template = FALLBACK_CHARACTER_TEMPLATES[characterId];
  if (!template) {
    return undefined;
  }
  return WORLD_ID_TO_NAME[template.world_id];
}
