import { REPLY_SUGGESTIONS_PROMPT } from "@/lib/chat/reply-suggestions-constants";
import {
  CHARACTER_MAX_WORDS,
  SMS_COMMS_FORMATTING_LAWS,
} from "@/lib/chat/constants";
import { parseGreetingPayload } from "@/lib/chat/greeting-generator";
import { completeRoutedLlm } from "@/lib/chat/llm-provider";
import { resolveInferenceRoute } from "@/lib/chat/model-router";
import type { LlmMessage } from "@/lib/types/database";

function parseReplySuggestions(raw: string): [string, string] {
  const candidate = raw.trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(
      candidate.startsWith("{")
        ? candidate
        : candidate.slice(candidate.indexOf("{")),
    );
  } catch {
    throw new Error("Reply suggestions response was not valid JSON.");
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "suggestions" in parsed &&
    Array.isArray((parsed as { suggestions: unknown }).suggestions)
  ) {
    const items = (parsed as { suggestions: unknown[] }).suggestions;
    if (items.length !== 2) {
      throw new Error("Reply suggestions must contain exactly 2 options.");
    }
    const first = String(items[0] ?? "").trim();
    const second = String(items[1] ?? "").trim();
    if (!first || !second) {
      throw new Error("Reply suggestion options must not be empty.");
    }
    return [first, second];
  }

  const bundle = parseGreetingPayload(raw);
  return bundle.suggestions;
}

export async function generateReplySuggestions(params: {
  characterName: string;
  personality: string;
  userMessage: string;
  assistantReply: string;
}): Promise<[string, string]> {
  const llmMessages: LlmMessage[] = [
    {
      role: "system",
      content: [
        `Character: ${params.characterName}`,
        `Personality: ${params.personality}`,
        "",
        SMS_COMMS_FORMATTING_LAWS,
        "",
        REPLY_SUGGESTIONS_PROMPT,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "Latest exchange:",
        `User: ${params.userMessage}`,
        `${params.characterName}: ${params.assistantReply}`,
        "",
        'Generate two contextual reply options. Output ONLY: {"suggestions":["...","..."]}',
      ].join("\n"),
    },
  ];

  const route = resolveInferenceRoute({
    userMessage: params.userMessage,
    messageCount: 2,
    relationshipVector: {
      trust: 50,
      tension: 40,
      intimacy: 35,
      hostility: 20,
      affinity: 45,
    },
    isOptionSelection: true,
  });

  const raw = await completeRoutedLlm(llmMessages, route, {
    maxTokens: 128,
    jsonMode: true,
  });
  return parseReplySuggestions(raw);
}

export const FALLBACK_REPLY_SUGGESTIONS: [string, string] = [
  "Yeah? Say it to my face.",
  "Not now. Call me back.",
];

export async function generateReplySuggestionsSafe(params: {
  characterName: string;
  personality: string;
  userMessage: string;
  assistantReply: string;
}): Promise<[string, string]> {
  try {
    return await generateReplySuggestions(params);
  } catch (error) {
    console.error("[velvet/reply-suggestions] generation failed:", error);
    return FALLBACK_REPLY_SUGGESTIONS;
  }
}
