/**
 * Client for POST /api/verify-mission — hardware Vision gate.
 */

export type HardwareStatusTag = "TOXIC ATTRACTION" | "RESPECT";

export interface VerifyMissionRequest {
  userId: string;
  missionText: string;
  image: string;
  missionId?: string;
  energyLevel?: 1 | 2 | 3 | 4 | 5;
  empathyMode?: "STANDARD" | "RECOVERY" | "FOCUS";
  verificationMode?: "camera" | "environment_sync" | "recovery_sync";
}

export interface VerifyMissionResponse {
  approved: boolean;
  feedback: string;
  rewardsApplied: boolean;
  arcProgress: number;
  affinityScore: number;
  statusTag: HardwareStatusTag;
  previousArcProgress?: number;
  previousAffinityScore?: number;
  storyId?: string;
  missionIndex?: number;
  codexCard?: {
    id: string;
    missionId: string;
    title: string;
    description: string;
    unlockedAt: string;
  } | null;
  error?: string;
}

export async function submitMissionVerification(
  params: VerifyMissionRequest,
): Promise<VerifyMissionResponse> {
  const response = await fetch("/api/verify-mission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: params.userId,
      missionText: params.missionText,
      image: params.image,
      missionId: params.missionId,
      energyLevel: params.energyLevel,
      empathyMode: params.empathyMode,
      verificationMode: params.verificationMode ?? "camera",
    }),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Mission verification failed (${response.status}).`;
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Mission verification returned an empty response.");
  }

  const body = payload as Record<string, unknown>;
  if (typeof body.approved !== "boolean") {
    throw new Error("Mission verification response missing 'approved'.");
  }
  if (typeof body.feedback !== "string") {
    throw new Error("Mission verification response missing 'feedback'.");
  }

  const statusTagRaw = body.statusTag;
  const statusTag: HardwareStatusTag =
    statusTagRaw === "RESPECT" ? "RESPECT" : "TOXIC ATTRACTION";

  const codexRaw =
    body.codexCard && typeof body.codexCard === "object"
      ? (body.codexCard as Record<string, unknown>)
      : null;

  return {
    approved: body.approved,
    feedback: body.feedback,
    rewardsApplied: Boolean(body.rewardsApplied),
    arcProgress: Number(body.arcProgress ?? 0),
    affinityScore: Number(body.affinityScore ?? 50),
    statusTag,
    previousArcProgress:
      typeof body.previousArcProgress === "number"
        ? body.previousArcProgress
        : undefined,
    previousAffinityScore:
      typeof body.previousAffinityScore === "number"
        ? body.previousAffinityScore
        : undefined,
    storyId: typeof body.storyId === "string" ? body.storyId : undefined,
    missionIndex:
      typeof body.missionIndex === "number" ? body.missionIndex : undefined,
    codexCard: codexRaw
      ? {
          id: String(codexRaw.id ?? ""),
          missionId: String(codexRaw.missionId ?? ""),
          title: String(codexRaw.title ?? "Objective Completed"),
          description: String(codexRaw.description ?? ""),
          unlockedAt: String(codexRaw.unlockedAt ?? ""),
        }
      : null,
  };
}
