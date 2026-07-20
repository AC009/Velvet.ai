export function buildCharacterDeepLink(params: {
  worldId: number;
  characterId: number;
}): string {
  const search = new URLSearchParams({
    tab: "character",
    worldId: String(params.worldId),
    characterId: String(params.characterId),
  });
  return `/?${search.toString()}`;
}

export function parseVelvetDeepLink(rawUrl: string): {
  tab: "character" | null;
  worldId: number | null;
  characterId: number | null;
} {
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "https://velvet.ai";
    const url = new URL(rawUrl, base);
    const tabParam = url.searchParams.get("tab");
    const worldRaw = url.searchParams.get("worldId");
    const characterRaw = url.searchParams.get("characterId");

    return {
      tab: tabParam === "character" ? "character" : null,
      worldId:
        worldRaw !== null && Number.isInteger(Number(worldRaw))
          ? Number(worldRaw)
          : null,
      characterId:
        characterRaw !== null && Number.isInteger(Number(characterRaw))
          ? Number(characterRaw)
          : null,
    };
  } catch {
    return { tab: null, worldId: null, characterId: null };
  }
}
