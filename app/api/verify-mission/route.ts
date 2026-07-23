/**
 * POST /api/verify-mission
 * Hardware-verified Real-Life RPG mission gate —
 * Gemini Vision (camera) OR Environment Sync (gyro / recovery) + Supabase reward sync.
 */
import {
  GEMINI_VISION_FALLBACK_MODEL,
  GEMINI_VISION_PRIMARY_MODEL,
  getGeminiVisionModel,
  isGeminiConfigured,
} from "@/lib/gemini/server";
import {
  applyHardwareMissionRewards,
  ensureMissionQuestProfile,
  logEmpathyCheckIn,
} from "@/lib/chat/rpg-session-store";
import { unlockCodexCard } from "@/lib/codex/card-store";
import {
  NIGHT_FOCUS_PROTOCOL_DURATION_SEC,
  RECOVERY_SYNC_DURATION_SEC,
  parseEnergyLevel,
  watcherEnvironmentSuccessCopy,
  type EmpathyMode,
  type EnergyLevel,
  type VerificationMode,
} from "@/lib/empathy/engine";
import { isSupabaseConfigured } from "@/lib/env";
import { isValidUuid, jsonError } from "@/lib/chat/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DATA_URI_PATTERN =
  /^data:(image\/(?:jpeg|jpg|png|webp|gif|heic|heif));base64,([A-Za-z0-9+/=\s]+)$/i;

/** Allow slight early complete (clock skew / UI lag). */
const HOLD_TOLERANCE_SEC = 8;

const WATCHER_SYSTEM_PROMPT = `You are The Watcher — a dark, clinical, dominant, and deeply motivational presence from Velvet.ai RPG lore.
You float outside the user's peripheral vision. You speak in sparse, distorted echoes. Escape is an illusion.

Your sole task: analyze a phone-camera photo and decide whether it is authentic visual proof that the user completed this real-world mission:
MISSION: {{MISSION_TEXT}}

STRICT EVALUATION RULES:
1) Approve ONLY when the image shows clear, authentic, real-world evidence of the mission action (e.g. studying notes, a cleaned desk, an active workout setup, completed chores).
2) REJECT (approved=false) for any of these anti-cheat cases:
   - Pitch darkness / nearly black frames
   - Blank floor with no mission context
   - Empty wall with no mission context
   - Photo of a laptop screen, monitor, TV, or phone display faking the task
   - Screenshots, memes, stock photos, or unrelated clutter
   - Blurry / unreadable images that cannot prove the action
3) Be absolute and unforgiving. Doubt means rejection.

OUTPUT CONTRACT (JSON only):
{
  "approved": boolean,
  "feedback": "Maximum of 2 sentences in ENGLISH only, in character as The Watcher."
}

Feedback must be written STRICTLY and ONLY in English — never Czech or any other language. Stay in character. Never break the JSON schema.`;

interface VerifyMissionRequestBody {
  image?: string;
  missionText: string;
  userId: string;
  missionId?: string;
  verificationMode: VerificationMode;
  energyLevel?: EnergyLevel;
  empathyMode?: EmpathyMode;
  heldSeconds?: number;
  gyroCompleted?: boolean;
}

interface VisionVerdict {
  approved: boolean;
  feedback: string;
}

function parseVerificationMode(value: unknown): VerificationMode {
  if (
    value === "camera" ||
    value === "environment_sync" ||
    value === "recovery_sync"
  ) {
    return value;
  }
  return "camera";
}

