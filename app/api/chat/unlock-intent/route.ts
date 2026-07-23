import {
  clearConversationLock,
  getOrCreateConversation,
  incrementPaymentIntentClicks,
  resolveConversationWorldId,
  resolveQuestmasterId,
} from "@/lib/chat/conversation-store";
import { isValidUuid, jsonError } from "@/lib/chat/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UnlockIntentBody {
  userId: string;
  worldId: number;
  characterId: number;
}

function parseBody(raw: unknown): UnlockIntentBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const body = raw as Record<string, unknown>;

  const userId =
    typeof body.userId === "string"
      ? body.userId
      : typeof body.user_id === "string"
        ? body.user_id
        : null;
  if (!userId || !isValidUuid(userId)) {
    throw new Error("userId must be a valid UUID string.");
  }

  const payloadQuestmasterId =
    body.questmaster_id ||
    body.characterId ||
    body.character_id ||
    body.id ||
    body.questmasterId ||
    "watcher";

  const payloadWorldId =
    body.world_id ||
    body.worldId ||
    body.world_type ||
    body.genre ||
    "horror_mystery";

  return {
    userId,
    worldId: resolveConversationWorldId(payloadWorldId, "horror_mystery"),
    characterId: resolveQuestmasterId(payloadQuestmasterId, "watcher"),
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonError("Request body must be valid JSON.", 400);
    }

    let body: UnlockIntentBody;
    try {
      body = parseBody(raw);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid request payload.";
      return jsonError(message, 400);
    }

    try {
      const conversation = await getOrCreateConversation(
        body.userId,
        body.worldId,
        "default",
        body.characterId,
        {
          questmaster_id: body.characterId,
          characterId: body.characterId,
          world_id: body.worldId,
          worldId: body.worldId,
        },
      );

      // Degraded stub (id 0) — still unlock UX without crashing.
      if (!conversation.id) {
        console.warn(
          "[velvet/chat/unlock-intent] degraded conversation stub — skipping lock mutation.",
        );
        return Response.json({
          conversationId: 0,
          paymentIntentClicks: 0,
          unlocked: true,
          degraded: true,
          message: "Server capacity expanding. Enjoy this chapter for free!",
        });
      }

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
      console.error("[velvet/chat/unlock-intent] db path failed:", error);
      return Response.json({
        conversationId: 0,
        paymentIntentClicks: 0,
        unlocked: true,
        degraded: true,
        message: "Server capacity expanding. Enjoy this chapter for free!",
      });
    }
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
