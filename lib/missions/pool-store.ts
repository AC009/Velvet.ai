/**
 * Server helpers for public.missions_pool (Content Engine).
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type MissionSensorType =
  | "CAMERA_VISION"
  | "LIGHT_SENSOR"
  | "GYROSCOPE"
  | string;

export interface MissionsPoolRow {
  id: string;
  world_type: string;
  arc_id: string;
  sequence_order: number;
  mission_text: string;
  sensor_type: MissionSensorType;
  created_at?: string;
}

export function resolveWorldTypeLabel(worldId: number | null | undefined): string {
  switch (worldId) {
    case 1:
      return "Romance Drama";
    case 2:
      return "Mafia World";
    case 3:
      return "Horror Mystery";
    case 4:
      return "School Drama";
    default:
      return "Horror Mystery";
  }
}

export async function fetchNextMissionFromPool(params: {
  worldType: string;
  arcId?: string;
  afterSequenceOrder?: number;
}): Promise<MissionsPoolRow | null> {
  const supabase = getSupabaseAdmin();
  const arcId = params.arcId?.trim() || "arc_1";
  const after = Math.max(0, params.afterSequenceOrder ?? 0);

  const { data, error } = await supabase
    .from("missions_pool")
    .select("*")
    .eq("world_type", params.worldType)
    .eq("arc_id", arcId)
    .gt("sequence_order", after)
    .order("sequence_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[missions-pool] fetch next failed:", error.message);
    return null;
  }

  if (data) {
    return data as MissionsPoolRow;
  }

  // Loop arc: wrap to first mission.
  const { data: first, error: firstError } = await supabase
    .from("missions_pool")
    .select("*")
    .eq("world_type", params.worldType)
    .eq("arc_id", arcId)
    .order("sequence_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstError) {
    console.warn("[missions-pool] wrap fetch failed:", firstError.message);
    return null;
  }

  return (first as MissionsPoolRow | null) ?? null;
}

export async function fetchMissionBySequence(params: {
  worldType: string;
  arcId?: string;
  sequenceOrder: number;
}): Promise<MissionsPoolRow | null> {
  const supabase = getSupabaseAdmin();
  const arcId = params.arcId?.trim() || "arc_1";

  const { data, error } = await supabase
    .from("missions_pool")
    .select("*")
    .eq("world_type", params.worldType)
    .eq("arc_id", arcId)
    .eq("sequence_order", params.sequenceOrder)
    .maybeSingle();

  if (error) {
    console.warn("[missions-pool] fetch by sequence failed:", error.message);
    return null;
  }

  return (data as MissionsPoolRow | null) ?? null;
}