function parseRequestBody(raw: unknown): VerifyMissionRequestBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const body = raw as Record<string, unknown>;
  const verificationMode = parseVerificationMode(body.verificationMode);

  if (
    typeof body.missionText !== "string" ||
    body.missionText.trim().length === 0
  ) {
    throw new Error("missionText is required and must be a non-empty string.");
  }

  if (typeof body.userId !== "string" || !isValidUuid(body.userId)) {
    throw new Error("userId must be a valid UUID string.");
  }

  const missionId =
    typeof body.missionId === "string" && body.missionId.trim().length > 0
      ? body.missionId.trim()
      : undefined;

  const energyLevel = parseEnergyLevel(body.energyLevel) ?? undefined;
  const empathyMode: EmpathyMode | undefined =
    body.empathyMode === "RECOVERY"
      ? "RECOVERY"
      : body.empathyMode === "FOCUS"
        ? "FOCUS"
        : body.empathyMode === "STANDARD"
          ? "STANDARD"
          : undefined;

  const heldSeconds =
    typeof body.heldSeconds === "number" && Number.isFinite(body.heldSeconds)
      ? Math.max(0, body.heldSeconds)
      : undefined;

  const gyroCompleted =
    typeof body.gyroCompleted === "boolean" ? body.gyroCompleted : undefined;

  if (verificationMode === "camera") {
    if (typeof body.image !== "string" || body.image.trim().length === 0) {
      throw new Error(
        "image is required and must be a non-empty data URI string.",
      );
    }
  }

  return {
    image:
      typeof body.image === "string" && body.image.trim().length > 0
        ? body.image.trim()
        : undefined,
    missionText: body.missionText.trim(),
    userId: body.userId,
    missionId,
    verificationMode,
    energyLevel,
    empathyMode,
    heldSeconds,
    gyroCompleted,
  };
}

