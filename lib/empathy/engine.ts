/**
 * Dynamic Empathy Engine — energy check-in → difficulty downgrade → Recovery Sync.
 * English-only Watcher copy. Hardware Environment Sync for night/gyro nodes.
 */

import type { HardwareMission, HardwareSensorKind } from "@/lib/frontend/hardware-mission-pool";

export type EnergyLevel = 1 | 2 | 3 | 4 | 5;

export type EmpathyMode = "STANDARD" | "RECOVERY" | "FOCUS";

export type VerificationMode =
  | "camera"
  | "environment_sync"
  | "recovery_sync";

export const ENERGY_LOW_MAX = 2;

/**
 * Shared marker — MissionGate gyro mode + Recovery / Focus mission copy MUST include this exact phrase.
 */
export const FACE_DOWN_MARKER = "Place your phone face down";

/**
 * PRODUCTION PROTOCOL DURATIONS (seconds)
 * ─────────────────────────────────────────
 * Recovery Sync (energy 1–2): 5 minutes  → 300s
 * Night Focus Protocol (energy 3–5 / env): 30 minutes → 1800s
 *
 * Local QA override (optional): temporarily set both to `10` for device testing,
 * then restore these production values before Vercel deploy.
 */
export const RECOVERY_SYNC_DURATION_SEC = 300;
export const NIGHT_FOCUS_PROTOCOL_DURATION_SEC = 1800;

export const RECOVERY_SYNC_MISSION: HardwareMission = {
  id: "hw_recovery_sync_01",
  title: "Recovery Sync Node",
  sensorKind: "gyro_focus",
  sensorLabel: "Gyroscope — Recovery Sync",
  missionText: `${FACE_DOWN_MARKER} on your desk. Banish the artificial glare. 5-minute Rest and Recovery Protocol begins now.`,
  validationOpener:
    "I see you rested. Exhaustion is data, not failure. We continue when you are restored...",
};

export const NIGHT_FOCUS_PROTOCOL_TEXT = `${FACE_DOWN_MARKER} on your desk. Banish the artificial glare. The 30-minute Focus Protocol begins now.`;

export function isLowEnergy(level: EnergyLevel): boolean {
  return level <= ENERGY_LOW_MAX;
}

export function usesEnvironmentSync(sensorKind: HardwareSensorKind): boolean {
  return sensorKind === "light_night" || sensorKind === "gyro_focus";
}

export function isFaceDownProtocolText(missionText: string): boolean {
  return missionText.includes(FACE_DOWN_MARKER);
}

export function resolveVerificationMode(params: {
  energyLevel: EnergyLevel;
  sensorKind: HardwareSensorKind;
}): VerificationMode {
  if (isLowEnergy(params.energyLevel)) {
    return "recovery_sync";
  }
  if (usesEnvironmentSync(params.sensorKind)) {
    return "environment_sync";
  }
  return "camera";
}

export function resolveActiveMission(params: {
  energyLevel: EnergyLevel;
  original: HardwareMission;
}): {
  mission: HardwareMission;
  empathyMode: EmpathyMode;
  verificationMode: VerificationMode;
  durationSec: number;
} {
  const verificationMode = resolveVerificationMode({
    energyLevel: params.energyLevel,
    sensorKind: params.original.sensorKind,
  });

  if (verificationMode === "recovery_sync") {
    return {
      mission: RECOVERY_SYNC_MISSION,
      empathyMode: "RECOVERY",
      verificationMode,
      durationSec: RECOVERY_SYNC_DURATION_SEC,
    };
  }

  if (verificationMode === "environment_sync") {
    const nightMission: HardwareMission = {
      ...params.original,
      missionText: isFaceDownProtocolText(params.original.missionText)
        ? params.original.missionText
        : NIGHT_FOCUS_PROTOCOL_TEXT,
      sensorLabel:
        params.original.sensorKind === "light_night"
          ? "Light + Gyro — Night Discipline"
          : params.original.sensorLabel,
    };
    return {
      mission: nightMission,
      empathyMode: "FOCUS",
      verificationMode,
      durationSec: NIGHT_FOCUS_PROTOCOL_DURATION_SEC,
    };
  }

  return {
    mission: params.original,
    empathyMode: "STANDARD",
    verificationMode: "camera",
    durationSec: 0,
  };
}

export function watcherEmpathyDowngradeCopy(energyLevel: EnergyLevel): string {
  if (energyLevel === 1) {
    return "I see you are exhausted today. I have adjusted the parameters. Banish the glare and rest. We sync again when you are restored...";
  }
  return "I read your focus node as strained. I have softened the lock into a Recovery Sync. Face down. Dark. Five minutes. No guilt — only restoration.";
}

export function watcherGyroBreachCopy(empathyMode: EmpathyMode): string {
  if (empathyMode === "RECOVERY") {
    return "You broke the stillness too soon. I am not angry — I am watching. Place the phone face down again. Rest is the mission. Try once more when you are ready.";
  }
  return "You broke the Focus Protocol. Artificial glare returned before the timer ended. I understand the pull — but discipline means staying down. Reset when you are ready.";
}

export function watcherEnvironmentSuccessCopy(empathyMode: EmpathyMode): string {
  if (empathyMode === "RECOVERY") {
    return "Good. You rested without performance. Affinity holds. We sync again when your energy returns.";
  }
  return "Night Discipline held. The glare stayed banished. Your restraint is noted — channel unlocked.";
}

export function formatFocusCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function parseEnergyLevel(value: unknown): EnergyLevel | null {
  const n = typeof value === "number" ? value : Number(value);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) {
    return n;
  }
  return null;
}
