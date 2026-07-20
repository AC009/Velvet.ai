import {
  CHARACTER_MAX_WORDS,
  GROQ_API_URL,
  LLM_MODEL,
  SMS_COMMS_FORMATTING_LAWS,
} from "@/lib/chat/constants";
import {
  GREETING_INIT_PROMPT,
  FREE_ROLEPLAY_LAUNCHPAD_PROMPT,
  PLOT_CARDS_PROMPT,
  RETURN_PULSE_PROMPT,
  buildMatrixPlotCardsPrompt,
  buildMatrixScopedSystemPrompt,
  getMatrixPlotCards,
  resolveMatrixArchetype,
  type StateArchetype,
} from "@/lib/chat/greeting-constants";
import type {
  DialogueBehaviorSnapshot,
  RelationshipInitContext,
} from "@/lib/chat/persistent-relationship-engine";
import {
  formatDialogueBehaviorBlock,
  formatMemoryBlockForPrompt,
} from "@/lib/chat/persistent-relationship-engine";
import { buildUnfilteredPersonaBlock } from "@/lib/chat/unfiltered-persona";
import {
  buildEmotionalTrajectoryBlock,
  computeEmotionalTrajectory,
} from "@/lib/chat/emotional-engine";
import type { LlmMessage } from "@/lib/types/database";
import type { PlotCard } from "@/lib/frontend/types";

export interface GreetingBundle {
  messages: [string, string];
  suggestions: [string, string];
}

interface GroqCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

function requireGroqApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "No LLM provider configured. Set GROQ_API_KEY in your environment.",
    );
  }
  return apiKey;
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const objectStart = trimmed.indexOf("{");
  if (objectStart === -1) {
    return trimmed;
  }
  return trimmed.slice(objectStart);
}

function normalizeGreetingText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseStringPair(
  values: unknown[],
  fieldName: string,
  maxLength: number,
): [string, string] {
  if (values.length !== 2) {
    throw new Error(
      `Groq greeting "${fieldName}" must contain exactly 2 items, received ${values.length}.`,
    );
  }

  const first = normalizeGreetingText(String(values[0] ?? ""));
  const second = normalizeGreetingText(String(values[1] ?? ""));

  if (first.length === 0 || second.length === 0) {
    throw new Error(`Groq greeting "${fieldName}" items must not be empty.`);
  }

  if (first.length > maxLength || second.length > maxLength) {
    throw new Error(`Groq greeting "${fieldName}" items exceed maximum length.`);
  }

  return [first, second];
}