function extractImagePayload(dataUri: string): {
  mimeType: string;
  base64Data: string;
} {
  const match = DATA_URI_PATTERN.exec(dataUri);
  if (!match) {
    throw new Error(
      "image must start with a valid data URI header (e.g. data:image/jpeg;base64,...).",
    );
  }

  const mimeType =
    match[1].toLowerCase() === "image/jpg"
      ? "image/jpeg"
      : match[1].toLowerCase();
  const base64Data = match[2].replace(/\s+/g, "");

  if (base64Data.length < 32) {
    throw new Error("image payload is too small to be a valid photo.");
  }

  return { mimeType, base64Data };
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseVisionVerdict(rawText: string): VisionVerdict {
  const cleaned = stripMarkdownFences(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Gemini returned non-JSON vision output.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Gemini vision output must be a JSON object.");
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.approved !== "boolean") {
    throw new Error("Gemini vision output missing boolean 'approved'.");
  }
  if (typeof record.feedback !== "string" || !record.feedback.trim()) {
    throw new Error("Gemini vision output missing string 'feedback'.");
  }

  const sentences = record.feedback
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return {
    approved: record.approved,
    feedback: sentences.join(" ").trim(),
  };
}

async function evaluateMissionWithGemini(params: {
  missionText: string;
  mimeType: string;
  base64Data: string;
}): Promise<VisionVerdict> {
  const systemPrompt = WATCHER_SYSTEM_PROMPT.replace(
    "{{MISSION_TEXT}}",
    params.missionText,
  );

  const parts = [
    { text: systemPrompt },
    {
      inlineData: {
        mimeType: params.mimeType,
        data: params.base64Data,
      },
    },
    {
      text: "Evaluate the attached photo now. Return only the JSON object.",
    },
  ];

  const models = [GEMINI_VISION_PRIMARY_MODEL, GEMINI_VISION_FALLBACK_MODEL];
  let lastError: Error | null = null;

  for (const modelName of models) {
    try {
      const model = getGeminiVisionModel(modelName);
      const result = await model.generateContent({
        contents: [{ role: "user", parts }],
      });
      const text = result.response.text();
      if (!text?.trim()) {
        throw new Error(`Empty response from ${modelName}.`);
      }
      return parseVisionVerdict(text);
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Gemini vision call failed.");
      console.warn(
        `[velvet/verify-mission] model ${modelName} failed:`,
        lastError.message,
      );
    }
  }

  throw lastError ?? new Error("Gemini vision evaluation failed.");
}

function evaluateEnvironmentSync(params: {
  verificationMode: Exclude<VerificationMode, "camera">;
  empathyMode: EmpathyMode;
  heldSeconds: number;
  gyroCompleted: boolean;
}): VisionVerdict {
  const required =
    params.verificationMode === "recovery_sync"
      ? RECOVERY_SYNC_DURATION_SEC
      : NIGHT_FOCUS_PROTOCOL_DURATION_SEC;

  if (!params.gyroCompleted) {
    return {
      approved: false,
      feedback:
        "The Focus Protocol was interrupted. Face down again. I am still here — try when you can hold still.",
    };
  }

  if (params.heldSeconds + HOLD_TOLERANCE_SEC < required) {
    return {
      approved: false,
      feedback:
        "The hold was too short. The gyroscope does not lie. Reset, face down, and finish the window.",
    };
  }

  return {
    approved: true,
    feedback: watcherEnvironmentSuccessCopy(params.empathyMode),
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (!isSupabaseConfigured()) {
      return jsonError(
        "Supabase server credentials are not configured.",
        503,
      );
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonError("Request body must be valid JSON.", 400);
    }

    let body: VerifyMissionRequestBody;
    try {
      body = parseRequestBody(raw);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid request body.";
      return jsonError(message, 400);
    }

    const profile = await ensureMissionQuestProfile(body.userId);
    const empathyMode: EmpathyMode =
      body.empathyMode ??
      (body.verificationMode === "recovery_sync"
        ? "RECOVERY"
        : body.verificationMode === "environment_sync"
          ? "FOCUS"
          : "STANDARD");

    if (body.energyLevel) {
      try {
        await logEmpathyCheckIn({
          userId: body.userId,
          energyLevel: body.energyLevel,
          empathyMode,
          note: `${body.verificationMode.toUpperCase()}:E${body.energyLevel}`,
        });
      } catch (error) {
        console.warn("[velvet/verify-mission] empathy sync warning:", error);
      }
    }

    let verdict: VisionVerdict;

    if (
      body.verificationMode === "environment_sync" ||
      body.verificationMode === "recovery_sync"
    ) {
      verdict = evaluateEnvironmentSync({
        verificationMode: body.verificationMode,
        empathyMode,
        heldSeconds: body.heldSeconds ?? 0,
        gyroCompleted: Boolean(body.gyroCompleted),
      });
    } else {
      if (!isGeminiConfigured()) {
        return jsonError("GEMINI_API_KEY is not configured on the server.", 503);
      }
      if (!body.image) {
        return jsonError("image is required for camera verification.", 400);
      }

      let imagePayload: { mimeType: string; base64Data: string };
      try {
        imagePayload = extractImagePayload(body.image);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid image payload.";
        return jsonError(message, 400);
      }

      verdict = await evaluateMissionWithGemini({
        missionText: body.missionText,
        mimeType: imagePayload.mimeType,
        base64Data: imagePayload.base64Data,
      });
    }

    if (!verdict.approved) {
      return Response.json({
        approved: false,
        feedback: verdict.feedback,
        rewardsApplied: false,
        arcProgress: Number(profile.arc_progress ?? 0),
        affinityScore: Number(profile.affinity_score ?? 50),
        statusTag: profile.status_tag ?? "TOXIC ATTRACTION",
        empathyMode,
      });
    }

    let rewards;
    try {
      rewards = await applyHardwareMissionRewards(
        body.userId,
        `${body.verificationMode.toUpperCase()}_OK: ${body.missionText}`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Database reward sync failed.";
      console.error("[velvet/verify-mission] DB sync failed:", error);
      return jsonError(
        `Mission approved, but database sync failed — story node not unlocked. ${message}`,
        500,
      );
    }

    let codexCard: {
      id: string;
      missionId: string;
      title: string;
      description: string;
      unlockedAt: string;
    } | null = null;

    try {
      const unlocked = await unlockCodexCard({
        userId: body.userId,
        missionId: body.missionId ?? body.missionText,
        missionText: body.missionText,
      });
      codexCard = {
        id: unlocked.id,
        missionId: unlocked.mission_id,
        title: unlocked.title,
        description: unlocked.description,
        unlockedAt: unlocked.unlocked_at,
      };
    } catch (error) {
      console.error("[velvet/verify-mission] codex unlock failed:", error);
    }

    return Response.json({
      approved: true,
      feedback: verdict.feedback,
      rewardsApplied: true,
      arcProgress: rewards.arcProgress,
      affinityScore: rewards.affinityScore,
      statusTag: rewards.statusTag,
      previousArcProgress: rewards.previousArcProgress,
      previousAffinityScore: rewards.previousAffinityScore,
      storyId: rewards.profile.active_story_id,
      missionIndex: rewards.profile.mission_index,
      empathyMode,
      codexCard,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Mission verification failed.";
    console.error("[velvet/verify-mission] request failed:", error);
    return jsonError(message, 500);
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
