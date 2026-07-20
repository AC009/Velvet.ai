import { buildCampaignProgressSnapshot } from "@/lib/chat/quest-campaign-progress";
import { isValidUuid, jsonError } from "@/lib/chat/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const characterIdRaw = searchParams.get("characterId");
  const worldIdRaw = searchParams.get("worldId");
  const activeStoryId = searchParams.get("activeStoryId")?.trim();
  const trustRaw = searchParams.get("trust");

  if (!userId || !isValidUuid(userId)) {
    return jsonError("userId query param must be a valid UUID.", 400);
  }
  const characterId = Number(characterIdRaw);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return jsonError("characterId must be a positive integer.", 400);
  }
  const worldId = Number(worldIdRaw);
  if (!Number.isInteger(worldId) || worldId <= 0) {
    return jsonError("worldId must be a positive integer.", 400);
  }
  const trust = Number(trustRaw);
  if (!Number.isFinite(trust) || trust < -1 || trust > 1) {
    return jsonError("trust must be a number between -1 and 1.", 400);
  }
  if (!activeStoryId) {
    return jsonError("activeStoryId is required.", 400);
  }

  try {
    const snapshot = await buildCampaignProgressSnapshot({
      userId,
      characterId,
      worldId,
      activeStoryId,
      trust,
    });
    return Response.json(snapshot);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Campaign progress fetch failed.";
    console.error("[velvet/quest/campaign-progress] request failed:", error);
    return jsonError(message, 500);
  }
}

export async function POST(): Promise<Response> {
  return jsonError("Method not allowed. Use GET.", 405);
}
