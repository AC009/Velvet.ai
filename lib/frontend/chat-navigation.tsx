"use client";

import {
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { STORY_WORLDS } from "@/lib/frontend/catalog";
import {
  getCharacterStories,
  type StoryDefinition,
} from "@/lib/frontend/character-stories";
import type {
  AppTab,
  AppTheme,
  ChatMessage,
  StoryCharacter,
} from "@/lib/frontend/types";
import {
  DEEPEST_SIN_AFFINITY_MIN_PERCENT,
  DEEPEST_SIN_VERIFIED_QUEST_MIN,
  SECRETS_UNLOCK_CONSECUTIVE_MILESTONES,
} from "@/lib/chat/quest-progress-constants";
import {
  fetchQuestProgress,
  type QuestProgressResponse,
} from "@/lib/frontend/quest-progress";
import {
  fetchCampaignProgress,
  type CampaignProgressResponse,
} from "@/lib/frontend/quest-campaign-progress";
import { track } from "@/lib/frontend/analytics";
import {
  ShareCard,
  useLatestCodexCard,
} from "@/app/components/ShareCard";

export const SPATIAL_TAB_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
export const SPATIAL_TAB_DURATION_MS = 550;

export const VIEWPORT_SCROLL_TOUCH_STYLE: CSSProperties = {
  WebkitOverflowScrolling: "touch",
};

export const VIEWPORT_SCROLL_CHANNEL_CLASS =
  "flex-1 min-h-0 w-full overflow-y-auto overscroll-contain pb-36 scroll-smooth scrollbar-hide velvet-mobile-scroll";

export const VIEWPORT_SCROLL_CHANNEL_GLASS_CLASS =
  "flex-1 min-h-0 w-full overflow-y-auto overscroll-contain pb-36 scroll-smooth scrollbar-hide velvet-mobile-scroll-glass";

export function ViewportScrollBody({
  children,
  className = "",
  glass = false,
}: {
  children: ReactNode;
  className?: string;
  glass?: boolean;
}): ReactNode {
  return (
    <div
      className={`${glass ? VIEWPORT_SCROLL_CHANNEL_GLASS_CLASS : VIEWPORT_SCROLL_CHANNEL_CLASS} ${className}`.trim()}
      style={VIEWPORT_SCROLL_TOUCH_STYLE}
    >
      {children}
    </div>
  );
}

export function triggerTabHaptic(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([8, 15]);
    } catch {
      /* vibration unsupported */
    }
  }
}

export interface ThemeToggleOrigin {
  x: number;
  y: number;
}

/* -------------------------------------------------------------------------- */
/* Spatial 3D Tab Router Layers                                                */
/* -------------------------------------------------------------------------- */

export function SpatialTabViewport({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="spatial-tab-viewport relative min-h-0 flex-1 overflow-hidden will-change-transform">
      {children}
    </div>
  );
}

export function SpatialTabCharacterLayer({
  currentTab,
  children,
}: {
  currentTab: AppTab;
  children: ReactNode;
}): ReactNode {
  const isFront = currentTab === "character";

  return (
    <div
      className={`spatial-tab-layer spatial-tab-character h-full min-h-0 w-full ${
        isFront ? "spatial-tab-character-front" : "spatial-tab-character-recede"
      }`}
      aria-hidden={!isFront}
    >
      {children}
    </div>
  );
}

export function SpatialTabSurfaceLayer({
  tabId,
  currentTab,
  children,
}: {
  tabId: AppTab;
  currentTab: AppTab;
  children: ReactNode;
}): ReactNode {
  const isActive = currentTab === tabId;

  return (
    <div
      className={`spatial-tab-layer spatial-tab-surface h-full min-h-0 w-full ${
        isActive ? "spatial-tab-surface-active" : "spatial-tab-surface-idle"
      }`}
      aria-hidden={!isActive}
    >
      {children}
    </div>
  );
}


function NavIconSparkle({ active }: { active: boolean }): ReactNode {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l1.4 4.2L17.6 8 13.4 9.4 12 13.6 10.6 9.4 6.4 8l4.2-1.8L12 2zM5 14l.8 2.4L8.2 17l-2.4.8L5 20.2l-.8-2.4L1.8 17l2.4-.6L5 14zm14 0l.8 2.4 2.4.6-2.4.8-.8 2.2-.8-2.2-2.4-.8 2.4-.6.8-2.4z"
        fill={active ? "#b87dff" : "currentColor"}
      />
    </svg>
  );
}

