/**
 * Codex Memory Cards — server unlock helpers for hardware-verified trophies.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface UserCodexCard {
  id: string;
  user_id: string;
  mission_id: string;
  title: string;
  description: string;
  unlocked_at: string;
}

export interface UnlockCodexCardInput {
  userId: string;
  missionId: string;
  missionText: string;
}

function slugifyMissionKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

/** Premium English trophy titles derived from mission semantics. */
export function resolveCodexTitle(missionText: string): string {
  const text = missionText.toLowerCase();

  if (text.includes("desk") || text.includes("workspace") || text.includes("study")) {
    return "The Desk Deliverance";
  }
  if (text.includes("dark") || text.includes("lights") || text.includes("night")) {
    return "Eclipse Protocol";
  }
  if (
    text.includes("workout") ||
    text.includes("exertion") ||
    text.includes("exercise") ||
    text.includes("push")
  ) {
    return "Flesh & Discipline";
  }
  if (text.includes("conversation") || text.includes("presence") || text.includes("social")) {
    return "Presence Unlocked";
  }
  if (text.includes("fear") || text.includes("threshold") || text.includes("comfort")) {
    return "Threshold Breach";
  }
  if (text.includes("focus") || text.includes("phone")) {
    return "Focus Sanctum";
  }

  return "Objective Completed";
}

export function resolveCodexDescription(missionText: string): string {
  const trimmed = missionText.trim();
  if (trimmed.length <= 180) {
    return trimmed;
  }
  return `${trimmed.slice(0, 177).trim()}…`;
}

export function resolveMissionIdForCodex(
  missionId: string | undefined,
  missionText: string,
): string {
  const explicit = missionId?.trim();
  if (explicit) {
    return explicit.slice(0, 120);
  }
  return `mission_${slugifyMissionKey(missionText) || "unknown"}`;
}

/**
 * Insert a unique codex trophy for an approved hardware mission.
 * Idempotent on (user_id, mission_id).
 */
export async function unlockCodexCard(
  input: UnlockCodexCardInput,
): Promise<UserCodexCard> {
  const missionId = resolveMissionIdForCodex(input.missionId, input.missionText);
  const title = resolveCodexTitle(input.missionText);
  const description = resolveCodexDescription(input.missionText);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_codex_cards")
    .upsert(
      {
        user_id: input.userId,
        mission_id: missionId,
        title,
        description,
        unlocked_at: new Date().toISOString(),
      },
      { onConflict: "user_id,mission_id" },
    )
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to unlock codex card: ${error.message}`);
  }

  if (!data) {
    throw new Error("Codex card unlock returned no row.");
  }

  return data as UserCodexCard;
}

export async function listCodexCardsForUser(
  userId: string,
  limit = 24,
): Promise<UserCodexCard[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_codex_cards")
    .select("*")
    .eq("user_id", userId)
    .order("unlocked_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)));

  if (error) {
    console.warn("[codex] list failed:", error.message);
    return [];
  }

  return (data as UserCodexCard[] | null) ?? [];
}
