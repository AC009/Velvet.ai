/**
 * Client helpers for Dynamic Empathy Engine + extended verify payloads.
 */

import type {
  EmpathyMode,
  EnergyLevel,
  VerificationMode,
} from "@/lib/empathy/engine";
import type {
  HardwareStatusTag,
  VerifyMissionResponse,
} from "@/lib/frontend/verify-mission";

export interface EmpathyCheckInRequest {
  userId: string;
  energyLevel: EnergyLevel;
  empathyMode?: EmpathyMode;
  note?: string;
}

export interface EmpathyCheckInResponse {
  ok: boolean;
  energyLevel: EnergyLevel;
  empathyMode: EmpathyMode;
  affinityScore: number;
  statusTag: HardwareStatusTag;
  arcProgress: number;
  empathyCheckinCount: number;
}

export async function submitEmpathyCheckIn(
  params: EmpathyCheckInRequest,
): Promise<EmpathyCheckInResponse> {
  const response = await fetch("/api/empathy/checkin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: params.userId,
      energyLevel: params.energyLevel,
      empathyMode: params.empathyMode,
      note: params.note,
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
        : `Empathy check-in failed (${response.status}).`;
    throw new Error(message);
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  return {
    ok: Boolean(body.ok),
    energyLevel: (body.energyLevel as EnergyLevel) ?? params.energyLevel,
    empathyMode: body.empathyMode === "RECOVERY" ? "RECOVERY" : body.empathyMode === "FOCUS" ? "FOCUS" : "STANDARD",
    affinityScore: Number(body.affinityScore ?? 50),
    statusTag:
      body.statusTag === "RESPECT" ? "RESPECT" : "TOXIC ATTRACTION",
    arcProgress: Number(body.arcProgress ?? 0),
    empathyCheckinCount: Number(body.empathyCheckinCount ?? 0),
  };
}

export interface EnvironmentVerifyRequest {
  userId: string;
  missionText: string;
  missionId?: string;
  verificationMode: Exclude<VerificationMode, "camera">;
  energyLevel: EnergyLevel;
  empathyMode: EmpathyMode;
  heldSeconds: number;
  completed: boolean;
}

export async function submitEnvironmentVerification(
  params: EnvironmentVerifyRequest,
): Promise<VerifyMissionResponse> {
  const response = await fetch("/api/verify-mission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: params.userId,
      missionText: params.missionText,
      missionId: params.missionId,
      verificationMode: params.verificationMode,
      energyLevel: params.energyLevel,
      empathyMode: params.empathyMode,
      heldSeconds: params.heldSeconds,
      gyroCompleted: params.completed,
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
        : `Environment verification failed (${response.status}).`;
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Environment verification returned an empty response.");
  }

  const body = payload as Record<string, unknown>;
  return {
    approved: Boolean(body.approved),
    feedback: typeof body.feedback === "string" ? body.feedback : "",
    rewardsApplied: Boolean(body.rewardsApplied),
    arcProgress: Number(body.arcProgress ?? 0),
    affinityScore: Number(body.affinityScore ?? 50),
    statusTag: body.statusTag === "RESPECT" ? "RESPECT" : "TOXIC ATTRACTION",
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
    codexCard: null,
  };
}
