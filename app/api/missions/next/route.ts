/**
 * GET /api/missions/next — fetch next sequential mission from missions_pool.
 */
import { isSupabaseConfigured } from "@/lib/env";
import {
  fetchNextMissionFromPool,
  resolveWorldTypeLabel,
  type MissionsPoolRow,
} from "@/lib/missions/pool-store";
import { jsonError } from "@/lib/chat/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    if (!isSupabaseConfigured()) {
      return jsonError("Supabase server credentials are not configured.", 503);
    }

    const { searchParams } = new URL(request.url);
    const worldIdRaw = searchParams.get("worldId");
    const worldTypeParam = searchParams.get("worldType");
    const arcId = searchParams.get("arcId") ?? "arc_1";
    const afterRaw = searchParams.get("afterSequence");

    const worldId =
      worldIdRaw && Number.isFinite(Number(worldIdRaw))
        ? Number(worldIdRaw)
        : null;
    const worldType =
      worldTypeParam?.trim() || resolveWorldTypeLabel(worldId);
    const afterSequenceOrder =
      afterRaw && Number.isFinite(Number(afterRaw))
        ? Number(afterRaw)
        : 0;

    const mission: MissionsPoolRow | null = await fetchNextMissionFromPool({
      worldType,
      arcId,
      afterSequenceOrder,
    });

    if (!mission) {
      return jsonError(
        `No missions found in pool for world_type="${worldType}" arc="${arcId}".`,
        404,
      );
    }

    return Response.json({
      id: mission.id,
      worldType: mission.world_type,
      arcId: mission.arc_id,
      sequenceOrder: mission.sequence_order,
      missionText: mission.mission_text,
      sensorType: mission.sensor_type,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch next mission.";
    console.error("[missions/next] failed:", error);
    return jsonError(message, 500);
  }
}
