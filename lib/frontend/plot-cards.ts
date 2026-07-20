import type { PlotCard } from "@/lib/frontend/types";
import type { ChatInitRequestBody } from "@/lib/types/database";

export async function rerollPlotCards(params: {
  userId: string;
  worldId: number;
  characterId: number;
  excludeCardIds?: string[];
  dialogueBehavior?: ChatInitRequestBody["dialogueBehavior"];
}): Promise<PlotCard[]> {
  const response = await fetch("/api/chat/plot-cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: params.userId,
      worldId: params.worldId,
      characterId: params.characterId,
      excludeCardIds: params.excludeCardIds,
      ...(params.dialogueBehavior ? { dialogueBehavior: params.dialogueBehavior } : {}),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Plot card re-roll failed (${response.status}).`);
  }

  const data = (await response.json()) as { plot_cards: PlotCard[] };
  return data.plot_cards;
}
