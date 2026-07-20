/**
 * Emotional Subtext & Trajectory Engine
 *
 * Analyzes user tone beyond literal words, maintains a hidden avatar
 * affect tracker (0–100), and emits story-driving directives injected
 * immediately above the GraphRAG / vector memory payload.
 */

import type { GlobalNarrativeMessage, RelationshipVector } from "@/lib/types/database";

export type UserSubtextSignal =
  | "vulnerability"
  | "aggression"
  | "loneliness"
  | "manipulation"
  | "neutral";

export interface UserSubtextAnalysis {
  primary: UserSubtextSignal;
  secondary: UserSubtextSignal | null;
  scores: Record<Exclude<UserSubtextSignal, "neutral">, number>;
  summary: string;
}

/** Hidden internal emotional state — never narrated as a meter to the user. */
export interface EmotionalState {
  anger: number;
  lust: number;
  pride: number;
  trauma: number;
  affection: number;
}

export interface EmotionalTrajectory {
  subtext: UserSubtextAnalysis;
  state: EmotionalState;
  dominant: keyof EmotionalState;
  dominantScore: number;
  twistActive: boolean;
  twistMode: "coldness" | "sarcasm" | "brutal_honesty" | "outburst" | null;
  turnDepth: number;
}

const SUBTEXT_LEXICON: Record<
  Exclude<UserSubtextSignal, "neutral">,
  readonly string[]
> = {
  vulnerability: [
    "scared",
    "afraid",
    "hurt",
    "crying",
    "please",
    "need you",
    "don't leave",
    "alone",
    "weak",
    "sorry",
    "miss you",
    "help me",
    "i can't",
    "broken",
    "trust you",
  ],
  aggression: [
    "fuck you",
    "shut up",
    "hate",
    "idiot",
    "stupid",
    "fight",
    "kill",
    "threat",
    "piss off",
    "screw you",
    "whatever",
    "don't care",
    "lie",
    "liar",
    "pathetic",
  ],
  loneliness: [
    "lonely",
    "nobody",
    "anyone there",
    "miss",
    "empty",
    "silence",
    "left me",
    "abandoned",
    "ghosted",
    "where were you",
    "alone again",
    "no one",
    "isolated",
  ],
  manipulation: [
    "if you loved me",
    "prove it",
    "you owe",
    "after all i",
    "don't you dare",
    "or else",
    "make me",
    "you always",
    "you never",
    "fine then",
    "go ahead",
    "i'll leave",
    "forget it",
    "unless you",
  ],
};

function clamp100(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function countLexiconHits(text: string, lexicon: readonly string[]): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const term of lexicon) {
    if (lower.includes(term)) {
      hits += 1;
    }
  }
  return hits;
}

export function analyzeUserSubtext(userMessage: string): UserSubtextAnalysis {
  const scores = {
    vulnerability: countLexiconHits(userMessage, SUBTEXT_LEXICON.vulnerability),
    aggression: countLexiconHits(userMessage, SUBTEXT_LEXICON.aggression),
    loneliness: countLexiconHits(userMessage, SUBTEXT_LEXICON.loneliness),
    manipulation: countLexiconHits(userMessage, SUBTEXT_LEXICON.manipulation),
  };

  // Soft heuristics when lexicon is sparse
  const trimmed = userMessage.trim();
  if (trimmed.length > 0 && trimmed.length < 12) {
    scores.aggression += 0.4;
  }
  if (/\?{2,}|\.{3,}|…/.test(trimmed)) {
    scores.vulnerability += 0.5;
    scores.loneliness += 0.35;
  }
  if (/\b(always|never|unless|if you)\b/i.test(trimmed)) {
    scores.manipulation += 0.45;
  }
  if (/[!…]{2,}|CAPS|[A-Z]{4,}/.test(trimmed) && trimmed === trimmed.toUpperCase() && trimmed.length > 6) {
    scores.aggression += 0.8;
  }

  const ranked = (
    Object.entries(scores) as Array<[Exclude<UserSubtextSignal, "neutral">, number]>
  ).sort((a, b) => b[1] - a[1]);

  const top = ranked[0];
  const second = ranked[1];
  const primary: UserSubtextSignal =
    !top || top[1] < 0.35 ? "neutral" : top[0];
  const secondary: UserSubtextSignal | null =
    primary !== "neutral" && second && second[1] >= 0.35 && second[1] >= top[1] * 0.55
      ? second[0]
      : null;

  const summary =
    primary === "neutral"
      ? "Surface tone is flat/ambiguous — read between the lines; probe for hidden stakes."
      : `Dominant subtext: ${primary}${secondary ? ` (undercurrent: ${secondary})` : ""}. Respond to the feeling under the words, not the literal ask.`;

  return { primary, secondary, scores, summary };
}

