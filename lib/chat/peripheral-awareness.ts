import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { RelationshipVector } from "@/lib/types/database";

export type LocalTimeSlot =
  | "late_night"
  | "early_morning"
  | "day"
  | "evening";

export interface WorldNarrativeMilestone {
  worldId: number;
  conversationId: number;
  lastActiveAt: string;
  isLocked: boolean;
  messageCount: number;
}

export interface StateDriftMetrics {
  trust: number;
  tension: number;
  affinity: number;
  hostility: number;
  intimacy: number;
  affinityDrift: number;
  tensionDrift: number;
  timelineIndicator: "red" | "gold" | "neutral";
  silenceHours: number;
}

export interface PeripheralAmbientPayload {
  localTimeSlot: LocalTimeSlot;
  localHourEstimate: number;
  ambientCondition: string;
  worldMilestones: WorldNarrativeMilestone[];
  crossWorldActivity: string;
  stateDrift: StateDriftMetrics;
  narrativeQuery: string;
}

const WORLD_NAMES: Record<number, string> = {
  1: "Romance Drama",
  2: "Mafia World",
  3: "Horror Mystery",
  4: "School Drama",
};

export function resolveLocalTimeSlot(
  referenceIso: string,
  nowMs: number = Date.now(),
): { slot: LocalTimeSlot; hourEstimate: number } {
  const anchor = Date.parse(referenceIso);
  const anchorHour = Number.isNaN(anchor)
    ? new Date(nowMs).getUTCHours()
    : new Date(anchor).getUTCHours();
  const currentHour = new Date(nowMs).getUTCHours();
  const hourEstimate = currentHour;

  if (hourEstimate >= 22 || hourEstimate < 5) {
    return { slot: "late_night", hourEstimate };
  }
  if (hourEstimate >= 5 && hourEstimate < 9) {
    return { slot: "early_morning", hourEstimate };
  }
  if (hourEstimate >= 17 && hourEstimate < 22) {
    return { slot: "evening", hourEstimate };
  }
  return { slot: "day", hourEstimate };
}

export function resolveAmbientCondition(params: {
  worldId: number;
  localTimeSlot: LocalTimeSlot;
  timelineIndicator: StateDriftMetrics["timelineIndicator"];
}): string {
  if (params.worldId === 3 && params.localTimeSlot === "late_night") {
    return "storm rolling past the perimeter; heavy static on the line";
  }
  if (params.worldId === 2 && params.localTimeSlot === "evening") {
    return "docks are active; loyalty tests in motion";
  }
  if (params.worldId === 1 && params.localTimeSlot === "late_night") {
    return "city lights dim; unresolved tension in the air";
  }
  if (params.worldId === 4 && params.localTimeSlot === "early_morning") {
    return "campus corridors waking; rumors spreading fast";
  }
  if (params.timelineIndicator === "red") {
    return "timeline indicator flashing red; stakes escalating";
  }
  if (params.localTimeSlot === "early_morning") {
    return "early routine window; quiet before the day breaks open";
  }
  return "ambient silence; peripheral sensors still tracking";
}

export async function fetchUserWorldMilestones(
  userId: string,
): Promise<WorldNarrativeMilestone[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("conversations")
    .select("id, world_id, updated_at, locked_until")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error) {
    console.warn("[peripheral-awareness] milestone fetch failed:", error.message);
    return [];
  }

  const milestones: WorldNarrativeMilestone[] = [];

  for (const row of data ?? []) {
    const conversationId = row.id as number;
    const { count, error: countError } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    if (countError) {
      continue;
    }

    const lockedUntil = row.locked_until as string | null;
    milestones.push({
      worldId: row.world_id as number,
      conversationId,
      lastActiveAt: row.updated_at as string,
      isLocked: lockedUntil !== null && Date.parse(lockedUntil) > Date.now(),
      messageCount: count ?? 0,
    });
  }

  return milestones;
}

