import posthog from "posthog-js";

let initialized = false;

export function initPostHog(): void {
  if (typeof window === "undefined" || initialized) {
    return;
  }

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    return;
  }

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false,
    autocapture: false,
  });

  initialized = true;
}

export function track(
  name: "world_selected",
  properties: { worldId: number },
): void;
export function track(
  name: "character_selected",
  properties: { characterId: number },
): void;
export function track(
  name: "chat_action_clicked",
  properties: { actionType: "react" | "memory" | "story" },
): void;
export function track(
  name: "story_arc_started",
  properties: { storyId: string },
): void;
export function track(
  name: "quest_line_selected",
  properties: { questLineId: string; worldId: number },
): void;
export function track(
  name: "quest_line_onboarding_started",
  properties: { questLineId: string; characterId: number; worldId: number },
): void;
export function track(
  name: "questmaster_recruited",
  properties: {
    characterId: number;
    worldId: number;
    questLineId: string;
    sessionState: string;
  },
): void;
export function track(
  name: "continue_clicked",
  properties: {
    source: "quest_complete" | "story_continue" | "director";
    characterId?: number;
    worldId?: number;
    storyId?: string;
  },
): void;
export function track(
  name: "first_message_loaded",
  properties: {
    source: "quest_narrative" | "greeting" | "return_pulse";
    conversationId?: number;
    characterId?: number;
    worldId?: number;
  },
): void;
export function track(
  name: "quest_mission_completed",
  properties: {
    characterId: number;
    worldId: number;
    xpAwarded: number;
    missionIndex: number;
  },
): void;
export function track(
  name: "mission_submission_attempt",
  properties: {
    missionId: string;
    userId: string;
    missionTextPreview?: string;
  },
): void;
export function track(
  name: "mission_verified",
  properties: {
    status: "success" | "failed";
    score_impact: number;
    missionId?: string;
    arcProgress?: number;
    affinityScore?: number;
    statusTag?: string;
    reason?: string;
  },
): void;
export function track(
  name: "progress_shared_progress",
  properties: {
    current_affinity: number;
    statusTag?: string;
    arcProgress?: number;
  },
): void;
export function track(
  name: "user_licked_share_progress",
  properties: {
    affinity: number;
    status_tag: string;
    missionTitle?: string;
    arcProgress?: number;
  },
): void;
export function track(
  name: string,
  properties: Record<string, unknown>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!initialized) {
    initPostHog();
  }

  if (!initialized) {
    return;
  }

  try {
    posthog.capture(name, properties);
  } catch {
    /* analytics must never break UX */
  }
}
