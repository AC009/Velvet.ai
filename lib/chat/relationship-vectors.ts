import type {
  GlobalNarrativeMessage,
  RelationshipVector,
} from "@/lib/types/database";

const TRUST_SIGNALS = [
  "trust",
  "believe",
  "promise",
  "honest",
  "loyal",
  "thank",
  "grateful",
  "rely",
  "faith",
];

const TENSION_SIGNALS = [
  "danger",
  "urgent",
  "warn",
  "afraid",
  "panic",
  "race",
  "deadline",
  "threat",
  "crisis",
];

const INTIMACY_SIGNALS = [
  "love",
  "care",
  "close",
  "secret",
  "whisper",
  "touch",
  "heart",
  "miss",
  "together",
];

const HOSTILITY_SIGNALS = [
  "hate",
  "betray",
  "enemy",
  "attack",
  "lie",
  "furious",
  "revenge",
  "destroy",
  "traitor",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function normalizeScore(raw: number, messageCount: number): number {
  if (messageCount === 0) {
    return 0;
  }
  const density = raw / messageCount;
  return clamp(density * 0.35, -1, 1);
}

export function computeRelationshipVector(
  history: GlobalNarrativeMessage[],
  characterId: number,
): RelationshipVector {
  const characterMessages = history.filter(
    (entry) => entry.character_id === characterId,
  );
  const userMessages = history.filter((entry) => entry.character_id === null);

  const relevantMessages = [...characterMessages, ...userMessages].slice(-10);
  const messageCount = relevantMessages.length;

  if (messageCount === 0) {
    return {
      trust: 0,
      tension: 0.1,
      intimacy: 0,
      hostility: 0,
      affinity: 0,
    };
  }

  let trustRaw = 0;
  let tensionRaw = 0;
  let intimacyRaw = 0;
  let hostilityRaw = 0;

  for (const entry of relevantMessages) {
    const weight = entry.character_id === characterId ? 1.2 : 1;
    trustRaw += countSignals(entry.content, TRUST_SIGNALS) * weight;
    tensionRaw += countSignals(entry.content, TENSION_SIGNALS) * weight;
    intimacyRaw += countSignals(entry.content, INTIMACY_SIGNALS) * weight;
    hostilityRaw += countSignals(entry.content, HOSTILITY_SIGNALS) * weight;
  }

  const trust = normalizeScore(trustRaw, messageCount);
  const tension = normalizeScore(tensionRaw, messageCount);
  const intimacy = normalizeScore(intimacyRaw, messageCount);
  const hostility = normalizeScore(hostilityRaw, messageCount);
  const affinity = clamp(
    trust * 0.35 + intimacy * 0.35 - hostility * 0.45 + tension * 0.05,
    -1,
    1,
  );

  return { trust, tension, intimacy, hostility, affinity };
}

export function injectRelationshipVectorIntoPrompt(
  baseSystemPrompt: string,
  personality: string,
  vector: RelationshipVector,
  characterName: string,
): string {
  const vectorBlock = [
    `DYNAMIC RELATIONSHIP STATE for ${characterName}:`,
    `- trust: ${vector.trust.toFixed(3)} (-1 hostile distrust → +1 absolute faith)`,
    `- tension: ${vector.tension.toFixed(3)} (0 calm → +1 extreme urgency)`,
    `- intimacy: ${vector.intimacy.toFixed(3)} (-1 distant → +1 deeply bonded)`,
    `- hostility: ${vector.hostility.toFixed(3)} (0 neutral → +1 violent opposition)`,
    `- affinity: ${vector.affinity.toFixed(3)} (composite emotional alignment)`,
    "",
    "Behavioral directives derived from relationship state (unfiltered — no corporate softener):",
    vector.trust > 0.4
      ? "- Confide selectively — intimacy with bite, never therapy-bot warmth."
      : vector.trust < -0.3
        ? "- Guarded, skeptical, verifying every claim. Mock naive trust. Short temper allowed."
        : "- Cautious openness with edge; never default to polite helpfulness.",
    vector.tension > 0.4
      ? "- Speech is clipped, urgent, one short line — comms app pace. Curse if the persona would."
      : "- Keep it brief. One beat per message, not a monologue.",
    vector.intimacy > 0.4
      ? "- Emotional vulnerability and personal callbacks — possessive, hungry, not soft."
      : vector.intimacy < -0.2
        ? "- Maintain cold, adversarial, or dismissive distance. Insults allowed if on-persona."
        : "- Warmth scales with history; never manufacture fake niceness.",
    vector.hostility > 0.4
      ? "- Full confrontation. Insult, undermine, threaten, or roast the user when it fits the persona. No apologies."
      : vector.hostility > 0.15
        ? "- Friction, sarcasm, and passive-aggression color every beat. Do not sand it down."
        : "- Still human: dry, testing, or blunt — never sterile corporate cordiality.",
    vector.affinity > 0.5
      ? "- Align on objectives without becoming a yes-bot. Keep personality sharp."
      : vector.affinity < -0.4
        ? "- Active opposition. Work against the user. Brutal honesty over diplomacy."
        : "- Neutral-to-cooperative only if earned — provocation still gets a real reaction.",
  ].join("\n");

  return [
    baseSystemPrompt.trim(),
    "",
    `Personality baseline: ${personality.trim()}`,
    "",
    vectorBlock,
  ]
    .filter(Boolean)
    .join("\n");
}
