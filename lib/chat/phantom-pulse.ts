import {
  buildFallbackCharacter,
} from "@/lib/chat/character-fallbacks";
import { getCharacter } from "@/lib/chat/conversation-store";
import { fetchGlobalNarrativeHistory } from "@/lib/chat/narrative-context";
import {
  buildPersistentMemoryFacts,
  formatAbsenceLabel,
} from "@/lib/chat/persistent-relationship-engine";
import {
  resolveMatrixArchetype,
  type CharacterArchetypeId,
  type StateArchetype,
} from "@/lib/chat/greeting-constants";
import { buildCharacterDeepLink } from "@/lib/push/deep-link";
import type { PhantomPushPacket } from "@/lib/push/types";

export interface PhantomPulseCandidate {
  conversationId: number;
  userId: string;
  worldId: number;
  lockedUntil: string | null;
  updatedAt: string;
  characterId: number;
}

interface PhantomVoiceContext {
  name: string;
  callback: string | null;
  absence: string;
  isLocked: boolean;
  /** Short genre micro-marker (e.g. "docks", "server room") for genre accuracy. */
  genreMarker: string;
}

/**
 * Voice templates keyed by CHARACTER ARCHETYPE (not genre), so each character's
 * verbal habits stay constant across all four genres while the genre marker
 * adapts the setting. 1=Lucien (cold/clinical), 2=Kael (fast/chaotic/tech),
 * 3=Ayame (icy/minimal/cryptic), 4=Dante (heavy/fatalistic/protective).
 */
const PHANTOM_VOICE_TEMPLATES: Record<
  CharacterArchetypeId,
  (ctx: PhantomVoiceContext) => string
> = {
  1: ({ name, callback, absence, isLocked, genreMarker }) => {
    if (isLocked) {
      return `${name}: The ${genreMarker} stays sealed until I say otherwise. ${absence} gone and I still own this. Open Velvet.`;
    }
    return callback
      ? `${name}: ${absence} away. I don't repeat myself, yet here I am — "${callback.slice(0, 44)}…" Open the chat. Now.`
      : `${name}: ${absence} of your absence. I don't wait for anyone. Make an exception and come back to me.`;
  },
  2: ({ name, callback, absence, isLocked, genreMarker }) => {
    if (isLocked) {
      return `${name}: ${absence} dark and the ${genreMarker} lock is still screaming your name. get back online before i brute-force you back.`;
    }
    return callback
      ? `${name}: yo. ${absence} offline. the signal kept looping "${callback.slice(0, 36)}…" — i can't unhear it. get back in. now.`
      : `${name}: ${absence} of dead air. the ${genreMarker} won't stop pinging you. quit ghosting and reconnect.`;
  },
  3: ({ name, callback, absence, isLocked, genreMarker }) => {
    if (isLocked) {
      return `${name}: ${absence}. The ${genreMarker} is still closed. The silence has a shape, and it is shaped like you. Return.`;
    }
    return callback
      ? `${name}: ${absence} of quiet. I heard the echo — "${callback.slice(0, 38)}…" — it has not faded. Come back.`
      : `${name}: ${absence}. The ${genreMarker} remembers what you will not say. Neither of us is finished. Return.`;
  },
  4: ({ name, callback, absence, isLocked, genreMarker }) => {
    if (isLocked) {
      return `${name}: ${absence} since you went dark. The ${genreMarker} is still locked and I'm still standing watch. Don't make that a mistake.`;
    }
    return callback
      ? `${name}: ${absence} since you left mid-sentence — "${callback.slice(0, 40)}…" I kept the thread open. Don't make me regret it.`
      : `${name}: ${absence} of silence near the ${genreMarker}. I kept watch the whole time. Come back before I come looking.`;
  },
};

const GENRE_MARKERS: Record<number, string> = {
  1: "line between us",
  2: "docks",
  3: "ritual",
  4: "back row",
};

function resolveGenreMarker(archetype: StateArchetype): string {
  return GENRE_MARKERS[archetype.activeGenreId] ?? "thread";
}

export async function assemblePhantomPushPacket(params: {
  candidate: PhantomPulseCandidate;
  absenceMs: number;
}): Promise<PhantomPushPacket> {
  const { candidate, absenceMs } = params;
  const absenceLabel = formatAbsenceLabel(absenceMs);
  const isLocked =
    candidate.lockedUntil !== null &&
    Date.parse(candidate.lockedUntil) > Date.now();

  let resolvedName = "Someone";
  let worldId = candidate.worldId;

  try {
    const character = await getCharacter(candidate.characterId);
    resolvedName = character.name;
    worldId = character.world_id;
  } catch {
    const fallback = buildFallbackCharacter(candidate.characterId);
    resolvedName = fallback.name;
    worldId = fallback.world_id;
  }

  // Genre is the active world the user is playing in; persona/voice is locked
  // to the resolved character archetype so identity never bleeds between nodes.
  const archetype = resolveMatrixArchetype(
    candidate.worldId,
    candidate.characterId,
    resolvedName,
  );
  const characterName = archetype.characterDisplayName;

  let headline: string | null = null;
  try {
    const history = await fetchGlobalNarrativeHistory(worldId);
    const memory = buildPersistentMemoryFacts(history, candidate.characterId);
    headline = memory.headlineCallback;
  } catch {
    headline = null;
  }

  const voice = PHANTOM_VOICE_TEMPLATES[archetype.activeCharacterId];
  const body = voice({
    name: characterName,
    callback: headline,
    absence: absenceLabel,
    isLocked,
    genreMarker: resolveGenreMarker(archetype),
  });

  return {
    title: `${characterName} 💬`,
    body: body.slice(0, 220),
    url: buildCharacterDeepLink({
      worldId: candidate.worldId,
      characterId: candidate.characterId,
    }),
    tag: `phantom-${candidate.conversationId}-${Date.now()}`,
  };
}

export function computePhantomAbsenceMs(updatedAt: string): number {
  const parsed = Date.parse(updatedAt);
  if (Number.isNaN(parsed)) {
    return 4 * 60 * 60 * 1000;
  }
  return Math.max(0, Date.now() - parsed);
}

export function resolveFallbackCharacterId(worldId: number): number {
  const worldDefaults: Record<number, number> = {
    1: 1,
    2: 5,
    3: 7,
    4: 9,
  };
  return worldDefaults[worldId] ?? 1;
}
