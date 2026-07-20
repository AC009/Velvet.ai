import { ChatLockedError, parseLockedUntilFromError } from "@/lib/frontend/chat-stream";
import type { ChatInitRequestBody, ChatInitResponse } from "@/lib/types/database";

export async function initializeChatSession(
  params: {
    userId: string;
    worldId: number;
    characterId: number;
    storyId?: string;
    questLineId?: string;
    lastSeenAt?: string;
    dialogueBehavior?: ChatInitRequestBody["dialogueBehavior"];
    behaviorSystemPrompt?: string;
  },
): Promise<ChatInitResponse> {
  const response = await fetch("/api/chat/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      ...(params.storyId ? { storyId: params.storyId } : {}),
      ...(params.questLineId ? { questLineId: params.questLineId } : {}),
      ...(params.lastSeenAt ? { lastSeenAt: params.lastSeenAt } : {}),
      ...(params.dialogueBehavior ? { dialogueBehavior: params.dialogueBehavior } : {}),
      ...(params.behaviorSystemPrompt
        ? { behaviorSystemPrompt: params.behaviorSystemPrompt }
        : {}),
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
    throw new Error(payload?.error ?? `Chat init failed (${response.status}).`);
  }

  return (await response.json()) as ChatInitResponse;
}
