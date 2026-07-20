import { isValidUuid, jsonError } from "@/lib/chat/sse";
import { isSupabaseConfigured } from "@/lib/env";
import type { PushSubscriptionPayload } from "@/lib/push/types";
import { upsertPushSubscription } from "@/lib/push/subscription-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SubscribeRequestBody {
  userId: string;
  subscription: PushSubscriptionPayload;
  worldId?: number;
  characterId?: number;
}

function parseBody(raw: unknown): SubscribeRequestBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.userId !== "string" || !isValidUuid(body.userId)) {
    throw new Error("userId must be a valid UUID string.");
  }

  if (!body.subscription || typeof body.subscription !== "object") {
    throw new Error("subscription object is required.");
  }

  const subscription = body.subscription as Record<string, unknown>;
  if (typeof subscription.endpoint !== "string" || !subscription.endpoint.trim()) {
    throw new Error("subscription.endpoint is required.");
  }

  if (!subscription.keys || typeof subscription.keys !== "object") {
    throw new Error("subscription.keys is required.");
  }

  const keys = subscription.keys as Record<string, unknown>;
  if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
    throw new Error("subscription.keys.p256dh and auth are required.");
  }

  const worldId =
    typeof body.worldId === "number" && Number.isInteger(body.worldId)
      ? body.worldId
      : undefined;

  const characterId =
    typeof body.characterId === "number" && Number.isInteger(body.characterId)
      ? body.characterId
      : undefined;

  return {
    userId: body.userId,
    subscription: {
      endpoint: subscription.endpoint.trim(),
      keys: {
        p256dh: keys.p256dh.trim(),
        auth: keys.auth.trim(),
      },
    },
    worldId,
    characterId,
  };
}

export async function POST(request: Request): Promise<Response> {
  if (!isSupabaseConfigured()) {
    return jsonError("Push subscriptions require Supabase configuration.", 503);
  }

  let body: SubscribeRequestBody;
  try {
    body = parseBody(await request.json());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid request payload.";
    return jsonError(message, 400);
  }

  try {
    await upsertPushSubscription(body);
    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Subscription failed.";
    console.error("[velvet/push/subscribe] failed:", error);
    return jsonError(message, 500);
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
