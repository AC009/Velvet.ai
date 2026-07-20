/** Canonical world theme labels for Groq narrative generation. */
export const WORLD_THEME_NAMES: Record<number, string> = {
  1: "Romance Drama",
  2: "Mafia World",
  3: "Horror Mystery",
  4: "School Drama",
};

export function getWorldThemeName(worldId: number): string {
  return WORLD_THEME_NAMES[worldId] ?? `World ${worldId}`;
}
