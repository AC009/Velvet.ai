/**
 * GET /api/quest/session — Active RPG quest session + lock state for chat UI.
 */
import {
  getQuestSessionSnapshot,
  type QuestSessionSnapshot,
} from "@/lib/chat/rpg-session-store";
import { isValidUuid, jsonError } from "@/lib/chat/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId || !isValidUuid(userId)) {
    return jsonError("userId query param must be a valid UUID.", 400);
  }

  try {
    const session: QuestSessionSnapshot | null =
      await getQuestSessionSnapshot(userId);

    if (!session) {
      return Response.json({
        active: false,
        questStatus: "UNLOCKED" as const,
        xpTotal: 0,
        xpMultiplier: 1,
        missionIndex: 1,
      });
    }

    return Response.json({
      active: true,
      ...session,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Quest session fetch failed.";
    console.error("[velvet/quest/session] request failed:", error);
    return jsonError(message, 500);
  }
}

export async function POST(): Promise<Response> {
  return jsonError("Method not allowed. Use GET.", 405);
}
