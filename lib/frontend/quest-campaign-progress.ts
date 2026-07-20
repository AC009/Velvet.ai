export interface ArcProgressNode {
  storyId: string;
  arcIndex: number;
  progressPercent: number;
  completedMilestones: number;
  targetMilestones: number;
  requiredAffinityPercent: number;
  unlocked: boolean;
}

export interface CampaignProgressResponse {
  activeStoryId: string;
  activeArcIndex: number;
  activeProgressPercent: number;
  syncingActiveNode: boolean;
  arcs: ArcProgressNode[];
}

export async function fetchCampaignProgress(params: {
  userId: string;
  characterId: number;
  worldId: number;
  activeStoryId: string;
  trust: number;
}): Promise<CampaignProgressResponse> {
  const query = new URLSearchParams({
    userId: params.userId,
    characterId: String(params.characterId),
    worldId: String(params.worldId),
    activeStoryId: params.activeStoryId,
    trust: String(params.trust),
  });

  const response = await fetch(`/api/quest/campaign-progress?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      payload?.error ?? `Campaign progress fetch failed (${response.status}).`,
    );
  }

  return (await response.json()) as CampaignProgressResponse;
}
