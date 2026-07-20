import {
  GROQ_API_URL,
  TOGETHER_API_URL,
} from "@/lib/chat/constants";
import type { InferenceRoute } from "@/lib/chat/model-router";
import type { LlmMessage, LlmStreamChunk } from "@/lib/types/database";

interface OpenAiStreamDelta {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
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

function requireTogetherApiKey(): string {
  const apiKey = process.env.TOGETHER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Together AI routing requested but TOGETHER_API_KEY is not configured.",
    );
  }
  return apiKey;
}

function parseSseDataLine(line: string): OpenAiStreamDelta | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return null;
  }

  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") {
    return { choices: [{ finish_reason: "stop" }] };
  }

  try {
    return JSON.parse(payload) as OpenAiStreamDelta;
  } catch {
    return null;
  }
}

async function* streamFromOpenAiCompatible(params: {
  url: string;
  apiKey: string;
  model: string;
  messages: LlmMessage[];
  maxTokens: number;
  temperature: number;
  jsonMode?: boolean;
}): AsyncGenerator<LlmStreamChunk> {
  const response = await fetch(params.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      stream: true,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      top_p: 0.9,
      ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `LLM API error (${response.status}): ${errorBody.slice(0, 500)}`,
    );
  }

  if (!response.body) {
    throw new Error("LLM API returned an empty response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const parsed = parseSseDataLine(line);
        if (!parsed) {
          continue;
        }

        const finishReason = parsed.choices?.[0]?.finish_reason;
        if (finishReason === "stop") {
          yield { content: "", done: true };
          return;
        }

        const token = parsed.choices?.[0]?.delta?.content;
        if (token) {
          yield { content: token, done: false };
        }
      }
    }

    yield { content: "", done: true };
  } finally {
    reader.releaseLock();
  }
}

export async function* streamRoutedLlmCompletion(
  messages: LlmMessage[],
  route: InferenceRoute,
): AsyncGenerator<LlmStreamChunk> {
  const maxTokens = route.tier === "slm" ? 72 : 80;
  const temperature = route.tier === "slm" ? 0.72 : 0.78;

  if (route.provider === "together") {
    yield* streamFromOpenAiCompatible({
      url: TOGETHER_API_URL,
      apiKey: requireTogetherApiKey(),
      model: route.model,
      messages,
      maxTokens,
      temperature,
    });
    return;
  }

  yield* streamFromOpenAiCompatible({
    url: GROQ_API_URL,
    apiKey: requireGroqApiKey(),
    model: route.model,
    messages,
    maxTokens,
    temperature,
  });
}

export async function completeRoutedLlm(
  messages: LlmMessage[],
  route: InferenceRoute,
  options?: { maxTokens?: number; jsonMode?: boolean },
): Promise<string> {
  const maxTokens = options?.maxTokens ?? (route.tier === "slm" ? 96 : 160);
  const url = route.provider === "together" ? TOGETHER_API_URL : GROQ_API_URL;
  const apiKey =
    route.provider === "together" ? requireTogetherApiKey() : requireGroqApiKey();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: route.model,
      messages,
      stream: false,
      max_tokens: maxTokens,
      temperature: route.tier === "slm" ? 0.72 : 0.78,
      top_p: 0.9,
      ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `LLM API error (${response.status}): ${errorBody.slice(0, 500)}`,
    );
  }

  const payload = (await response.json()) as GroqCompletionResponse;
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("LLM returned an empty completion.");
  }
  return content;
}
