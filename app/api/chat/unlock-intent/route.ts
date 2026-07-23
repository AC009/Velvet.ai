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

function toQuestmasterNumericId(token: string): number {
  const parsed = Number(token);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return 8; // watcher
}

function toWorldNumericId(token: string): number {
  const parsed = Number(token);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  const normalized = token.toLowerCase().replace(/[\s-]+/g, "_");
  if (
    normalized.includes("horror") ||
    normalized.includes("threshold") ||
    normalized === "horror_mystery"
  ) {
    return 3;
  }
  if (normalized.includes("romance")) return 1;
  if (normalized.includes("mafia")) return 2;
  if (normalized.includes("school")) return 4;
  return 3; // horror_mystery
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

  return {
    userId,
    worldId: toWorldNumericId(resolveConversationWorldId(body)),
    characterId: toQuestmasterNumericId(resolveQuestmasterId(body)),
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
      );

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