export function parseGreetingPayload(raw: string): GreetingBundle {
  const candidate = extractJsonCandidate(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error("Groq greeting response was not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error('Groq greeting JSON must be an object with "messages" and "suggestions".');
  }

  const record = parsed as Record<string, unknown>;

  if (!Array.isArray(record.messages)) {
    throw new Error('Groq greeting JSON must include a "messages" array.');
  }

  if (!Array.isArray(record.suggestions)) {
    throw new Error('Groq greeting JSON must include a "suggestions" array.');
  }

  const messages = parseStringPair(record.messages, "messages", 125);
  const suggestions = parseStringPair(record.suggestions, "suggestions", 125);

  return { messages, suggestions };
}

export async function completeGroq(messages: LlmMessage[]): Promise<string> {
  const apiKey = requireGroqApiKey();

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      stream: false,
      max_tokens: 256,
      temperature: 0.78,
      top_p: 0.9,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Groq API error (${response.status}): ${errorBody.slice(0, 500)}`,
    );
  }

  const payload = (await response.json()) as GroqCompletionResponse;
  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Groq returned an empty greeting completion.");
  }

  return content;
}

export async function generateGreetingBundle(params: {
  characterName: string;
  systemPrompt: string;
  personality: string;
  worldName: string;
  characterHook: string;
  relationshipContext?: RelationshipInitContext;
  matrixArchetype?: StateArchetype;
}): Promise<GreetingBundle> {
  const contextBlocks: string[] = [];
  const scopedSystemPrompt = params.matrixArchetype
    ? buildMatrixScopedSystemPrompt(params.systemPrompt, params.matrixArchetype)
    : params.systemPrompt;

  if (params.relationshipContext) {
    contextBlocks.push(
      formatMemoryBlockForPrompt(
        params.relationshipContext.memory,
        params.relationshipContext.vector,
      ),
    );
    if (
      params.relationshipContext.absenceMs > 0 &&
      !params.relationshipContext.isResumeSession
    ) {
      contextBlocks.push(
        `ABSENCE DURATION: ${params.relationshipContext.absenceLabel} since last activity. Apply temporal return energy in message 1.`,
      );
    }
  }

  const characterName =
    params.matrixArchetype?.characterDisplayName ?? params.characterName;
  const unfilteredBlock = buildUnfilteredPersonaBlock({
    characterName,
    personaSignals: `${scopedSystemPrompt}\n${params.personality}`,
  });
  const emotionalBlock = buildEmotionalTrajectoryBlock(
    computeEmotionalTrajectory({
      userMessage: params.characterHook,
      recentHistory: [],
      characterId: 0,
      relationshipVector: params.relationshipContext?.vector,
    }),
    characterName,
  );

  const llmMessages: LlmMessage[] = [
    {
      role: "system",
      content: [
        scopedSystemPrompt,
        "",
        `Personality baseline: ${params.personality}`,
        "",
        SMS_COMMS_FORMATTING_LAWS,
        "",
        unfilteredBlock,
        "",
        emotionalBlock,
        "",
        ...contextBlocks,
        "",
        GREETING_INIT_PROMPT,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      role: "user",
      content: [
        `Generate the opening double-message greeting and two A/B smart reply suggestions for ${characterName} in the "${params.worldName}" world.`,
        params.matrixArchetype
          ? `Multiverse node: ${params.matrixArchetype.nodeKey} — ${params.matrixArchetype.personaTitle}.`
          : null,
        `Character hook for tone reference: "${params.characterHook}"`,
        params.relationshipContext?.memory.hasPriorHistory
          ? "CRITICAL: Reference a specific prior user statement from memory in message 1. No generic hello."
          : "Open with charged in-world personality — no generic hello.",
        `Each message ≤${CHARACTER_MAX_WORDS} words. SMS/comms tone only.`,
        'Output ONLY the JSON object: {"messages":[...],"suggestions":[...]}',
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  const raw = await completeGroq(llmMessages);
  return parseGreetingPayload(raw);
}

export async function generateReturnPulseMessage(params: {
  characterName: string;
  systemPrompt: string;
  personality: string;
  worldName: string;
  relationshipContext: RelationshipInitContext;
  matrixArchetype?: StateArchetype;
}): Promise<string> {
  const scopedSystemPrompt = params.matrixArchetype
    ? buildMatrixScopedSystemPrompt(params.systemPrompt, params.matrixArchetype)
    : params.systemPrompt;

  const characterName =
    params.matrixArchetype?.characterDisplayName ?? params.characterName;
  const unfilteredBlock = buildUnfilteredPersonaBlock({
    characterName,
    personaSignals: `${scopedSystemPrompt}\n${params.personality}`,
  });
  const emotionalBlock = buildEmotionalTrajectoryBlock(
    computeEmotionalTrajectory({
      userMessage:
        params.relationshipContext.memory.headlineCallback ??
        "I'm back.",
      recentHistory: [],
      characterId: 0,
      relationshipVector: params.relationshipContext.vector,
    }),
    characterName,
  );

  const llmMessages: LlmMessage[] = [
    {
      role: "system",
      content: [
        scopedSystemPrompt,
        "",
        `Personality baseline: ${params.personality}`,
        "",
        unfilteredBlock,
        "",
        emotionalBlock,
        "",
        formatMemoryBlockForPrompt(
          params.relationshipContext.memory,
          params.relationshipContext.vector,
        ),
        "",
        RETURN_PULSE_PROMPT,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `${params.characterName} in "${params.worldName}" — player was away for ${params.relationshipContext.absenceLabel}.`,
        params.relationshipContext.memory.headlineCallback
          ? `Memory callback to weave in: "${params.relationshipContext.memory.headlineCallback}"`
          : "No specific callback — still acknowledge absence with possessive urgency.",
        'Output ONLY: {"message":"..."}',
      ]
        .filter(Boolean)
        .join(" "),
    },
  ];

  const raw = await completeGroq(llmMessages);
  const candidate = extractJsonCandidate(raw);
  const parsed = JSON.parse(candidate) as Record<string, unknown>;
  const message = normalizeGreetingText(String(parsed.message ?? ""));

  if (!message) {
    throw new Error("Groq return pulse message was empty.");
  }
  if (message.length > 125) {
    return message.slice(0, 122) + "…";
  }
  return message;
}

export async function generateFreePlayLaunchpad(params: {
  characterName: string;
  systemPrompt: string;
  personality: string;
  worldName: string;
  matrixArchetype?: StateArchetype;
}): Promise<GreetingBundle> {
  const scopedSystemPrompt = params.matrixArchetype
    ? buildMatrixScopedSystemPrompt(params.systemPrompt, params.matrixArchetype)
    : params.systemPrompt;

  const unfilteredBlock = buildUnfilteredPersonaBlock({
    characterName: params.characterName,
    personaSignals: `${scopedSystemPrompt}\n${params.personality}`,
  });

  const llmMessages: LlmMessage[] = [
    {
      role: "system",
      content: [
        scopedSystemPrompt,
        "",
        `Personality baseline: ${params.personality}`,
        "",
        SMS_COMMS_FORMATTING_LAWS,
        "",
        unfilteredBlock,
        "",
        FREE_ROLEPLAY_LAUNCHPAD_PROMPT,
      ].join("\n"),
    },
    {
      role: "user",
      content: `Generate the free roleplay launchpad opening for ${params.characterName} in the "${params.worldName}" world. Project the world's dominant emotional atmosphere immediately. Output ONLY the JSON object: {"messages":[...],"suggestions":[...]}`,
    },
  ];

  const raw = await completeGroq(llmMessages);
  return parseGreetingPayload(raw);
}