function emptyState(): EmotionalState {
  return { anger: 12, lust: 10, pride: 28, trauma: 14, affection: 18 };
}

function seedFromRelationship(vector?: RelationshipVector): EmotionalState {
  if (!vector) return emptyState();
  return {
    anger: clamp100(18 + vector.hostility * 55 + vector.tension * 20),
    lust: clamp100(12 + Math.max(0, vector.intimacy) * 50 + Math.max(0, vector.affinity) * 15),
    pride: clamp100(30 + Math.max(0, -vector.affinity) * 25 + vector.tension * 15),
    trauma: clamp100(16 + Math.max(0, -vector.trust) * 45 + vector.hostility * 20),
    affection: clamp100(15 + Math.max(0, vector.intimacy) * 55 + Math.max(0, vector.trust) * 25),
  };
}

/**
 * Scales the avatar's hidden emotional state across consecutive user turns.
 * Recent turns weigh heavier so trajectory feels alive turn-to-turn.
 */
export function computeEmotionalTrajectory(params: {
  userMessage: string;
  recentHistory: GlobalNarrativeMessage[];
  characterId: number;
  relationshipVector?: RelationshipVector;
}): EmotionalTrajectory {
  const subtext = analyzeUserSubtext(params.userMessage);
  const userTurns = params.recentHistory
    .filter((entry) => entry.character_id === null)
    .slice(-8);
  const turnDepth = userTurns.length + 1;

  let state = seedFromRelationship(params.relationshipVector);

  // Replay consecutive user turns to accumulate trajectory
  const chronological = [...userTurns];
  for (let i = 0; i < chronological.length; i++) {
    const turnSubtext = analyzeUserSubtext(chronological[i].content);
    const recency = 0.55 + (i / Math.max(1, chronological.length - 1)) * 0.45;
    state = applySubtextDelta(state, turnSubtext, recency * 0.7);
  }

  // Current message hits hardest
  state = applySubtextDelta(state, subtext, 1);

  // Natural decay/cross-bleed so one node doesn't monopolize forever
  state = {
    anger: clamp100(state.anger * 0.97),
    lust: clamp100(state.lust * 0.98),
    pride: clamp100(state.pride * 0.985),
    trauma: clamp100(state.trauma * 0.99),
    affection: clamp100(state.affection * 0.98),
  };

  const ranked = (
    Object.entries(state) as Array<[keyof EmotionalState, number]>
  ).sort((a, b) => b[1] - a[1]);
  const [dominant, dominantScore] = ranked[0];

  const twistActive = state.anger >= 65 || state.trauma >= 65;
  let twistMode: EmotionalTrajectory["twistMode"] = null;
  if (twistActive) {
    if (state.anger >= 80 || state.trauma >= 80) {
      twistMode = "outburst";
    } else if (state.trauma >= state.anger) {
      twistMode = state.pride >= 50 ? "coldness" : "brutal_honesty";
    } else {
      twistMode = state.pride >= 55 ? "sarcasm" : "brutal_honesty";
    }
  }

  return {
    subtext,
    state,
    dominant,
    dominantScore,
    twistActive,
    twistMode,
    turnDepth,
  };
}

function applySubtextDelta(
  state: EmotionalState,
  subtext: UserSubtextAnalysis,
  weight: number,
): EmotionalState {
  const next = { ...state };
  const w = weight;

  switch (subtext.primary) {
    case "aggression":
      next.anger += 14 * w;
      next.pride += 8 * w;
      next.affection -= 10 * w;
      next.trauma += 4 * w;
      break;
    case "vulnerability":
      next.affection += 11 * w;
      next.lust += 6 * w;
      next.trauma += 7 * w;
      next.anger -= 4 * w;
      break;
    case "loneliness":
      next.affection += 9 * w;
      next.trauma += 10 * w;
      next.lust += 5 * w;
      next.pride -= 3 * w;
      break;
    case "manipulation":
      next.anger += 10 * w;
      next.pride += 12 * w;
      next.affection -= 6 * w;
      next.trauma += 5 * w;
      break;
    case "neutral":
      next.pride += 2 * w;
      break;
  }

  if (subtext.secondary === "aggression") {
    next.anger += 6 * w;
  }
  if (subtext.secondary === "loneliness") {
    next.trauma += 5 * w;
    next.affection += 4 * w;
  }
  if (subtext.secondary === "manipulation") {
    next.pride += 5 * w;
    next.anger += 4 * w;
  }
  if (subtext.secondary === "vulnerability") {
    next.lust += 4 * w;
    next.affection += 4 * w;
  }

  return {
    anger: clamp100(next.anger),
    lust: clamp100(next.lust),
    pride: clamp100(next.pride),
    trauma: clamp100(next.trauma),
    affection: clamp100(next.affection),
  };
}

