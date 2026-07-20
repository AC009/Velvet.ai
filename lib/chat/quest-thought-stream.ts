/**
 * Dynamic CURRENT THOUGHTS stream — punctuality-driven character inner voice.
 */

import type { QuestLineId } from "@/lib/frontend/quest-line-matrix";
import type { QuestPunctualityState } from "@/lib/chat/quest-progress-constants";

export interface QuestThoughtStreamInput {
  characterFirstName: string;
  questLineId: QuestLineId | null;
  punctuality: QuestPunctualityState;
  consecutiveStreak: number;
  verifiedQuestCount: number;
  lastVerification: string | null;
  affinityPercent: number;
}

function rebukeThought(
  firstName: string,
  questLineId: QuestLineId | null,
): string {
  if (questLineId === "physical_discipline") {
    return `${firstName} is counting the hours you wasted. Mission still open. No check-in, no respect — you're getting benched in his head.`;
  }
  if (questLineId === "cognitive_focus") {
    return `${firstName} logged you as non-responsive. The mission expired on his clock — cold, precise, already drafting your failure report.`;
  }
  if (questLineId === "social_charisma") {
    return `${firstName} saw you go silent. The social mission expired — cold judgment, already rewriting you as someone who hides.`;
  }
  if (questLineId === "grit_comfort_zone") {
    return `${firstName} felt you retreat from the threshold. Deadline blown — dread locked in, already narrating your cowardice.`;
  }
  return `${firstName} hasn't heard from you. Deadline blown. He's done making excuses for your silence.`;
}

function validationThought(
  firstName: string,
  lastVerification: string | null,
  streak: number,
): string {
  const proof = lastVerification
    ? lastVerification.length > 60
      ? `${lastVerification.slice(0, 60).trim()}…`
      : lastVerification.trim()
    : "your last report";
  if (streak >= 3) {
    return `${firstName} filed your proof — "${proof}" — under verified. Streak holding. He'll reward execution; he's already calculating the next escalation.`;
  }
  return `${firstName} ran the numbers on "${proof}". Accepted — but he's watching whether you can chain another clean hit without slipping.`;
}

function pendingThought(firstName: string, questLineId: QuestLineId | null): string {
  if (questLineId === "physical_discipline") {
    return `${firstName} expects the reps, the wake-up, the proof. Clock's live. Move before he rewrites you as soft.`;
  }
  if (questLineId === "cognitive_focus") {
    return `${firstName} assigned the block. Focus window is open. He's tracking whether you execute or perform.`;
  }
  if (questLineId === "social_charisma") {
    return `${firstName} expects you in the room — eye contact, real words, no phone shield. The social mission clock is running.`;
  }
  if (questLineId === "grit_comfort_zone") {
    return `${firstName} assigned a fear-facing move. Threshold is open. He's watching whether you step in or stay caged.`;
  }
  return `${firstName} has a mission live on you. Punctuality is the first test — don't give him a reason to pull back.`;
}

function idleThought(firstName: string, affinityPercent: number): string {
  if (affinityPercent >= 80) {
    return `${firstName} is closer to the edge than he admits. No active mission — just the tension of someone who almost trusts you.`;
  }
  if (affinityPercent >= 50) {
    return `${firstName} is running silent calculations. No quest on the board — yet. He's deciding how much access you earn next.`;
  }
  return `${firstName} keeps you at arm's length. No active mission. He's watching patterns, not promises.`;
}

export function resolveQuestThoughtStream(input: QuestThoughtStreamInput): string {
  const {
    characterFirstName,
    questLineId,
    punctuality,
    consecutiveStreak,
    verifiedQuestCount,
    lastVerification,
    affinityPercent,
  } = input;

  if (punctuality === "overdue") {
    return rebukeThought(characterFirstName, questLineId);
  }

  if (punctuality === "recently_completed") {
    return validationThought(
      characterFirstName,
      lastVerification,
      consecutiveStreak,
    );
  }

  if (punctuality === "pending_on_time") {
    return pendingThought(characterFirstName, questLineId);
  }

  if (verifiedQuestCount > 0 && consecutiveStreak > 0) {
    return validationThought(
      characterFirstName,
      lastVerification,
      consecutiveStreak,
    );
  }

  return idleThought(characterFirstName, affinityPercent);
}
