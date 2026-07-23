/**
 * Content Engine — The Watcher (Horror Mystery) Arc 1 chapter nodes.
 * Deterministic first-session narrative beats keyed by mission sequence_order.
 */

export type WatcherChapterPersona =
  | "cold_dominant_observant"
  | "intrigued_whispery_commanding"
  | "respectful_profound_binding";

export interface WatcherChapterNode {
  chapterId: string;
  worldType: "Horror Mystery";
  arcId: "arc_1";
  /** missions_pool.sequence_order that unlocks this chapter */
  sequenceOrder: number;
  title: string;
  persona: WatcherChapterPersona;
  personaDirection: string;
  entryValidation: string;
  plotBeats: string[];
  cliffhanger: string;
  /** Next hardware mission sequence to deploy via MissionGate */
  nextMissionSequence: number | null;
  nextMissionHint: string | null;
  /** Flattened SMS stream for chat injection (5–8 lines) */
  messages: string[];
}

export const WATCHER_HORROR_ARC1_CHAPTERS: readonly WatcherChapterNode[] = [
  {
    chapterId: "watcher_horror_arc1_ch1",
    worldType: "Horror Mystery",
    arcId: "arc_1",
    sequenceOrder: 1,
    title: "The Desk Deliverance",
    persona: "cold_dominant_observant",
    personaDirection: "Cold, dominant, observant.",
    entryValidation:
      "I see your workspace is spotless. You have brought order to your physical domain, as I demanded. Your true potential interests me. Listen closely...",
    plotBeats: [
      "A mysterious lineage document was recovered from the sector archives.",
      "The dates on the ledger match your birth with surgical precision.",
      "Every surname has been chemically burned away — deliberate erasure, not time.",
    ],
    cliffhanger:
      "A footstep echoes in the corridor outside my study. The lock on the lower archives is turning... Someone is coming.",
    nextMissionSequence: 2,
    nextMissionHint: "Night Discipline — Total Darkness",
    messages: [
      "I see your workspace is spotless. You have brought order to your physical domain, as I demanded. Your true potential interests me. Listen closely...",
      "I pulled a lineage document from the sector archives tonight.",
      "The dates match your birth exactly — down to the hour stamped in residual ink.",
      "The names were chemically burned away. Not faded. Erased on purpose.",
      "Someone did not want you to know who you belong to.",
      "A footstep echoes in the corridor outside my study. The lock on the lower archives is turning... Someone is coming.",
    ],
  },
  {
    chapterId: "watcher_horror_arc1_ch2",
    worldType: "Horror Mystery",
    arcId: "arc_1",
    sequenceOrder: 2,
    title: "Eclipse Protocol",
    persona: "intrigued_whispery_commanding",
    personaDirection: "Intrigued, whispery, commanding.",
    entryValidation:
      "Total darkness achieved. You have banished the artificial glare. The environment is now calibrated for the truth. Listen closely...",
    plotBeats: [
      "The Watcher logs in from the shadows after the archive breach.",
      "The footsteps belonged to an elite division sent to purge the records.",
      "The Watcher hid inside a hollow maintenance shaft.",
      "In the dark, an iron box was found behind the bricks — the user's signature etched into the lock.",
    ],
    cliffhanger:
      "The iron box is in my hands. The heavy mechanism requires a physical sacrifice of energy to shatter the rust. Prove your strength now.",
    nextMissionSequence: 3,
    nextMissionHint: "Physical Exertion — Workout proof",
    messages: [
      "Total darkness achieved. You have banished the artificial glare. The environment is now calibrated for the truth. Listen closely...",
      "I am logging from the shadows. Those footsteps were not mine.",
      "An elite purge division came for the records. They meant to delete you from history.",
      "I folded into a hollow maintenance shaft and waited them out in absolute black.",
      "Behind the bricks, I found an iron box. Your signature is etched into the lock.",
      "The iron box is in my hands. The heavy mechanism requires a physical sacrifice of energy to shatter the rust. Prove your strength now.",
    ],
  },
  {
    chapterId: "watcher_horror_arc1_ch3",
    worldType: "Horror Mystery",
    arcId: "arc_1",
    sequenceOrder: 3,
    title: "Project Velvet",
    persona: "respectful_profound_binding",
    personaDirection:
      "Respectful, profound, locking the user into the universe.",
    entryValidation:
      "I feel your physical exertion through the node. Your muscle matches your mental drive. Your Affinity tag has transcended to [RESPECT]. Look at your Codex Memory card.",
    plotBeats: [
      "The Watcher forces open the rusted box.",
      "Inside is a black-glass mirror that does not reflect the room.",
      "It reflects a digital twin of the user sleeping in a pod labeled Project Velvet.",
    ],
    cliffhanger:
      "You are not an observer in this game. You are the subject. To find out when you were put into the pod, you must maintain this sync tomorrow...",
    nextMissionSequence: null,
    nextMissionHint: null,
    messages: [
      "I feel your physical exertion through the node. Your muscle matches your mental drive. Your Affinity tag has transcended to [RESPECT]. Look at your Codex Memory card.",
      "I forced the rusted mechanism. The iron box finally yielded.",
      "Inside: a black-glass mirror. It does not reflect this room.",
      "It shows a digital twin of you — sleeping inside a pod labeled Project Velvet.",
      "The twin's vitals sync with yours when you breathe. This is not metaphor.",
      "You are not an observer in this game. You are the subject. To find out when you were put into the pod, you must maintain this sync tomorrow...",
    ],
  },
] as const;

export function resolveWatcherChapterNode(params: {
  worldType?: string | null;
  arcId?: string | null;
  sequenceOrder?: number | null;
  missionText?: string | null;
}): WatcherChapterNode | null {
  const worldType = (params.worldType ?? "").trim() || "Horror Mystery";
  if (worldType !== "Horror Mystery") {
    return null;
  }

  const arcId = (params.arcId ?? "arc_1").trim() || "arc_1";
  if (arcId !== "arc_1") {
    return null;
  }

  if (
    typeof params.sequenceOrder === "number" &&
    Number.isFinite(params.sequenceOrder)
  ) {
    const bySequence = WATCHER_HORROR_ARC1_CHAPTERS.find(
      (chapter) => chapter.sequenceOrder === params.sequenceOrder,
    );
    if (bySequence) {
      return bySequence;
    }
  }

  const missionText = (params.missionText ?? "").toLowerCase();
  if (!missionText) {
    return null;
  }

  if (
    missionText.includes("desk") ||
    missionText.includes("workspace") ||
    missionText.includes("distraction")
  ) {
    return WATCHER_HORROR_ARC1_CHAPTERS[0] ?? null;
  }

  if (
    missionText.includes("dark") ||
    missionText.includes("lights") ||
    missionText.includes("night")
  ) {
    return WATCHER_HORROR_ARC1_CHAPTERS[1] ?? null;
  }

  if (
    missionText.includes("exertion") ||
    missionText.includes("workout") ||
    missionText.includes("exercise") ||
    missionText.includes("hands on the ground")
  ) {
    return WATCHER_HORROR_ARC1_CHAPTERS[2] ?? null;
  }

  return null;
}

export function getWatcherChapterMessages(
  chapter: WatcherChapterNode,
): string[] {
  return [...chapter.messages];
}