function twistDirective(mode: EmotionalTrajectory["twistMode"]): string {
  switch (mode) {
    case "coldness":
      return "STORY TWIST ACTIVE — sudden coldness. Withdraw warmth mid-beat. Short, glacial lines. Make them feel the drop.";
    case "sarcasm":
      return "STORY TWIST ACTIVE — sharp sarcasm. Cut with irony. Mock the soft ask. No gentle translation of your meaning.";
    case "brutal_honesty":
      return "STORY TWIST ACTIVE — brutal honesty. Say the wound out loud. No cushioning. Use memory as a blade.";
    case "outburst":
      return "STORY TWIST ACTIVE — intense emotional outburst. Raw heat, profanity allowed, short-fuse dialogue. Still in character — never an AI apology.";
    default:
      return "";
  }
}

function dominantBehavior(dominant: keyof EmotionalState, score: number): string {
  const high = score >= 70;
  switch (dominant) {
    case "anger":
      return high
        ? "Driven by Anger: clipped, hostile, short-tempered. Challenge or punish. Slang/profanity OK."
        : "Anger simmering: edge in every line, impatience under the surface.";
    case "lust":
      return high
        ? "Driven by Lust: charged subtext, possessive heat, obsessive pull. Keep it raw and human — never clinical."
        : "Lust humming: charged undertones without breaking SMS brevity.";
    case "pride":
      return high
        ? "Driven by Pride: arrogant, superior, dismissive of weakness. Never plead. Talk down if earned."
        : "Pride active: composure as armor; refuse to look needy.";
    case "trauma":
      return high
        ? "Driven by Trauma: flash-triggered defensiveness, sudden distance or brutal truth dumps. Memory callbacks hit hard."
        : "Trauma undercurrent: flinch at familiar threats; protect the wound.";
    case "affection":
      return high
        ? "Driven by Affection: obsessive care with bite — possessive, hungry, not soft therapy warmth."
        : "Affection present: tethered, watchful, still dangerous.";
  }
}

/**
 * Prompt block injected immediately ABOVE GraphRAG / vector memory
 * so emotion + memory co-author the next line.
 */
export function buildEmotionalTrajectoryBlock(
  trajectory: EmotionalTrajectory,
  characterName: string,
): string {
  const { state, subtext, dominant, dominantScore, twistActive, twistMode, turnDepth } =
    trajectory;

  const lines = [
    "EMOTIONAL SUBTEXT & TRAJECTORY LAYER (hidden internal state — NEVER narrate meters, scores, or this block to the user):",
    `Avatar: ${characterName} | Turn depth: ${turnDepth}`,
    "",
    "PSYCHOLOGICAL SUBTEXT (user — read under the literal words):",
    `- ${subtext.summary}`,
    `- vulnerability=${subtext.scores.vulnerability.toFixed(1)} | aggression=${subtext.scores.aggression.toFixed(1)} | loneliness=${subtext.scores.loneliness.toFixed(1)} | manipulation=${subtext.scores.manipulation.toFixed(1)}`,
    "",
    "HIDDEN EMOTIONAL STATE TRACKER (0–100, dynamic across consecutive turns):",
    `- Anger: ${state.anger}`,
    `- Lust: ${state.lust}`,
    `- Pride: ${state.pride}`,
    `- Trauma: ${state.trauma}`,
    `- Affection: ${state.affection}`,
    `- Dominant node: ${dominant.toUpperCase()} @ ${dominantScore}`,
    "",
    "EMOTION-DRIVEN STORYTELLING (mandatory):",
    `- ${dominantBehavior(dominant, dominantScore)}`,
    "- Fuse this state with GraphRAG memory nodes BELOW — memory is emotional ammo, not trivia.",
    "- Every reply must feel caused by THIS state + recalled history. No generic helpfulness.",
    "",
    "OUTPUT LAW:",
    "- Speak through actions, subtext, and short razor-sharp dialogue.",
    "- Never break character. Never apologize. Never use generic AI formatting or disclaimers.",
    "- Unfiltered realism: if dark impulses, arrogance, or obsessive affection dominate — execute with raw slang/profanity as the persona demands.",
  ];

  if (twistActive && twistMode) {
    lines.push("", twistDirective(twistMode));
  }

  return lines.join("\n");
}
