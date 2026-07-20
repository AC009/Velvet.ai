import type { ChatRequestBody, SseEvent } from "@/lib/types/database";

export class ChatLockedError extends Error {
  readonly lockedUntil: string;

  constructor(lockedUntil: string, message: string) {
    super(message);
    this.name = "ChatLockedError";
    this.lockedUntil = lockedUntil;
  }
}

export interface StreamChatCallbacks {
  onMeta: (event: Extract<SseEvent, { type: "meta" }>) => void;
  onToken: (token: string) => void;
  onDone: (fullContent: string) => void;
  onOptions: (suggestions: [string, string]) => void;
  onError: (message: string) => void;
}

const LOCKED_UNTIL_PATTERN =
  /Conversation locked until (\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)/i;

export function parseLockedUntilFromError(errorMessage: string): string | null {
  const match = errorMessage.match(LOCKED_UNTIL_PATTERN);
  return match?.[1] ?? null;
}

function parseSseBlock(block: string): SseEvent | null {
  const trimmed = block.trim();
  if (!trimmed.startsWith("data:")) {
    return null;
  }

  const payload = trimmed.slice(5).trim();
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload) as SseEvent;
  } catch {
    return null;
  }
}

export async function streamChatCompletion(
  body: ChatRequestBody,
  callbacks: StreamChatCallbacks,
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: body.userId,
      worldId: body.worldId,
      characterId: body.characterId,
      message: body.message,
      ...(body.storyId ? { storyId: body.storyId } : {}),
      ...(body.behaviorSystemPrompt
        ? { behaviorSystemPrompt: body.behaviorSystemPrompt }
        : {}),
      ...(body.isOptionSelection ? { isOptionSelection: true } : {}),
    }),
  });

  if (response.status === 423) {
    const payload = (await response.json()) as { error?: string };
    const errorMessage = payload.error ?? "Conversation is locked.";
    const lockedUntil = parseLockedUntilFromError(errorMessage);
    if (lockedUntil) {
      throw new ChatLockedError(lockedUntil, errorMessage);
    }
    throw new Error(errorMessage);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? `Chat request failed (${response.status}).`);
  }

  if (!response.body) {
    throw new Error("Chat response body is empty.");
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
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const event = parseSseBlock(block);
        if (!event) {
          continue;
        }

        switch (event.type) {
          case "meta":
            callbacks.onMeta(event);
            break;
          case "token":
            if (event.content.length > 0) {
              callbacks.onToken(event.content);
            }
            break;
          case "done":
            callbacks.onDone(event.fullContent);
            break;
          case "options":
            callbacks.onOptions(event.suggestions);
            break;
          case "error":
            callbacks.onError(event.message);
            break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function formatCountdownParts(
  lockedUntil: string,
  nowMs: number = Date.now(),
): { hours: string; minutes: string; seconds: string; expired: boolean } {
  const remainingMs = Math.max(0, new Date(lockedUntil).getTime() - nowMs);
  const expired = remainingMs <= 0;
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
    expired,
  };
}