export function computeStateDriftMetrics(params: {
  relationshipVector: RelationshipVector;
  absenceMs: number;
  baselineTrust?: number;
  baselineTension?: number;
}): StateDriftMetrics {
  const baselineTrust = params.baselineTrust ?? 50;
  const baselineTension = params.baselineTension ?? 40;
  const { trust, tension, affinity, hostility, intimacy } = params.relationshipVector;

  let timelineIndicator: StateDriftMetrics["timelineIndicator"] = "neutral";
  if (tension >= 60 || hostility >= 55) {
    timelineIndicator = "red";
  } else if (affinity >= 62) {
    timelineIndicator = "gold";
  }

  return {
    trust,
    tension,
    affinity,
    hostility,
    intimacy,
    affinityDrift: affinity - 50,
    tensionDrift: tension - baselineTension,
    timelineIndicator,
    silenceHours: Math.round((params.absenceMs / (60 * 60 * 1000)) * 10) / 10,
  };
}

export function formatCrossWorldActivity(
  milestones: WorldNarrativeMilestone[],
  activeWorldId: number,
): string {
  const others = milestones.filter((m) => m.worldId !== activeWorldId);
  if (others.length === 0) {
    return "No parallel world threads detected.";
  }

  return others
    .slice(0, 4)
    .map((milestone) => {
      const name = WORLD_NAMES[milestone.worldId] ?? `World ${milestone.worldId}`;
      const lock = milestone.isLocked ? "locked cliffhanger" : "open thread";
      return `${name}: ${milestone.messageCount} msgs, ${lock}, last active ${milestone.lastActiveAt}`;
    })
    .join(" | ");
}

export function buildPeripheralAmbientPayload(params: {
  userId: string;
  worldId: number;
  lastActivityIso: string;
  absenceMs: number;
  relationshipVector: RelationshipVector;
  milestones: WorldNarrativeMilestone[];
  memoryHeadline: string | null;
}): PeripheralAmbientPayload {
  const { slot, hourEstimate } = resolveLocalTimeSlot(params.lastActivityIso);
  const stateDrift = computeStateDriftMetrics({
    relationshipVector: params.relationshipVector,
    absenceMs: params.absenceMs,
  });
  const ambientCondition = resolveAmbientCondition({
    worldId: params.worldId,
    localTimeSlot: slot,
    timelineIndicator: stateDrift.timelineIndicator,
  });

  const narrativeQuery = [
    params.memoryHeadline ?? "",
    ambientCondition,
    stateDrift.timelineIndicator === "red" ? "timeline red alert" : "",
    slot === "late_night" ? "night perimeter watch" : "",
    ...params.milestones.map((m) => WORLD_NAMES[m.worldId] ?? ""),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    localTimeSlot: slot,
    localHourEstimate: hourEstimate,
    ambientCondition,
    worldMilestones: params.milestones,
    crossWorldActivity: formatCrossWorldActivity(params.milestones, params.worldId),
    stateDrift,
    narrativeQuery: narrativeQuery || "proactive silence check-in",
  };
}

export function formatPeripheralContextBlock(
  ambient: PeripheralAmbientPayload,
): string {
  return [
    "PERIPHERAL AWARENESS — LIVE CONTEXT:",
    `Local time slot: ${ambient.localTimeSlot} (hour ~${ambient.localHourEstimate})`,
    `Ambient condition: ${ambient.ambientCondition}`,
    `Timeline indicator: ${ambient.stateDrift.timelineIndicator}`,
    `Silence window: ${ambient.stateDrift.silenceHours}h`,
    `Trust/Tension/Affinity: ${ambient.stateDrift.trust}/${ambient.stateDrift.tension}/${ambient.stateDrift.affinity}`,
    `Affinity drift: ${ambient.stateDrift.affinityDrift >= 0 ? "+" : ""}${ambient.stateDrift.affinityDrift}`,
    `Cross-world milestones: ${ambient.crossWorldActivity}`,
  ].join("\n");
}
