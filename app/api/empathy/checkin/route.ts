/**
 * POST /api/empathy/checkin
 * Human Check-In Envelope — logs energy (1–5) + empathy routing to user_quest_profiles.
 */
import {
  isLowEnergy,
  parseEnergyLevel,
  type EmpathyMode,
} from "@/lib/empathy/engine";
import { logEmpathyCheckIn } from "@/lib/chat/rpg-session-store";
import { isSupabaseConfigured } from "@/lib/env";
import { isValidUuid, jsonError } from "@/lib/chat/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    if (!isSupabaseConfigured()) {
      return jsonError("Supabase server credentials are not configured.", 503);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonError("Request body must be valid JSON.", 400);
    }

    if (!raw || typeof raw !== "object") {
      return jsonError("Request body must be a JSON object.", 400);
    }

    const body = raw as Record<string, unknown>;
    if (typeof body.userId !== "string" || !isValidUuid(body.userId)) {
      return jsonError("userId must be a valid UUID string.", 400);
    }

    const energyLevel = parseEnergyLevel(body.energyLevel);
    if (!energyLevel) {
      return jsonError("energyLevel must be an integer from 1 to 5.", 400);
    }

    const empathyMode: EmpathyMode =
      body.empathyMode === "RECOVERY" || isLowEnergy(energyLevel)
        ? "RECOVERY"
        : body.empathyMode === "FOCUS"
          ? "FOCUS"
          : "STANDARD";

    const profile = await logEmpathyCheckIn({
      userId: body.userId,
      energyLevel,
      empathyMode,
      note:
        typeof body.note === "string" && body.note.trim()
          ? body.note.trim()
          : undefined,
    });

    return Response.json({
      ok: true,
      energyLevel,
      empathyMode,
      affinityScore: profile.affinity_score,
      statusTag: profile.status_tag,
      arcProgress: profile.arc_progress,
      empathyCheckinCount: profile.empathy_checkin_count,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Empathy check-in failed.";
    console.error("[velvet/empathy/checkin] failed:", error);
    return jsonError(message, 500);
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
