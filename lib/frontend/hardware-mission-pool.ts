import { NIGHT_FOCUS_PROTOCOL_TEXT } from "@/lib/empathy/engine";

export type HardwareSensorKind =
  | "camera_environment"
  | "light_night"
  | "gyro_focus"
  | "desk_discipline"
  | "movement_grit";

export interface HardwareMission {
  id: string;
  title: string;
  sensorKind: HardwareSensorKind;
  /** HUD label shown above the camera */
  sensorLabel: string;
  /** Exact mission brief sent to /api/verify-mission */
  missionText: string;
  /** English emotional validation opener after successful proof */
  validationOpener: string;
}

export const HARDWARE_MISSION_POOL: readonly HardwareMission[] = [
  {
    id: "hw_light_night_01",
    title: "Night Discipline",
    sensorKind: "light_night",
    sensorLabel: "Light Sensor — Night Discipline",
    missionText: NIGHT_FOCUS_PROTOCOL_TEXT,
    validationOpener:
      "I see you have completed the task. Your night discipline interests me. Listen closely...",
  },
  {
    id: "hw_gyro_focus_01",
    title: "Focus Mode",
    sensorKind: "gyro_focus",
    sensorLabel: "Gyroscope — Focus Mode",
    missionText: NIGHT_FOCUS_PROTOCOL_TEXT,
    validationOpener:
      "I see you have completed the task. Your focus is palpable. Listen closely...",
  },
  {
    id: "hw_desk_clean_01",
    title: "Clean Signal",
    sensorKind: "desk_discipline",
    sensorLabel: "Environment Cam — Clean Signal",
    missionText:
      "MISSION — CLEAN SIGNAL. Show a cleaned desk or cleared floor zone you just reset. Authentic before/after clutter gone. Empty walls and blank floors without context will be rejected.",
    validationOpener:
      "I see you have completed the task. Order is proof of control. Listen closely...",
  },
  {
    id: "hw_movement_grit_01",
    title: "Body Proof",
    sensorKind: "movement_grit",
    sensorLabel: "Motion Proxy — Body Proof",
    missionText:
      "MISSION — BODY PROOF. Show real workout evidence in the room: mat, weights, push-up stance, or post-set breathing space. A dark blur or TV workout video is not proof.",
    validationOpener:
      "I see you have completed the task. Your physical effort keeps me invested. Listen closely...",
  },
  {
    id: "hw_social_prep_01",
    title: "Presence Check",
    sensorKind: "camera_environment",
    sensorLabel: "Presence Cam — Social Prep",
    missionText:
      "MISSION — PRESENCE CHECK. Show yourself ready for a real conversation: coat/shoes by the door, note with the message you will say, or the cafe/entrance you are about to enter. No mirror filters. Real world only.",
    validationOpener:
      "I see you have completed the task. Your presence carries weight. Listen closely...",
  },
  {
    id: "hw_threshold_01",
    title: "Threshold Step",
    sensorKind: "camera_environment",
    sensorLabel: "Threshold Cam — Fear Step",
    missionText:
      "MISSION — THRESHOLD. Photograph the exact place of today's discomfort (cold shower running, solo errand destination, hard-truth note). Prove you crossed the line — not that you thought about it.",
    validationOpener:
      "I see you have completed the task. You left the fear outside. Listen closely...",
  },
] as const;

export const CLIFFHANGER_BEAT_MIN = 5;
export const CLIFFHANGER_BEAT_MAX = 8;

export function rollCliffhangerThreshold(): number {
  return (
    CLIFFHANGER_BEAT_MIN +
    Math.floor(Math.random() * (CLIFFHANGER_BEAT_MAX - CLIFFHANGER_BEAT_MIN + 1))
  );
}

export function getHardwareMissionByIndex(index: number): HardwareMission {
  const safeIndex =
    ((index % HARDWARE_MISSION_POOL.length) + HARDWARE_MISSION_POOL.length) %
    HARDWARE_MISSION_POOL.length;
  return HARDWARE_MISSION_POOL[safeIndex]!;
}

export function getNextHardwareMissionIndex(currentIndex: number): number {
  return (currentIndex + 1) % HARDWARE_MISSION_POOL.length;
}

export const DEFAULT_VALIDATION_OPENER =
  "I see you have completed the task. Your discipline interests me. Listen closely...";
