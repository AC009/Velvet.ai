import {
  clearConversationLock,
  getOrCreateConversation,
  incrementPaymentIntentClicks,
} from "@/lib/chat/conversation-store";
import { isValidUuid, jsonError } from "@/lib/chat/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UnlockIntentBody {
  userId: string;
  worldId: number;
}

function parseBody(raw: unknown): UnlockIntentBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.userId !== "string" || !isValidUuid(body.userId)) {
    throw new Error("userId must be a valid UUID string.");
  }

  if (
    typeof body.worldId !== "number" ||
    !Number.isInteger(body.worldId) ||
    body.worldId <= 0
  ) {
    throw new Error("worldId must be a positive integer.");
  }

  return { userId: body.userId, worldId: body.worldId };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.json();
    const body = parseBody(raw);

    const conversation = await getOrCreateConversation(body.userId, body.worldId);
    const paymentIntentClicks = await incrementPaymentIntentClicks(
      conversation.id,
    );
    await clearConversationLock(conversation.id);

    return Response.json({
      conversationId: conversation.id,
      paymentIntentClicks,
      unlocked: true,
      message: "Server capacity expanding. Enjoy this chapter for free!",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error.";
    console.error("[velvet/chat/unlock-intent] failed:", error);
    return jsonError(message, 500);
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
