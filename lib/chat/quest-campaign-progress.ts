import { getCharacterStories } from "@/lib/frontend/character-stories";
import { getUserQuestProfile } from "@/lib/chat/rpg-session-store";
import { applyPersistedAffinityBonus } from "@/lib/chat/quest-guard";
import { fetchQuestCompletionMemoryNodes } from "@/lib/chat/vector-memory";

const ARC_MILESTONE_TARGETS = [3, 3, 4] as const;
const ARC_AFFINITY_THRESHOLDS = [0, 65, 80] as const;

export interface ArcProgressNode {
  storyId: string;
  arcIndex: number;
  progressPercent: number;
  completedMilestones: number;
  targetMilestones: number;
  requiredAffinityPercent: number;
  unlocked: boolean;
}

export interface CampaignProgressSnapshot {
  activeStoryId: string;
  activeArcIndex: number;
  activeProgressPercent: number;
  syncingActiveNode: boolean;
  arcs: ArcProgressNode[];
}

function allocateMilestonesByArc(totalVerified: number): number[] {
  let remaining = Math.max(0, totalVerified);
  return ARC_MILESTONE_TARGETS.map((target) => {
    const inArc = Math.min(remaining, target);
    remaining = Math.max(0, remaining - target);
    return inArc;
  });
}

export async function buildCampaignProgressSnapshot(params: {
  userId: string;
  characterId: number;
  worldId: number;
  activeStoryId: string;
  trust: number;
}): Promise<CampaignProgressSnapshot> {
  const profile = await getUserQuestProfile(params.userId);
  const boostedTrust = applyPersistedAffinityBonus(
    { trust: params.trust, tension: 0, intimacy: 0, hostility: 0, affinity: 0 },
    Number(profile?.affinity_trust_bonus ?? 0),
  ).trust;
  const affinityPercent = Math.round(((boostedTrust + 1) / 2) * 100);
  const stories = getCharacterStories(params.characterId);
  const storyOrder = stories.slice(0, 3);
  const verifiedQuestCount = Math.max(
    profile?.verified_quest_count ?? 0,
    Math.max(0, (profile?.mission_index ?? 1) - 1),
  );
  const milestonesByArc = allocateMilestonesByArc(verifiedQuestCount);

  const activeArcIndex = Math.max(
    0,
    storyOrder.findIndex((story) => story.story_id === params.activeStoryId),
  );

  const arcs = storyOrder.map((story, arcIndex) => {
    const completedMilestones = milestonesByArc[arcIndex] ?? 0;
    const targetMilestones = ARC_MILESTONE_TARGETS[arcIndex] ?? 1;
    const progressPercent = Math.round(
      (completedMilestones / targetMilestones) * 100,
    );
    const requiredAffinityPercent = ARC_AFFINITY_THRESHOLDS[arcIndex] ?? 80;

    let unlocked = arcIndex === 0;
    if (arcIndex > 0) {
      const prevCompleted = milestonesByArc[arcIndex - 1] ?? 0;
      const prevTarget = ARC_MILESTONE_TARGETS[arcIndex - 1] ?? 1;
      const prevExactlyComplete = prevCompleted === prevTarget;
      unlocked = prevExactlyComplete && affinityPercent >= requiredAffinityPercent;
    }

    return {
      storyId: story.story_id,
      arcIndex,
      progressPercent,
      completedMilestones,
      targetMilestones,
      requiredAffinityPercent,
      unlocked,
    };
  });

  const activeArc = arcs[activeArcIndex] ?? arcs[0];
  const graphNodes = await fetchQuestCompletionMemoryNodes({
    userId: params.userId,
    worldId: params.worldId,
    characterId: params.characterId,
    limit: 4,
  });

  const hasGraphSignal = graphNodes.some((node) => node.content.length > 0);
  const syncingActiveNode =
    (profile?.quest_status ?? "UNLOCKED") === "PENDING" && hasGraphSignal;

  return {
    activeStoryId: params.activeStoryId,
    activeArcIndex,
    activeProgressPercent: activeArc?.progressPercent ?? 0,
    syncingActiveNode,
    arcs,
  };
}
