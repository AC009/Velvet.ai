export interface UnlockIntentResponse {
  conversationId: number;
  paymentIntentClicks: number;
  unlocked: boolean;
  message: string;
}

export async function recordUnlockIntent(params: {
  userId: string;
  worldId: number;
}): Promise<UnlockIntentResponse> {
  const response = await fetch("/api/chat/unlock-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: params.userId,
      worldId: params.worldId,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error ?? `Unlock intent failed (${response.status}).`,
    );
  }

  return (await response.json()) as UnlockIntentResponse;
}
