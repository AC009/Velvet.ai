import { getCharacterById, getWorldById } from "@/lib/frontend/catalog";
import type { AppPhase } from "@/lib/frontend/types";

const STORAGE_KEY = "velvet:navigation-state";

const DASHBOARD_VIEWS = new Set(["lobby", "characters", "stories", "chat"]);
const APP_PHASES = new Set(["splash", "dashboard", "chat", "characters", "worlds"]);

export type DashboardView = "lobby" | "characters" | "stories" | "chat";

export interface PersistedNavigationState {
  dashboardView: DashboardView;
  phase: AppPhase;
  selectedWorldId: number | null;
  selectedCharacterId: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseNullableId(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function readPersistedNavigationState(): PersistedNavigationState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }

    const dashboardView = parsed.dashboardView;
    const phase = parsed.phase;

    if (typeof dashboardView !== "string" || !DASHBOARD_VIEWS.has(dashboardView)) {
      return null;
    }
    if (typeof phase !== "string" || !APP_PHASES.has(phase)) {
      return null;
    }

    return {
      dashboardView: dashboardView as DashboardView,
      phase: phase as AppPhase,
      selectedWorldId: parseNullableId(parsed.selectedWorldId),
      selectedCharacterId: parseNullableId(parsed.selectedCharacterId),
    };
  } catch {
    return null;
  }
}

export function writePersistedNavigationState(state: PersistedNavigationState): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota / privacy mode failures.
  }
}

export function clearPersistedNavigationState(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function validatePersistedNavigationState(
  state: PersistedNavigationState,
): PersistedNavigationState | null {
  const world =
    state.selectedWorldId !== null
      ? getWorldById(state.selectedWorldId)
      : undefined;
  const character =
    state.selectedCharacterId !== null
      ? getCharacterById(state.selectedCharacterId)
      : undefined;

  let dashboardView = state.dashboardView;
  let phase = state.phase;
  let selectedWorldId = state.selectedWorldId;
  let selectedCharacterId = state.selectedCharacterId;

  if (selectedWorldId !== null && !world) {
    selectedWorldId = null;
    selectedCharacterId = null;
    dashboardView = "lobby";
    phase = phase === "chat" ? "dashboard" : phase;
  }

  if (selectedCharacterId !== null && !character) {
    selectedCharacterId = null;
    if (dashboardView === "chat" || dashboardView === "stories") {
      dashboardView = world ? "characters" : "lobby";
    }
    phase = phase === "chat" ? "dashboard" : phase;
  }

  if (character && world && character.worldId !== world.id) {
    selectedWorldId = character.worldId;
  }

  if (dashboardView === "characters" && !selectedWorldId) {
    dashboardView = "lobby";
    phase = phase === "chat" ? "dashboard" : phase;
  }

  if (dashboardView === "stories" && !selectedCharacterId) {
    dashboardView = selectedWorldId ? "characters" : "lobby";
    phase = phase === "chat" ? "dashboard" : phase;
  }

  if (dashboardView === "chat") {
    if (!selectedWorldId || !selectedCharacterId || !world || !character) {
      dashboardView = world ? "characters" : "lobby";
      selectedCharacterId = null;
      phase = "dashboard";
    }
  }

  if (dashboardView !== "chat" && phase === "chat") {
    phase = "dashboard";
  }

  return {
    dashboardView,
    phase,
    selectedWorldId,
    selectedCharacterId,
  };
}
