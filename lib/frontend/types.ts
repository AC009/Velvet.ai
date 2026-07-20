import type { QuestLineId } from "@/lib/frontend/quest-line-matrix";

export type AppPhase = "splash" | "worlds" | "characters" | "chat" | "dashboard";

export type AppTab = "world" | "character" | "memories" | "stories" | "you";

export type AppTheme = "dark" | "light";

export type WorldAccent = "rose" | "amber" | "cyan" | "purple";

export interface StoryWorld {
  id: number;
  name: string;
  icon: string;
  accent: WorldAccent;
  tagline: string;
  description: string;
  imageGradient: string;
  imageOverlay: string;
  /** Real-life RPG quest line when this world is a gamified funnel card */
  questLineId?: QuestLineId;
}

export interface CharacterTheme {
  border: string;
  glow: string;
  text: string;
  buttonGradient: string;
  portraitBackground: string;
  icon: string;
}

export interface MindScannerProfile {
  capturedFacts?: string[];
  subconsciousThought?: string;
}

export interface StoryCharacter {
  id: number;
  worldId: number;
  name: string;
  role: string;
  hook: string;
  quote: string;
  description?: string;
  avatarGradient: string;
  portraitBackground: string;
  portraitImage?: string;
  theme: CharacterTheme;
  initials: string;
  mindScanner?: MindScannerProfile;
}

export interface PlotCard {
  card_id: string;
  title: string;
  teaser: string;
  theme: string;
}

/** Controls the bottom input zone after the greeting plot cards are dismissed. */
export type PlotCardPhase =
  | "cards-visible"   // Plot deck showing — input fully locked
  | "free-play"       // Skip tapped — clean open text input, no A/B
  | "story-hybrid"    // Card selected — A/B options + inline text field
  | "normal";         // Ordinary mid-conversation state

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  plot_cards?: PlotCard[];
}

export interface CliffhangerLockState {
  lockedUntil: string;
  teaser: string;
}

/** @deprecated Demo seed only — OAuth users use session.user.id */
export const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";

export const CLIFFHANGER_TEASER =
  "The truth you uncovered cannot be unspoken. Someone you trust has been listening — and the next chapter begins when the clock runs out.";

export const SPLASH_DURATION_MS = 2000;

export const GREETING_TYPING_DELAY_MS = 1500;