function NavIconUser({ active }: { active: boolean }): ReactNode {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke={active ? "#b87dff" : "currentColor"} strokeWidth="1.5" />
      <path
        d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"
        stroke={active ? "#b87dff" : "currentColor"}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavIconBook({ active }: { active: boolean }): ReactNode {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 4h7a3 3 0 013 3v14a2.5 2.5 0 00-2.5-2.5H5V4zM19 4h-4a3 3 0 00-3 3v14a2.5 2.5 0 012.5-2.5H19V4z"
        stroke={active ? "#b87dff" : "currentColor"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavIconScroll({ active }: { active: boolean }): ReactNode {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H9a2 2 0 01-2-2V4z"
        stroke={active ? "#b87dff" : "currentColor"}
        strokeWidth="1.5"
      />
      <path
        d="M9 8h6M9 12h6M9 16h4"
        stroke={active ? "#b87dff" : "currentColor"}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavIconUserCog({ active }: { active: boolean }): ReactNode {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10" cy="8" r="3" stroke={active ? "#b87dff" : "currentColor"} strokeWidth="1.5" />
      <path
        d="M4 20c0-2.8 2.7-5 6-5M17 14v4M19 16h-4"
        stroke={active ? "#b87dff" : "currentColor"}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Bottom Navigation                                                           */
/* -------------------------------------------------------------------------- */

const TAB_ORDER: AppTab[] = ["world", "character", "memories", "stories", "you"];

export function BottomNavBar({
  currentTab,
  characterFirstName,
  theme,
  onTabChange,
}: {
  currentTab: AppTab;
  characterFirstName: string;
  theme: AppTheme;
  onTabChange: (tab: AppTab) => void;
}): ReactNode {
  const inactiveColor = theme === "dark" ? "text-[#8a8498]" : "text-[#6b7280]";
  const activeColor = "text-[#b87dff]";
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const navTrackRef = useRef<HTMLDivElement | null>(null);
  const [indicatorX, setIndicatorX] = useState(0);

  const tabs: Array<{
    id: AppTab;
    label: string;
    icon: (active: boolean) => ReactNode;
    notify?: boolean;
  }> = [
    { id: "world", label: "World", icon: (a) => <NavIconSparkle active={a} /> },
    {
      id: "character",
      label: characterFirstName,
      icon: (a) => <NavIconUser active={a} />,
    },
    { id: "memories", label: "Memories", icon: (a) => <NavIconBook active={a} /> },
    { id: "stories", label: "Stories", icon: (a) => <NavIconScroll active={a} /> },
    {
      id: "you",
      label: "You",
      icon: (a) => <NavIconUserCog active={a} />,
      notify: true,
    },
  ];

  const updateIndicator = useCallback((): void => {
    const activeIndex = TAB_ORDER.indexOf(currentTab);
    const activeButton = tabRefs.current[activeIndex];
    const track = navTrackRef.current;
    if (!activeButton || !track) {
      return;
    }
    const trackRect = track.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    setIndicatorX(
      buttonRect.left - trackRect.left + buttonRect.width / 2,
    );
  }, [currentTab]);

  useLayoutEffect(() => {
    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  const handleTabPress = (tabId: AppTab): void => {
    if (tabId !== currentTab) {
      triggerTabHaptic();
    }
    onTabChange(tabId);
  };

  return (
    <nav className="absolute bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-t border-white/5 bg-zinc-950/80 px-6 backdrop-blur-md">
      <div
        ref={navTrackRef}
        className="relative flex w-full items-center justify-between"
      >
        <span
          className="nav-golden-indicator pointer-events-none absolute top-0 h-[2px] w-[2px] -translate-x-1/2 bg-[#D4AF37] shadow-[0_0_10px_#D4AF37]"
          style={{
            left: indicatorX,
            transition: `left 500ms ${SPATIAL_TAB_EASE}`,
          }}
          aria-hidden="true"
        />
        <div className="flex w-full items-center justify-between">
          {tabs.map((tab, index) => {
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                onClick={() => handleTabPress(tab.id)}
                className={`relative flex flex-col items-center gap-1 transition-colors duration-300 ${
                  isActive ? activeColor : inactiveColor
                }`}
              >
                <span className="relative flex h-8 w-12 items-center justify-center">
                  {isActive && (
                    <span
                      className="nav-omni-light pointer-events-none absolute inset-0 m-auto h-12 w-12 -translate-y-2 rounded-full bg-gradient-to-b from-[#A855F7]/25 to-transparent blur-md animate-pulse"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-[1]">
                    {tab.icon(isActive)}
                    {tab.notify && (
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                    )}
                  </span>
                </span>
                <span
                  className={`text-[10px] font-medium ${
                    isActive ? "text-shadow-purple-glow" : ""
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Tab Views                                                                   */
/* -------------------------------------------------------------------------- */

const WORLD_EXPLORER_CARD_THEMES: Record<
  number,
  { border: string; shadow: string; shadowHover: string }
> = {
  1: {
    border: "rgba(244, 63, 94, 0.6)",
    shadow: "0 0 15px rgba(244, 63, 94, 0.12)",
    shadowHover: "0 0 15px rgba(244, 63, 94, 0.12), 0 0 28px rgba(244, 63, 94, 0.2)",
  },
  2: {
    border: "rgba(245, 158, 11, 0.6)",
    shadow: "0 0 15px rgba(245, 158, 11, 0.12)",
    shadowHover: "0 0 15px rgba(245, 158, 11, 0.12), 0 0 28px rgba(245, 158, 11, 0.2)",
  },
  3: {
    border: "rgba(34, 211, 238, 0.6)",
    shadow: "0 0 15px rgba(34, 211, 238, 0.12)",
    shadowHover: "0 0 15px rgba(34, 211, 238, 0.12), 0 0 28px rgba(34, 211, 238, 0.2)",
  },
  4: {
    border: "rgba(168, 85, 247, 0.6)",
    shadow: "0 0 15px rgba(168, 85, 247, 0.12)",
    shadowHover: "0 0 15px rgba(168, 85, 247, 0.12), 0 0 28px rgba(168, 85, 247, 0.2)",
  },
};

function getWorldExplorerCardTheme(worldId: number): {
  border: string;
  shadow: string;
  shadowHover: string;
} {
  return WORLD_EXPLORER_CARD_THEMES[worldId] ?? WORLD_EXPLORER_CARD_THEMES[4];
}

export function WorldExplorerTab({
  activeWorldId,
  theme,
  onExploreWorld,
}: {
  activeWorldId: number;
  theme: AppTheme;
  onExploreWorld: (worldId: number) => void;
}): ReactNode {
  const otherWorlds = STORY_WORLDS.filter((world) => world.id !== activeWorldId);
  const bg = theme === "dark" ? "bg-black" : "bg-[#f5f5f7]";
  const text = theme === "dark" ? "text-white" : "text-[#111]";
  const muted = theme === "dark" ? "text-[#8a8498]" : "text-[#6b7280]";

  return (
    <div
      className={`${VIEWPORT_SCROLL_CHANNEL_CLASS} ${bg} px-4 pt-6`}
      style={VIEWPORT_SCROLL_TOUCH_STYLE}
    >
      <h1 className={`font-serif-display text-[22px] ${text}`}>
        The Rest of the Universe
      </h1>
      <p className={`mt-2 text-[13px] ${muted}`}>
        Explore alternate storylines waiting beyond your current chapter.
      </p>
      <div className="mt-6 space-y-4">
        {otherWorlds.map((world) => {
          const cardTheme = getWorldExplorerCardTheme(world.id);

          return (
          <button
            key={world.id}
            type="button"
            onClick={() => onExploreWorld(world.id)}
            className="group w-full overflow-hidden rounded-2xl border border-solid bg-[#12111A]/80 text-left transition-[transform,box-shadow] duration-300 hover:scale-[1.01] hover:[box-shadow:var(--world-card-shadow-hover)]"
            style={{
              borderWidth: 1,
              borderColor: cardTheme.border,
              boxShadow: cardTheme.shadow,
              ["--world-card-shadow-hover" as string]: cardTheme.shadowHover,
            }}
          >
            <div
              className="relative h-28 w-full"
              style={{ background: world.imageGradient }}
            >
              <div
                className="absolute inset-0"
                style={{ background: world.imageOverlay }}
              />
              <span className="absolute bottom-3 left-4 text-2xl">{world.icon}</span>
            </div>
            <div className="px-4 py-3">
              <p className="font-serif-display text-[16px] text-white group-hover:text-[#b87dff]">
                {world.name}
              </p>
              <p className="mt-1 text-[12px] text-[#8a8498]">{world.tagline}</p>
              <p className="mt-2 text-[11px] text-[#D4AF37]/70">
                Begin new storyline →
              </p>
            </div>
          </button>
          );
        })}
      </div>
    </div>
  );
}

function trustToPercent(trust: number): number {
  return Math.round(((trust + 1) / 2) * 100);
}

function resolveDeepestSinNarrative(
  character: StoryCharacter,
  firstName: string,
): string {
  const role = character.role?.trim().toLowerCase() ?? "the one everyone watches";
  return (
    `Beneath the mask of ${role}, ${firstName} has buried a single unforgivable night — ` +
    `a betrayal he engineered to survive, and the one person he broke to do it. ` +
    `Every controlled smile since has been penance, a performance built so no one would ever ` +
    `look close enough to see the wreckage. He was certain that if you learned the truth, you would ` +
    `leave like everyone before you. Tonight, for the first time, he lets you see it anyway.`
  );
}

function resolveRelationshipStatus(
  percent: number,
  trust: number,
  conversationId: number | null,
  hardwareStatusTag?: "TOXIC ATTRACTION" | "RESPECT" | null,
): string {
  if (hardwareStatusTag === "RESPECT") {
    return "RESPECT";
  }
  if (hardwareStatusTag === "TOXIC ATTRACTION") {
    return "TOXIC ATTRACTION";
  }
  if (percent >= 80) {
    return "CONFESSION IMMINENT";
  }
  if (percent >= 60) {
    return "RESPECT";
  }
  if (percent >= 40) {
    const stablePick =
      (conversationId ?? 0) % 2 === 0 || trust >= 0 ? "TOXIC ATTRACTION" : "DANGEROUSLY HOOKED";
    return stablePick;
  }
  return "COLD CALCULUS";
}

function resolveSecretScanLine(
  unlocked: boolean,
  firstName: string,
): string {
  if (unlocked) {
    return `[ LAYER BREACHED // He has no more walls left. ]`;
  }
  return `[ SECURED LAYER // ${firstName}'s Darkest Choice. Reach 80% Affinity in chat to force his confession. ]`;
}

function resolveSecretDisplayLine(
  unlocked: boolean,
  firstName: string,
): string {
  const raw = resolveSecretScanLine(unlocked, firstName);
  return raw
    .replace(/^\[\s*/g, "")
    .replace(/\s*\]$/g, "")
    .replace(/\s*\/\/\s*/g, " — ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Memories Vault Tab — Mind Scanner Vertical Stack                           */
/* -------------------------------------------------------------------------- */

function formatRelationshipStatusLabel(status: string): string {
  return status;
}

function triggerNeuralHaptic(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(12);
    } catch {
      /* vibration unsupported */
    }
  }
}

function DiscoveredSecretsCard({
  discoveredSecrets,
  secretsUnlocked,
  onPress,
}: {
  discoveredSecrets: string[];
  secretsUnlocked: boolean;
  onPress: () => void;
}): ReactNode {
  const hasSecrets = discoveredSecrets.length > 0;

  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full bg-black/60 backdrop-blur-md rounded-2xl p-5 border border-[#FACC15]/30 shadow-[0_0_20px_rgba(250,204,21,0.15)] flex flex-col gap-4 text-left active:scale-[0.97] transition-all duration-150 ease-out"
      aria-label="Discovered secrets"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#FACC15]/40 bg-[#FACC15]/10 text-lg shadow-[0_0_12px_rgba(250,204,21,0.25)]">
          🔑
        </span>
        <span className="text-sm font-black text-[#FACC15] tracking-widest uppercase">
          DISCOVERED SECRETS
        </span>
      </div>
      {!secretsUnlocked ? (
        <p className="text-sm italic text-white/40 leading-relaxed">
          Complete {SECRETS_UNLOCK_CONSECUTIVE_MILESTONES} consecutive real-life
          milestones to unlock discovered secrets.
        </p>
      ) : hasSecrets ? (
        <ul className="list-disc pl-5 flex flex-col gap-2">
          {discoveredSecrets.map((secret, index) => (
            <li
              key={`${secret}-${index}`}
              className="text-base text-white/90 font-semibold leading-relaxed"
            >
              {secret}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm italic text-white/40 leading-relaxed">
          No secrets uncovered in this timeline yet.
        </p>
      )}
    </button>
  );
}

function CurrentThoughtsCard({
  thought,
  onPress,
}: {
  thought: string;
  onPress: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full bg-black/60 backdrop-blur-md rounded-2xl p-5 border border-[#EF4444]/30 shadow-[0_0_25px_rgba(239,68,68,0.2)] flex flex-col gap-4 text-left active:scale-[0.97] transition-all duration-150 ease-out"
      aria-label="Current thoughts"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#EF4444]/40 bg-[#EF4444]/10 text-lg shadow-[0_0_12px_rgba(239,68,68,0.25)]">
          🫀
        </span>
        <span className="text-sm font-black text-[#EF4444] tracking-widest uppercase">
          CURRENT THOUGHTS
        </span>
      </div>
      <p
        className="mind-scanner-ecg-pulse text-center font-mono text-sm tracking-[0.35em] text-[#EF4444]/80"
        aria-hidden="true"
      >
        -v^-v-
      </p>
      <p className="text-lg italic text-[#F87171] font-medium leading-relaxed text-center px-4 py-2 bg-black/30 rounded-xl border border-red-500/10">
        &ldquo;{thought}&rdquo;
      </p>
    </button>
  );
}

function DeepestSinVaultCard({
  unlocked,
  firstName,
  secretLine,
  secretNarrative,
  verifiedQuestCount,
  onPress,
}: {
  unlocked: boolean;
  firstName: string;
  secretLine: string;
  secretNarrative: string;
  verifiedQuestCount: number;
  onPress: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={unlocked ? onPress : undefined}
      disabled={!unlocked}
      aria-disabled={!unlocked}
      className={`mind-scanner-vault-starburst relative w-full bg-black/60 backdrop-blur-md rounded-2xl p-6 border flex flex-col items-center justify-center gap-5 overflow-hidden text-left transition-all duration-150 ease-out ${
        unlocked
          ? "border-[#4ade80]/40 shadow-[0_0_30px_rgba(74,222,128,0.25)] active:scale-[0.97]"
          : "border-[#D4AF37]/40 shadow-[0_0_30px_rgba(212,175,55,0.25)] cursor-not-allowed"
      }`}
      aria-label={unlocked ? "Deepest sin unlocked" : "Deepest sin locked"}
    >
      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="flex flex-col items-center">
          <span className="mb-2 text-xl" aria-hidden="true">
            {unlocked ? "🔓" : "🔒"}
          </span>
          <span
            className={`text-xs font-black tracking-[0.2em] uppercase mb-2 ${
              unlocked ? "text-[#4ade80]" : "text-[#D4AF37]"
            }`}
          >
            {unlocked ? "DEEPEST SIN — DECRYPTED —" : "DEEPEST SIN — LOCKED —"}
          </span>
        </div>

        {!unlocked && (
          <div className="mind-scanner-orbital-lock relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-[#D4AF37]/50">
            <span
              className="absolute inset-2 rounded-full border border-dashed opacity-40"
              style={{ borderColor: "#D4AF37" }}
              aria-hidden="true"
            />
            <span className="text-4xl" aria-hidden="true">
              🔒
            </span>
          </div>
        )}

        {unlocked ? (
          <div className="flex flex-col gap-3 rounded-xl border border-[#4ade80]/15 bg-black/40 px-4 py-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#4ade80]/80">
              {secretLine}
            </p>
            <p className="text-sm font-medium leading-relaxed text-[#dcfce7]/90">
              {secretNarrative}
            </p>
          </div>
        ) : (
          <p className="text-sm font-bold text-white/80 tracking-wide text-center leading-relaxed max-w-[280px]">
            Reach{" "}
            <span className="text-[#FACC15] font-black text-base">
              {DEEPEST_SIN_AFFINITY_MIN_PERCENT}%
            </span>{" "}
            affinity and{" "}
            <span className="text-[#FACC15] font-black text-base">
              {DEEPEST_SIN_VERIFIED_QUEST_MIN}
            </span>{" "}
            verified missions ({verifiedQuestCount}/{DEEPEST_SIN_VERIFIED_QUEST_MIN}) to
            decrypt {firstName}&apos;s past.
          </p>
        )}
      </div>
    </button>
  );
}

interface MemoriesVaultProps {
  character: StoryCharacter;
  trust: number;
  messages: ChatMessage[];
  conversationId: number | null;
  worldId: number;
  activeStoryId: string;
  userId: string | null;
  isTabActive?: boolean;
  progressRefreshNonce?: number;
  hardwareAffinityScore?: number | null;
  hardwareStatusTag?: "TOXIC ATTRACTION" | "RESPECT" | null;
  hardwareArcProgress?: number | null;
}

export function MemoriesVaultTab(props: Partial<MemoriesVaultProps>): ReactNode {
  // State-hydration guard: after an F5 refresh or a rapid character switch the
  // active character can momentarily be undefined. Fall back to a safe shell
  // instead of dereferencing null and crashing the tab.
  if (!props.character) {
    return (
      <div className="bg-[#030208] min-h-screen w-full max-w-lg mx-auto flex flex-col items-center justify-center gap-3 p-8 font-sans">
        <span className="text-2xl" aria-hidden="true">
          🖤
        </span>
        <p className="text-sm italic text-white/40 text-center leading-relaxed">
          Select a character to open their memory vault.
        </p>
      </div>
    );
  }

  return (
    <MemoriesVaultContent
      character={props.character}
      trust={props.trust ?? 0}
      messages={props.messages ?? []}
      conversationId={props.conversationId ?? null}
      worldId={props.worldId ?? 0}
      activeStoryId={props.activeStoryId ?? "default"}
      userId={props.userId ?? null}
      isTabActive={props.isTabActive ?? false}
      progressRefreshNonce={props.progressRefreshNonce ?? 0}
      hardwareAffinityScore={props.hardwareAffinityScore ?? null}
      hardwareStatusTag={props.hardwareStatusTag ?? null}
      hardwareArcProgress={props.hardwareArcProgress ?? null}
    />
  );
}

function MemoriesVaultContent({
  character,
  trust,
  messages,
  conversationId,
  worldId,
  activeStoryId,
  userId,
  isTabActive,
  progressRefreshNonce,
  hardwareAffinityScore = null,
  hardwareStatusTag = null,
  hardwareArcProgress = null,
}: MemoriesVaultProps): ReactNode {
  const firstName = character.name.split(" ")[0] ?? character.name;

  const [progressLoaded, setProgressLoaded] = useState(false);
  const [questProgress, setQuestProgress] = useState<QuestProgressResponse | null>(
    null,
  );

  const clientAffinityPercent = trustToPercent(trust);
  const affinityPercent =
    hardwareAffinityScore != null
      ? Math.round(hardwareAffinityScore)
      : progressLoaded && questProgress?.affinityPercent != null
        ? questProgress.affinityPercent
        : clientAffinityPercent;
  const relationshipStatus = formatRelationshipStatusLabel(
    resolveRelationshipStatus(
      affinityPercent,
      trust,
      conversationId,
      hardwareStatusTag,
    ),
  );

  const defaultThought =
    character.mindScanner?.subconsciousThought ??
    "I can't stop wondering if she really trusts me...";

  useEffect(() => {
    if (!userId || worldId <= 0) {
      setProgressLoaded(true);
      return;
    }

    let cancelled = false;
    let pollTimer: number | undefined;

    const loadProgress = async (): Promise<void> => {
      try {
        const snapshot = await fetchQuestProgress({
          userId,
          characterId: character.id,
          worldId,
          trust,
          characterFirstName: firstName,
        });
        if (!cancelled) {
          setQuestProgress(snapshot);
        }
      } catch {
        if (!cancelled) {
          setQuestProgress(null);
        }
      } finally {
        if (!cancelled) {
          setProgressLoaded(true);
        }
      }
    };

    void loadProgress();

    if (isTabActive) {
      pollTimer = window.setInterval(() => {
        void loadProgress();
      }, 30_000);
    }

    return () => {
      cancelled = true;
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
      }
    };
  }, [
    userId,
    character.id,
    worldId,
    trust,
    firstName,
    isTabActive,
    progressRefreshNonce,
  ]);

  const discoveredSecrets =
    progressLoaded && questProgress?.secretsUnlocked
      ? (questProgress.discoveredSecrets ?? [])
      : [];

  const secretsUnlocked = questProgress?.secretsUnlocked ?? false;

  const subconsciousThought =
    progressLoaded && questProgress?.currentThought
      ? questProgress.currentThought
      : defaultThought;

  const secretUnlocked =
    progressLoaded && (questProgress?.deepestSinUnlocked ?? false);

  const verifiedQuestCount = questProgress?.verifiedQuestCount ?? 0;

  const secretLine = useMemo(
    () => resolveSecretDisplayLine(secretUnlocked, firstName),
    [secretUnlocked, firstName],
  );

  const secretNarrative = useMemo(
    () => resolveDeepestSinNarrative(character, firstName),
    [character, firstName],
  );

  const handleCardPress = useCallback((): void => {
    triggerNeuralHaptic();
  }, []);

  const latestCodex = useLatestCodexCard(userId, progressRefreshNonce);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col bg-[#030208] font-sans">
      <ViewportScrollBody className="p-4">
        <header className="w-full flex flex-col items-center">
          <p className="text-xs font-semibold text-white/70 tracking-[0.2em] text-center mb-1 uppercase">
            RELATIONSHIP WITH {firstName.toUpperCase()}
          </p>
          <p className="text-7xl font-black text-white tracking-tighter text-center drop-shadow-[0_0_35px_rgba(168,85,247,0.45)]">
            {affinityPercent}%
          </p>
          <p className="mind-scanner-status-badge animate-pulse text-xs font-extrabold text-[#A855F7] tracking-[0.15em] text-center uppercase py-1 px-4 border border-[#A855F7]/30 rounded-full mt-2">
            [ 🖤 {relationshipStatus} ]
          </p>
          {hardwareArcProgress != null && (
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#b87dff]/85">
              ARC PROGRESS {Math.round(hardwareArcProgress)}%
            </p>
          )}
        </header>

        <div className="mt-4 flex w-full flex-col items-center gap-4">
          <DiscoveredSecretsCard
            discoveredSecrets={discoveredSecrets}
            secretsUnlocked={secretsUnlocked}
            onPress={handleCardPress}
          />
          <CurrentThoughtsCard thought={subconsciousThought} onPress={handleCardPress} />
          <DeepestSinVaultCard
            unlocked={secretUnlocked}
            firstName={firstName}
            secretLine={secretLine}
            secretNarrative={secretNarrative}
            verifiedQuestCount={verifiedQuestCount}
            onPress={handleCardPress}
          />
          <ShareCard
            affinityPercent={affinityPercent}
            statusTag={relationshipStatus}
            missionTitle={latestCodex.title}
            missionDescription={latestCodex.description}
            arcProgress={hardwareArcProgress}
          />
        </div>
      </ViewportScrollBody>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stories Tab — Clean Vertical Timeline Stack                                 */
/* -------------------------------------------------------------------------- */

function StoryTimelineRow({
  story,
  arcIndex,
  isActive,
  isUnlocked,
  progressPercent,
  syncingActiveNode,
  requiredAffinityPercent,
  themeBorder,
  themeGlow,
  onOpen,
}: {
  story: StoryDefinition;
  arcIndex: number;
  isActive: boolean;
  isUnlocked: boolean;
  progressPercent: number;
  syncingActiveNode: boolean;
  requiredAffinityPercent: number;
  themeBorder: string;
  themeGlow: string;
  onOpen: () => void;
}): ReactNode {
  const arcCapsule = `[ ARC ${String(arcIndex + 1).padStart(2, "0")} ]`;

  return (
    <button
      type="button"
      onClick={isUnlocked ? onOpen : undefined}
      disabled={!isUnlocked}
      aria-disabled={!isUnlocked}
      className={`relative w-full overflow-hidden rounded-2xl p-5 text-left transition-all duration-300 ${
        isUnlocked
          ? "bg-black/60 backdrop-blur-md active:scale-[0.98]"
          : "bg-zinc-950/60 backdrop-blur-md cursor-not-allowed"
      }`}
      style={
        isUnlocked
          ? {
              border: `1px solid ${themeBorder}`,
              boxShadow: `0 0 22px ${themeGlow}`,
            }
          : { border: "1px solid rgba(255,255,255,0.08)" }
      }
      aria-label={`${story.title}${isUnlocked ? " — timeline available" : " — locked"}`}
    >
      {isUnlocked && (
        <span
          className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-3xl"
          style={{ background: themeGlow }}
          aria-hidden="true"
        />
      )}

      <div className="relative z-[1] flex items-start justify-between gap-3">
        <span className="font-mono text-[7.5px] uppercase tracking-[0.18em] text-[#8a8498]/90">
          {arcCapsule}
        </span>
        {!isUnlocked && (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[11px] shadow-[0_0_10px_rgba(212,175,55,0.25)]"
            aria-hidden="true"
          >
            🔒
          </span>
        )}
      </div>

      <h3
        className={`font-serif-display relative z-[1] mt-3 text-[17px] font-semibold uppercase tracking-[0.14em] ${
          isUnlocked
            ? "bg-clip-text text-transparent"
            : "text-white/40"
        }`}
        style={
          isUnlocked
            ? {
                backgroundImage:
                  "linear-gradient(90deg, #ffffff 0%, #E2E1E9 45%, #D4AF37 100%)",
              }
            : undefined
        }
      >
        {story.title}
      </h3>

      <p
        className={`relative z-[1] mt-2 text-[12px] leading-relaxed ${
          isUnlocked ? "text-white/70" : "text-white/35"
        }`}
      >
        &ldquo;{story.tagline}&rdquo;
      </p>

      <div className="relative z-[1] mt-4 border-t border-white/5 pt-3">
        {isUnlocked ? (
          <div className="flex flex-col gap-1">
            <span
              className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em]"
              style={{ color: themeBorder }}
            >
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: themeBorder }}
                aria-hidden="true"
              />
              Current Timeline
            </span>
            <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#6b6280]">
              Progress: {progressPercent}%{" "}
              {isActive && syncingActiveNode ? "| Syncing Active Node..." : ""}
            </span>
          </div>
        ) : (
          <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#6b6280]/80">
            Unlocks when previous arc reaches 100% and Affinity hits{" "}
            {requiredAffinityPercent}%.
          </p>
        )}
      </div>
    </button>
  );
}

export function StoriesTimelineTab({
  character,
  messages,
  lockState,
  activeStoryId,
  userId,
  worldId,
  trust,
  isTabActive = false,
  progressRefreshNonce = 0,
  hardwareArcProgress = null,
  onSwitchStory,
}: {
  character: StoryCharacter;
  messages: ChatMessage[];
  lockState: { lockedUntil: string; teaser: string } | null;
  activeStoryId: string;
  userId: string | null;
  worldId: number;
  trust: number;
  isTabActive?: boolean;
  progressRefreshNonce?: number;
  hardwareArcProgress?: number | null;
  onSwitchStory: (storyId: string) => void;
}): ReactNode {
  const stories = getCharacterStories(character.id);
  const [optimisticStoryId, setOptimisticStoryId] = useState<string | null>(null);
  const [campaignProgress, setCampaignProgress] =
    useState<CampaignProgressResponse | null>(null);
  const [isSyncingCampaign, setIsSyncingCampaign] = useState(false);

  const resolvedActiveId =
    optimisticStoryId !== null && stories.some((s) => s.story_id === optimisticStoryId)
      ? optimisticStoryId
      : activeStoryId;

  useEffect(() => {
    if (optimisticStoryId !== null && optimisticStoryId === activeStoryId) {
      setOptimisticStoryId(null);
    }
  }, [activeStoryId, optimisticStoryId]);

  const hasChatted = messages.length > 0;
  const firstName = character.name.split(" ")[0] ?? character.name;
  const themeBorder = character.theme.border;
  const themeGlow = character.theme.glow;

  const openStory = useCallback(
    (storyId: string): void => {
      track("story_arc_started", { storyId });
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(10);
        } catch {
          /* noop */
        }
      }
      setOptimisticStoryId(storyId);
      onSwitchStory(storyId);
    },
    [onSwitchStory],
  );

  const activeStory =
    stories.find((s) => s.story_id === resolvedActiveId) ?? stories[0];

  useEffect(() => {
    if (!userId || worldId <= 0) {
      setCampaignProgress(null);
      return;
    }

    let cancelled = false;
    let pollTimer: number | undefined;

    const loadCampaign = async (): Promise<void> => {
      setIsSyncingCampaign(true);
      try {
        const snapshot = await fetchCampaignProgress({
          userId,
          characterId: character.id,
          worldId,
          activeStoryId: resolvedActiveId,
          trust,
        });
        if (!cancelled) {
          setCampaignProgress(snapshot);
        }
      } catch {
        if (!cancelled) {
          setCampaignProgress(null);
        }
      } finally {
        if (!cancelled) {
          setIsSyncingCampaign(false);
        }
      }
    };

    void loadCampaign();
    if (isTabActive) {
      pollTimer = window.setInterval(() => {
        void loadCampaign();
      }, 30_000);
    }

    return () => {
      cancelled = true;
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
      }
    };
  }, [
    userId,
    worldId,
    character.id,
    resolvedActiveId,
    trust,
    isTabActive,
    progressRefreshNonce,
  ]);

  const progressByStoryId = useMemo(() => {
    const map = new Map<string, CampaignProgressResponse["arcs"][number]>();
    for (const arc of campaignProgress?.arcs ?? []) {
      map.set(arc.storyId, arc);
    }
    return map;
  }, [campaignProgress]);

  const isRowActive = (storyId: string): boolean =>
    hasChatted && storyId === (activeStory?.story_id ?? resolvedActiveId);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-black">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: [
            "radial-gradient(ellipse 85% 48% at 50% 12%, rgba(91,37,137,0.3) 0%, transparent 68%)",
            "radial-gradient(ellipse 55% 65% at 12% 88%, rgba(41,15,65,0.28) 0%, transparent 55%)",
            "radial-gradient(ellipse 42% 50% at 88% 75%, rgba(61,18,99,0.18) 0%, transparent 52%)",
          ].join(", "),
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(155,89,240,0.5) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(155,89,240,0.5) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "36px 36px",
        }}
        aria-hidden="true"
      />

      <div
        className={`${VIEWPORT_SCROLL_CHANNEL_CLASS} relative z-10 mx-auto max-w-lg px-4 pt-6`}
        style={VIEWPORT_SCROLL_TOUCH_STYLE}
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex w-full items-center gap-3">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#D4AF37]/35 to-transparent" />
            <span className="font-mono text-[8px] uppercase tracking-[0.32em] text-[#D4AF37]/55">
              Narrative Matrix
            </span>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent via-[#D4AF37]/35 to-transparent" />
          </div>

          <h1
            className="font-serif-display mt-3 bg-clip-text text-[22px] font-semibold tracking-[0.14em] text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(90deg, #ffffff 0%, #c4b5fd 45%, #D4AF37 100%)",
            }}
          >
            STORY TIMELINES
          </h1>
        </div>

        {!hasChatted && (
          <div className="mt-6 flex flex-col items-center gap-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/45">
              No Active Timeline
            </p>
            <button
              type="button"
              onClick={() => openStory(activeStory?.story_id ?? stories[0]?.story_id ?? "default")}
              className="story-cta-animated w-full rounded-[12px] px-6 py-4 text-center font-serif-display text-[15px] font-bold uppercase tracking-[0.08em] text-white shadow-[0_0_28px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.98]"
              style={{
                backgroundImage: character.theme.buttonGradient,
                border: `1px solid ${themeBorder}`,
              }}
            >
              Start Story with {firstName} →
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {stories.map((story, index) => {
            const arcProgress = progressByStoryId.get(story.story_id);
            const isUnlocked = hasChatted
              ? (arcProgress?.unlocked ?? index === 0)
              : false;
            const isActiveRow = isRowActive(story.story_id);
            const displayProgress =
              isActiveRow && hardwareArcProgress != null
                ? Math.round(hardwareArcProgress)
                : (arcProgress?.progressPercent ?? 0);

            return (
              <StoryTimelineRow
                key={story.story_id}
                story={story}
                arcIndex={index}
                isActive={isActiveRow}
                isUnlocked={isUnlocked || (isActiveRow && hardwareArcProgress != null && hardwareArcProgress >= 25)}
                progressPercent={displayProgress}
                syncingActiveNode={
                  isSyncingCampaign ||
                  (isActiveRow &&
                    (campaignProgress?.syncingActiveNode ?? false))
                }
                requiredAffinityPercent={arcProgress?.requiredAffinityPercent ?? 65}
                themeBorder={themeBorder}
                themeGlow={themeGlow}
                onOpen={() => openStory(story.story_id)}
              />
            );
          })}
        </div>

        {lockState && (
          <div className="mt-4">
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#D4AF37]/25 bg-[#09070D]/55 px-4 py-3 backdrop-blur-xl">
              <span className="text-sm" role="img" aria-label="Vault lock">
                🔒
              </span>
              <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#D4AF37]/75">
                Vault lock active on current timeline
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LegalOverlay({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose: () => void;
}): ReactNode {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm">
      <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-[#D4AF37]/25 bg-[#12111A] p-6">
        <h2 className="font-serif-display text-[18px] text-white">{title}</h2>
        <p className="mt-4 text-[13px] leading-relaxed text-[#c4c0d0]">{body}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full border border-[#D4AF37]/30 py-2.5 text-[13px] text-[#D4AF37]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

const TERMS_BODY =
  "Velvet.ai provides interactive narrative entertainment. By using this service you agree to our content guidelines, age requirements, and acceptable use policies. AI-generated dialogue and media are fictional and may not reflect real individuals.";

const PRIVACY_BODY =
  "We store conversation transcripts, affinity metrics, and media assets securely in Supabase. Your email is used only for account communications. We do not sell personal data to third parties.";

export function YouProfileTab({
  theme,
  email,
  onSignOut,
  onThemeToggle,
}: {
  theme: AppTheme;
  email: string;
  onSignOut: () => void;
  onThemeToggle: (origin: ThemeToggleOrigin) => void;
}): ReactNode {
  const [legalView, setLegalView] = useState<"terms" | "privacy" | null>(null);
  const isDark = theme === "dark";

  const handleThemePress = (
    event: MouseEvent<HTMLButtonElement>,
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    onThemeToggle({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-black">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: [
            "radial-gradient(ellipse 85% 48% at 50% 12%, rgba(91,37,137,0.3) 0%, transparent 68%)",
            "radial-gradient(ellipse 55% 65% at 12% 88%, rgba(41,15,65,0.28) 0%, transparent 55%)",
          ].join(", "),
        }}
        aria-hidden="true"
      />

      <div
        className={`${VIEWPORT_SCROLL_CHANNEL_CLASS} relative z-10 mx-auto max-w-lg px-4 pt-6`}
        style={VIEWPORT_SCROLL_TOUCH_STYLE}
      >
        {legalView && (
          <LegalOverlay
            title={legalView === "terms" ? "Terms of Service" : "Privacy Policy"}
            body={legalView === "terms" ? TERMS_BODY : PRIVACY_BODY}
            onClose={() => setLegalView(null)}
          />
        )}

        <header className="flex flex-col items-center text-center">
          <div className="flex w-full items-center gap-3">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#D4AF37]/35 to-transparent" />
            <span className="font-mono text-[8px] uppercase tracking-[0.32em] text-[#D4AF37]/55">
              Account Matrix
            </span>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent via-[#D4AF37]/35 to-transparent" />
          </div>
          <h1
            className="font-serif-display mt-3 bg-clip-text text-[22px] font-semibold tracking-[0.14em] text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(90deg, #ffffff 0%, #c4b5fd 45%, #D4AF37 100%)",
            }}
          >
            Preferences Terminal
          </h1>
        </header>

        <div className="mt-6 flex w-full flex-col gap-3">
          <div>
            <label
              htmlFor="profile-email"
              className="mb-2 block font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-white/50"
            >
              Verified Identity
            </label>
            <input
              id="profile-email"
              type="email"
              value={email}
              readOnly
              placeholder="Signed in via OAuth"
              className="w-full rounded-[12px] border border-[#A855F7]/30 bg-zinc-950/50 p-4 font-sans text-[14px] font-bold text-white outline-none backdrop-blur-md shadow-[0_0_18px_rgba(168,85,247,0.12)]"
              style={{ borderWidth: "1px" }}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                try {
                  navigator.vibrate(12);
                } catch {
                  /* unsupported */
                }
              }
              onSignOut();
            }}
            className="w-full rounded-[12px] border border-red-900/30 bg-red-950/10 p-4 text-left font-sans text-[14px] font-bold text-white backdrop-blur-md transition-all duration-200 active:scale-[0.98]"
            style={{ borderWidth: "1px" }}
          >
            Sign Out
          </button>

          <button
            type="button"
            onClick={handleThemePress}
            className="flex w-full items-center justify-between rounded-[12px] border border-white/5 bg-zinc-950/50 p-4 backdrop-blur-md transition-all duration-200 active:scale-[0.98]"
            style={{ borderWidth: "1px" }}
          >
            <span className="font-sans text-[14px] font-bold text-white">
              Theme: {isDark ? "Dark Mode" : "Light Mode"}
            </span>
            <span className="font-sans text-[12px] font-bold text-[#A855F7]">
              Toggle →
            </span>
          </button>

          <button
            type="button"
            onClick={() => setLegalView("terms")}
            className="w-full rounded-[12px] border border-white/5 bg-zinc-950/50 p-4 text-left font-sans text-[14px] font-bold text-white backdrop-blur-md transition-all duration-200 hover:border-white/10 active:scale-[0.98]"
            style={{ borderWidth: "1px" }}
          >
            Terms of Service
          </button>

          <button
            type="button"
            onClick={() => setLegalView("privacy")}
            className="w-full rounded-[12px] border border-white/5 bg-zinc-950/50 p-4 text-left font-sans text-[14px] font-bold text-white backdrop-blur-md transition-all duration-200 hover:border-white/10 active:scale-[0.98]"
            style={{ borderWidth: "1px" }}
          >
            Privacy Policy
          </button>
        </div>
      </div>
    </div>
  );
}