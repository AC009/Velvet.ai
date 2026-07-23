/**
 * GET /api/codex/cards?userId= — list unlocked Codex Memory Cards.
 */
import { listCodexCardsForUser } from "@/lib/codex/card-store";
import { isSupabaseConfigured } from "@/lib/env";
import { isValidUuid, jsonError } from "@/lib/chat/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    if (!isSupabaseConfigured()) {
      return jsonError("Supabase server credentials are not configured.", 503);
    }

    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId || !isValidUuid(userId)) {
      return jsonError("userId query param must be a valid UUID.", 400);
    }

    const cards = await listCodexCardsForUser(userId);
    return Response.json({ cards });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load codex cards.";
    console.error("[codex/cards] failed:", error);
    return jsonError(message, 500);
  }
}