/** @deprecated Use parseGreetingPayload */
export function parseGreetingMessages(raw: string): [string, string] {
  return parseGreetingPayload(raw).messages;
}

/** @deprecated Use generateGreetingBundle */
export async function generateGreetingPair(params: {
  characterName: string;
  systemPrompt: string;
  personality: string;
  worldName: string;
  characterHook: string;
}): Promise<[string, string]> {
  const bundle = await generateGreetingBundle(params);
  return bundle.messages;
}

function parsePlotCardArray(raw: unknown[]): PlotCard[] {
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object",
    )
    .map((item, index) => ({
      card_id:
        typeof item.card_id === "string" && item.card_id.trim()
          ? item.card_id.trim()
          : `plot-${index + 1}`,
      title:
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim()
          : "Unknown Path",
      teaser:
        typeof item.teaser === "string" && item.teaser.trim()
          ? item.teaser.trim().slice(0, 120)
          : "A new direction awaits.",
      theme:
        typeof item.theme === "string" && item.theme.trim()
          ? item.theme.trim()
          : "mystery",
    }))
    .slice(0, 3);
}

export async function generatePlotCards(params: {
  characterName: string;
  systemPrompt: string;
  personality: string;
  worldName: string;
  excludeCardIds?: string[];
  dialogueBehavior?: DialogueBehaviorSnapshot;
  matrixArchetype?: StateArchetype;
}): Promise<PlotCard[]> {
  if (params.matrixArchetype && (!params.excludeCardIds || params.excludeCardIds.length === 0)) {
    return getMatrixPlotCards(params.matrixArchetype);
  }

  const archetypeBlock = params.matrixArchetype
    ? buildMatrixPlotCardsPrompt(params.matrixArchetype)
    : "";

  const excludeNote =
    params.excludeCardIds && params.excludeCardIds.length > 0
      ? `Previously shown card_ids to avoid completely: ${params.excludeCardIds.join(", ")}. Generate fresh slugs and angles within the same multiverse node lane.`
      : "";

  const behaviorBlock = params.dialogueBehavior
    ? formatDialogueBehaviorBlock(params.dialogueBehavior)
    : "";

  const scopedSystemPrompt = params.matrixArchetype
    ? buildMatrixScopedSystemPrompt(params.systemPrompt, params.matrixArchetype)
    : params.systemPrompt;

  const llmMessages: LlmMessage[] = [
    {
      role: "system",
      content: [
        scopedSystemPrompt,
        "",
        `Personality baseline: ${params.personality}`,
        "",
        `Active world theme: ${params.worldName}`,
        "",
        archetypeBlock,
        "",
        behaviorBlock,
        "",
        PLOT_CARDS_PROMPT,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      role: "user",
      content: [
        `Generate exactly 3 consequence-aware cinematic plot cards for ${params.matrixArchetype?.characterDisplayName ?? params.characterName} in the "${params.worldName}" world theme.`,
        params.matrixArchetype
          ? `Locked multiverse node: ${params.matrixArchetype.nodeKey}.`
          : null,
        params.dialogueBehavior &&
        (params.dialogueBehavior.stance === "cold" ||
          params.dialogueBehavior.stance === "defiant")
          ? "Player was cold/distant — Card 1 MUST confront this directly."
          : "Tie cards to relationship tension and character initiative.",
        "Each card must represent a distinctly different narrative branch with cinematic stakes.",
        excludeNote,
        'Output ONLY the JSON object: {"plot_cards":[...]}',
      ]
        .filter(Boolean)
        .join(" "),
    },
  ];

  try {
    const raw = await completeGroq(llmMessages);
    const candidate = extractJsonCandidate(raw);
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (Array.isArray(parsed.plot_cards) && parsed.plot_cards.length >= 1) {
      return parsePlotCardArray(parsed.plot_cards);
    }
    throw new Error("plot_cards array missing or empty");
  } catch {
    if (params.matrixArchetype) {
      return getMatrixPlotCards(params.matrixArchetype);
    }

    const coldFallback =
      params.dialogueBehavior?.stance === "cold" ||
      params.dialogueBehavior?.stance === "defiant";

    if (coldFallback) {
      return [
        {
          card_id: "consequence-of-coldness",
          title: "The Consequence of Your Coldness",
          teaser: "You went distant — now explain yourself before I decide for you.",
          theme: "betrayal",
        },
        {
          card_id: "unanswered-silence",
          title: "Your Silence Has a Price",
          teaser: "Every hour you ignored me, I wrote down what I want back.",
          theme: "power",
        },
        {
          card_id: "forced-reckoning",
          title: "We Are Not Done",
          teaser: "You don't get to vanish and pretend nothing happened.",
          theme: "obsession",
        },
      ];
    }

    return [
      {
        card_id: "dark-obsession",
        title: "Dark Obsession",
        teaser: "You're in too deep and neither of you wants to stop.",
        theme: "obsession",
      },
      {
        card_id: "power-play",
        title: "The Power Play",
        teaser: "Someone holds all the cards. It might not be them.",
        theme: "power",
      },
      {
        card_id: "silent-betrayal",
        title: "Silent Betrayal",
        teaser: "The truth was there the whole time. Hidden in plain sight.",
        theme: "betrayal",
      },
    ];
  }
}
