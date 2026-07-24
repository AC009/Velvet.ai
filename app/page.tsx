"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { BookOpen, Eye, Shield, type LucideIcon } from "lucide-react";
import {
  getCharacterById,
  getCharactersForWorld,
  getWorldById,
  STORY_WORLDS,
} from "@/lib/frontend/catalog";
import {
  getCharacterStories,
  getStoryById,
  type StoryDefinition,
} from "@/lib/frontend/character-stories";
import { recordUnlockIntent } from "@/lib/frontend/unlock-intent";
import {
  ChatLockedError,
  formatCountdownParts,
  streamChatCompletion,
} from "@/lib/frontend/chat-stream";
import type {
  AppPhase,
  AppTab,
  AppTheme,
  ChatMessage,
  CliffhangerLockState,
  PlotCard,
  PlotCardPhase,
  StoryCharacter,
  StoryWorld,
  WorldAccent,
} from "@/lib/frontend/types";
import { initializeChatSession } from "@/lib/frontend/chat-init";
import {
  buildStoryPathsForCharacter,
  getBehaviorSystemPrompt,
  type CharacterStoryPath,
} from "@/lib/frontend/character-behavior-profiles";
import { rerollPlotCards } from "@/lib/frontend/plot-cards";
import {
  clearPersistedNavigationState,
  readPersistedNavigationState,
  validatePersistedNavigationState,
  writePersistedNavigationState,
} from "@/lib/frontend/navigation-persistence";
import {
  appendSavedMemoryNote,
  readDialogueBehavior,
  readLastSeenAt,
  recordDialogueChoice,
  writeLastSeenAt,
} from "@/lib/frontend/relationship-persistence";
import {
  BottomNavBar,
  MemoriesVaultTab,
  SpatialTabCharacterLayer,
  SpatialTabSurfaceLayer,
  SpatialTabViewport,
  StoriesTimelineTab,
  WorldExplorerTab,
  YouProfileTab,
  ViewportScrollBody,
  VIEWPORT_SCROLL_CHANNEL_CLASS,
  VIEWPORT_SCROLL_CHANNEL_GLASS_CLASS,
  VIEWPORT_SCROLL_TOUCH_STYLE,
  type ThemeToggleOrigin,
} from "@/lib/frontend/chat-navigation";
import {
  attachPushNavigationListener,
  parseVelvetDeepLink,
  registerPhantomPush,
} from "@/lib/frontend/push-register";
import { useVelvetAuth } from "@/lib/frontend/use-velvet-auth";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { track } from "@/lib/frontend/analytics";
import { recruitQuestmaster } from "@/lib/frontend/quest-recruitment";
import {
  fetchQuestSession,
  submitQuestCompletion,
  type QuestSessionResponse,
} from "@/lib/frontend/quest-session";
import type { QuestStatus } from "@/lib/chat/rpg-session-store";
import {
  buildQuestLineStoryId,
  getQuestLineDefinition,
  parseQuestLineStoryId,
  readActiveQuestLineId,
  writeActiveQuestLineId,
  type QuestLineId,
} from "@/lib/frontend/quest-line-matrix";
import {
  MissionGate,
  type MissionGateSuccessPayload,
} from "@/app/components/MissionGate";
import type { HardwareStatusTag } from "@/lib/frontend/verify-mission";
import {
  DEFAULT_VALIDATION_OPENER,
  getHardwareMissionByIndex,
  getNextHardwareMissionIndex,
  rollCliffhangerThreshold,
  type HardwareMission,
  type HardwareSensorKind,
} from "@/lib/frontend/hardware-mission-pool";
import {
  RECOVERY_SYNC_MISSION,
  isLowEnergy,
  type EnergyLevel,
} from "@/lib/empathy/engine";
import { submitEmpathyCheckIn } from "@/lib/frontend/empathy-client";
import {
  fetchNextPoolMission,
  generateStoryNode,
} from "@/lib/frontend/content-engine";

const SIGN_OUT_TRANSITION_MS = 600;

/** Questmaster recruitment CTA — shared across character selection tiles. */
const QUESTMASTER_RECRUIT_CTA = "CHOOSE QUESTMASTER →";

const LAUNCH_SPLASH_ANIM_MS = 1500;
const LAUNCH_SPLASH_HOLD_MS = 600;
const LAUNCH_SPLASH_FADEOUT_MS = 600;
const LAUNCH_SPLASH_TOTAL_MS =
  LAUNCH_SPLASH_ANIM_MS + LAUNCH_SPLASH_HOLD_MS + LAUNCH_SPLASH_FADEOUT_MS;

type LaunchStage = "splash-logo" | "login-gate" | "dashboard";

/** lobby = 4 genre tiles → characters = character list for selected genre → stories = story arcs → chat */
type DashboardView = "lobby" | "characters" | "stories" | "chat";

import type { ChatInitMessage } from "@/lib/types/database";
import {
  CLIFFHANGER_TEASER,
  GREETING_TYPING_DELAY_MS,
} from "@/lib/frontend/types";

/* -------------------------------------------------------------------------- */
/* Accent design tokens (match wireframe neon palette)                         */
/* -------------------------------------------------------------------------- */

interface AccentStyle {
  border: string;
  glow: string;
  text: string;
  badge: string;
  ring: string;
}

const ACCENT_STYLES: Record<WorldAccent, AccentStyle> = {
  rose: {
    border: "#ff4d6d",
    glow: "rgba(255, 77, 109, 0.55)",
    text: "#ff6b8a",
    badge: "#e8476a",
    ring: "rgba(232, 71, 106, 0.35)",
  },
  amber: {
    border: "#ffb830",
    glow: "rgba(255, 184, 48, 0.5)",
    text: "#d4a030",
    badge: "#c9922a",
    ring: "rgba(212, 160, 48, 0.35)",
  },
  cyan: {
    border: "#5cefff",
    glow: "rgba(92, 239, 255, 0.45)",
    text: "#00d4ff",
    badge: "#1ab8d4",
    ring: "rgba(0, 212, 255, 0.35)",
  },
  purple: {
    border: "#b87dff",
    glow: "rgba(184, 125, 255, 0.5)",
    text: "#9b59f0",
    badge: "#8b4fd4",
    ring: "rgba(155, 89, 240, 0.35)",
  },
};

interface WorldPortalTheme {
  border: string;
  aura: string;
  neonText: string;
  badgeColor: string;
  pulseColor: string;
  glowShadow: string;
  glowShadowSelected: string;
}

const WORLD_PORTAL_THEMES: Record<number, WorldPortalTheme> = {
  1: {
    border: "rgba(244, 63, 94, 0.6)",
    aura: "rgba(244, 63, 94, 0.22)",
    neonText: "#FB7185",
    badgeColor: "#F43F5E",
    pulseColor: "rgba(244, 63, 94, 0.4)",
    glowShadow: "0 0 15px rgba(244, 63, 94, 0.12)",
    glowShadowSelected:
      "0 0 15px rgba(244, 63, 94, 0.12), 0 0 28px rgba(244, 63, 94, 0.22)",
  },
  2: {
    border: "rgba(245, 158, 11, 0.6)",
    aura: "rgba(245, 158, 11, 0.2)",
    neonText: "#FDE047",
    badgeColor: "#F59E0B",
    pulseColor: "rgba(245, 158, 11, 0.38)",
    glowShadow: "0 0 15px rgba(245, 158, 11, 0.12)",
    glowShadowSelected:
      "0 0 15px rgba(245, 158, 11, 0.12), 0 0 28px rgba(245, 158, 11, 0.22)",
  },
  3: {
    border: "rgba(34, 211, 238, 0.6)",
    aura: "rgba(34, 211, 238, 0.18)",
    neonText: "#22D3EE",
    badgeColor: "#06B6D4",
    pulseColor: "rgba(34, 211, 238, 0.38)",
    glowShadow: "0 0 15px rgba(34, 211, 238, 0.12)",
    glowShadowSelected:
      "0 0 15px rgba(34, 211, 238, 0.12), 0 0 28px rgba(34, 211, 238, 0.22)",
  },
  4: {
    border: "rgba(168, 85, 247, 0.6)",
    aura: "rgba(168, 85, 247, 0.22)",
    neonText: "#A78BFA",
    badgeColor: "#8B5CF6",
    pulseColor: "rgba(168, 85, 247, 0.4)",
    glowShadow: "0 0 15px rgba(168, 85, 247, 0.12)",
    glowShadowSelected:
      "0 0 15px rgba(168, 85, 247, 0.12), 0 0 28px rgba(168, 85, 247, 0.22)",
  },
};

function getWorldPortalTheme(world: StoryWorld): WorldPortalTheme {
  return WORLD_PORTAL_THEMES[world.id] ?? WORLD_PORTAL_THEMES[4];
}

function softenThemeGlow(glow: string, opacity = 0.14): string {
  return glow.replace(/rgba?\([^)]+\)/, (match) => {
    const nums = match.match(/[\d.]+/g);
    if (!nums || nums.length < 3) {
      return match;
    }
    return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${opacity})`;
  });
}

function createMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function triggerHapticFeedback(durationMs = 12): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(durationMs);
    } catch {
      /* vibration unsupported */
    }
  }
}

interface FloatingReactionToken {
  id: string;
  emoji: string;
  leftPct: number;
  rotateDeg: number;
}

const CHARACTER_REACTION_TOKENS: Record<string, readonly string[]> = {
  "Lucien Vale":   ["❤️", "✨", "🔥", "💜", "✨"],
  "Kael Veyr":     ["⚡", "🔥", "✨", "💥", "🔥"],
  "Ayame Noctis":  ["🌙", "✨", "💜", "🌸", "✨"],
  "Dante Ward":    ["🖤", "✨", "🔥", "💫", "❤️"],
  "Vittorio":      ["🔫", "💛", "✨", "🔥", "💛"],
  "Serafina":      ["🌹", "✨", "💛", "🔥", "🌹"],
  "Dr. Ashford":   ["👻", "✨", "🔵", "💫", "👻"],
  "The Watcher":   ["👁️", "✨", "🔵", "💫", "👁️"],
  "Zoe":           ["💜", "✨", "🔥", "🎓", "💜"],
  "Liam":          ["✦", "✨", "💜", "🔥", "✦"],
};

const DEFAULT_REACTION_TOKENS: readonly string[] = ["+10", "✨", "🔥", "❤️", "✨"];

const RAIN_STREAK_SEEDS = Array.from({ length: 28 }, (_, index) => ({
  id: index,
  left: `${(index * 3.7 + 4) % 96}%`,
  delay: `${(index * 0.31) % 2.4}s`,
  duration: `${1.8 + (index % 5) * 0.35}s`,
}));

function mapStoredMessage(message: ChatInitMessage): ChatMessage {
  return {
    id: `db-${message.id}`,
    role: message.role,
    content: message.content,
    ...(message.plot_cards && message.plot_cards.length > 0
      ? { plot_cards: message.plot_cards }
      : {}),
  };
}

const WORLD_SCENE_BACKGROUNDS: Record<number, string> = {
  1: `
    radial-gradient(ellipse 90% 70% at 50% 30%, rgba(91,37,137,0.55) 0%, transparent 55%),
    radial-gradient(ellipse 60% 50% at 80% 80%, rgba(155,89,240,0.2) 0%, transparent 50%),
    radial-gradient(ellipse 50% 40% at 15% 70%, rgba(232,71,106,0.12) 0%, transparent 45%),
    linear-gradient(180deg, rgba(18,8,28,0.95) 0%, rgba(6,4,12,1) 100%)
  `,
  2: `
    radial-gradient(ellipse 70% 50% at 30% 20%, rgba(255,184,48,0.25) 0%, transparent 55%),
    linear-gradient(180deg, rgba(12,8,4,0.95) 0%, rgba(4,4,6,1) 100%)
  `,
  3: `
    radial-gradient(ellipse 65% 45% at 60% 10%, rgba(92,239,255,0.22) 0%, transparent 50%),
    linear-gradient(180deg, rgba(4,16,22,0.95) 0%, rgba(2,6,10,1) 100%)
  `,
  4: `
    radial-gradient(ellipse 70% 50% at 40% 15%, rgba(184,125,255,0.25) 0%, transparent 55%),
    linear-gradient(180deg, rgba(12,6,20,0.95) 0%, rgba(4,2,10,1) 100%)
  `,
};

function getWorldSceneBackground(worldId: number): string {
  return WORLD_SCENE_BACKGROUNDS[worldId] ?? WORLD_SCENE_BACKGROUNDS[1];
}

function TechChassisCharacter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <div className={`tech-chassis-wrap max-w-[300px] w-full ${className}`}>
      <div className="tech-chassis-inner">{children}</div>
    </div>
  );
}

function TechChassisUser({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <div className="user-chassis-gradient max-w-[82%] px-4 py-3">
      {children}
    </div>
  );
}

function formatBubbleTime(messageId: string): string {
  const seed = messageId
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hour = 8 + (seed % 12);
  const minute = seed % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function MessageTimestamp({
  messageId,
  align,
}: {
  messageId: string;
  align: "left" | "right";
}): ReactNode {
  return (
    <div
      className={`mt-1 flex items-center gap-1 text-[10px] text-[#6b6280] ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
    >
      <span>{formatBubbleTime(messageId)}</span>
    </div>
  );
}

function RainParticleMatrix(): ReactNode {
  return (
    <div
      className="rain-particle-matrix pointer-events-none absolute inset-0 z-[2]"
      aria-hidden="true"
    >
      {RAIN_STREAK_SEEDS.map((streak) => (
        <span
          key={streak.id}
          className="rain-streak"
          style={{
            left: streak.left,
            animationDelay: streak.delay,
            animationDuration: streak.duration,
          }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Character fallback memory logs                                              */
/* -------------------------------------------------------------------------- */

const CHARACTER_FALLBACK_LOGS: Record<string, readonly string[]> = {
  "Lucien Vale": [
    "Fact: You stepped into his penthouse uninvited.",
    "Observation: High baseline physiological curiosity detected.",
    "Threat Matrix: Identity unverified — trust vector unstable.",
  ],
  "Kael Veyr": [
    "Fact: First contact initiated under volatile conditions.",
    "Observation: Subject exhibits chaotic attachment patterns.",
    "Warning: Emotional volatility index above safe threshold.",
  ],
  "Ayame Noctis": [
    "Fact: Approach vector logged — subject maintains distance.",
    "Observation: Emotional shielding protocol active.",
    "Signal: Rare vulnerability window — handle with precision.",
  ],
  "Dante Ward": [
    "Fact: You entered his tactical perimeter.",
    "Observation: Subject processes threat data before responding.",
    "Note: Protective instinct engaged — loyalty vector rising.",
  ],
  "Vittorio": [
    "Fact: You were granted access to inner circle territory.",
    "Observation: Loyalty score under continuous evaluation.",
    "Warning: Betrayal detection algorithms fully operational.",
  ],
  "Serafina": [
    "Fact: She catalogued your identity within 4 seconds of contact.",
    "Observation: Every disclosure you make is logged and priced.",
    "Directive: Assume all statements are being cross-referenced.",
  ],
  "Dr. Ashford": [
    "Fact: You appeared in his archive records before meeting.",
    "Observation: Clinical curiosity active — you are a specimen.",
    "Warning: His knowledge of you exceeds what you have shared.",
  ],
  "The Watcher": [
    "Fact: It observed you before the first word was spoken.",
    "Observation: Presence acknowledgment logged in the void.",
    "Warning: It does not forget. It does not sleep.",
  ],
  "Zoe": [
    "Fact: You entered her social hierarchy without invitation.",
    "Observation: Approval metrics are being quietly calculated.",
    "Signal: Vulnerability detected beneath dominant exterior.",
  ],
  "Liam": [
    "Fact: He recognised something familiar in you immediately.",
    "Observation: Genuine curiosity — this one is not performing.",
    "Note: He already knows how this ends.",
  ],
};

function getCharacterFallbackLogs(characterName: string): string[] {
  const logs = CHARACTER_FALLBACK_LOGS[characterName];
  if (logs) {
    return [...logs];
  }
  return [
    `Fact: First contact with ${characterName.split(" ")[0]} recorded.`,
    "Observation: Relationship vector initialising.",
    "Status: Memory graph populating — continue the story.",
  ];
}

/* -------------------------------------------------------------------------- */
/* Typewriter scanner row                                                      */
/* -------------------------------------------------------------------------- */

function TypewriterMemoryRow({
  text,
  startMs,
  onDone,
}: {
  text: string;
  startMs: number;
  onDone?: () => void;
}): ReactNode {
  const [rendered, setRendered] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false;
    setRendered("");

    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      let index = 0;
      intervalId = window.setInterval(() => {
        index += 1;
        setRendered(text.slice(0, index));
        if (index >= text.length) {
          window.clearInterval(intervalId);
          intervalId = undefined;
          if (!doneRef.current) {
            doneRef.current = true;
            onDone?.();
          }
        }
      }, 15);
    }, startMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [text, startMs, onDone]);

  const isComplete = rendered.length >= text.length;

  return (
    <div className="flex items-start gap-3">
      <span className="mt-[3px] shrink-0 text-[#D4AF37]/50 text-[10px]">›</span>
      <p className="font-mono text-[12px] leading-relaxed text-white/80">
        {rendered}
        {!isComplete && (
          <span
            className="ml-[2px] inline-block w-[2px] h-[14px] align-middle bg-[#D4AF37] animate-pulse"
            aria-hidden="true"
          />
        )}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Memory vault shell                                                          */
/* -------------------------------------------------------------------------- */

function MemoryScannerSheet({
  character,
  trust,
  messages,
  isOpen,
  onClose,
}: {
  character: StoryCharacter;
  trust: number;
  messages: ChatMessage[];
  isOpen: boolean;
  onClose: () => void;
}): ReactNode {
  const overlayRef = useRef<HTMLDivElement>(null);
  const affinityPercent = trustToAffinityPercent(trust);

  const userLines = messages
    .filter((m) => m.role === "user" && m.content.trim().length > 0)
    .slice(-3)
    .map((m) => `You said: "${m.content.slice(0, 68)}${m.content.length > 68 ? "…" : ""}"`);

  const logEntries: string[] =
    userLines.length > 0
      ? userLines
      : getCharacterFallbackLogs(character.name);

  // Stagger each line: row N starts after all previous rows finish typing
  // (avg chars * 15ms) + 80ms gap
  const startOffsets = logEntries.reduce<number[]>((acc, entry, i) => {
    if (i === 0) {
      return [0];
    }
    const prevStart = acc[i - 1];
    const prevDuration = logEntries[i - 1].length * 15;
    return [...acc, prevStart + prevDuration + 80];
  }, []);

  // Click-outside-to-close
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handler = (event: MouseEvent): void => {
      if (
        overlayRef.current &&
        !overlayRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    const timeoutId = window.setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 50);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handler);
    };
  }, [isOpen, onClose]);

  return (
    <div
      ref={overlayRef}
      className={`relative z-40 overflow-hidden border-b border-[#D4AF37]/25 bg-[#08070D]/94 px-6 py-5 shadow-[0_25px_50px_rgba(0,0,0,0.95)] backdrop-blur-3xl transition-all duration-500`}
      style={{
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        maxHeight: isOpen ? "480px" : "0px",
        opacity: isOpen ? 1 : 0,
        paddingTop: isOpen ? undefined : "0px",
        paddingBottom: isOpen ? undefined : "0px",
        pointerEvents: isOpen ? "auto" : "none",
      }}
      aria-hidden={!isOpen}
    >
      {/* ── Section A: Tactical readout bar ── */}
      <div className="flex items-center justify-between border-b border-[#D4AF37]/15 pb-3">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D4AF37]/70">
            Core Relationship Intelligence
          </p>
          <span className="animate-pulse rounded-sm border border-[#D4AF37]/30 bg-[#D4AF37]/5 px-2 py-0.5 text-[10px] tracking-widest text-[#D4AF37]">
            SYNCED
          </span>
        </div>
        <div className="flex items-center gap-3">
          <p className="font-mono text-[13px] font-bold text-[#D4AF37]">
            AFFINITY: {affinityPercent}%
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-[#D4AF37]/20 text-[12px] text-[#8a8498] transition-colors hover:border-[#D4AF37]/50 hover:text-white"
            aria-label="Close memory vault"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Section B: Kinetic log stream ── */}
      {isOpen && (
        <div className="space-y-3 pt-4">
          <p className="text-[9px] uppercase tracking-[0.28em] text-[#9b59f0]/60">
            {`// memory_graph.query(character="${character.name.split(" ")[0]}")`}
          </p>
          {logEntries.map((entry, index) => (
            <TypewriterMemoryRow
              key={`${entry.slice(0, 20)}-${index}`}
              text={entry}
              startMs={startOffsets[index]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MemorySystemNode(): ReactNode {
  return (
    <div className="memory-system-node relative z-[4] mx-4 mb-3 mt-2 overflow-hidden rounded-lg py-2.5">
      <span className="memory-radar-beam" aria-hidden="true" />
      <div className="relative flex items-center justify-center gap-2 px-3">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#9b59f0]/30" />
        <p className="shrink-0 text-center text-[11px] text-[#b87dff]/80">
          ✨ He remembers previous conversations.
        </p>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#9b59f0]/30" />
      </div>
    </div>
  );
}

function UtilityHub({
  disabled,
  characterName,
  reactionModifiers,
  onReactModifier,
  onReactBoost,
  memoryActive,
  memorySaved,
  onMemoryNote,
  onContinueTopic,
  onStoryMode,
}: {
  disabled: boolean;
  characterName: string;
  reactionModifiers: ReactionModifier[];
  onReactModifier: (modifier: ReactionModifier) => void;
  onReactBoost: () => void;
  memoryActive: boolean;
  memorySaved: boolean;
  onMemoryNote: () => void;
  onContinueTopic: () => void;
  onStoryMode: () => void;
}): ReactNode {
  const [springPhase, setSpringPhase] = useState<"idle" | "compress" | "snap">("idle");
  const [floatTokens, setFloatTokens] = useState<FloatingReactionToken[]>([]);
  const [showReactPopup, setShowReactPopup] = useState(false);

  const spawnReactionBurst = (): void => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([10, 15]);
      } catch {
        /* vibration unsupported */
      }
    }

    setSpringPhase("compress");
    window.setTimeout(() => setSpringPhase("snap"), 80);
    window.setTimeout(() => setSpringPhase("idle"), 200);

    const tokens =
      CHARACTER_REACTION_TOKENS[characterName] ?? DEFAULT_REACTION_TOKENS;
    const spawned: FloatingReactionToken[] = tokens.map((emoji, index) => ({
      id: `${Date.now()}-${index}`,
      emoji,
      leftPct: 25 + Math.random() * 50,
      rotateDeg: (Math.random() - 0.5) * 28,
    }));
    setFloatTokens(spawned);
    window.setTimeout(() => setFloatTokens([]), 930);
  };

  const handleReactClick = (): void => {
    if (disabled) {
      return;
    }
    track("chat_action_clicked", { actionType: "react" });
    setShowReactPopup((previous) => !previous);
  };

  const handleModifierSelect = (modifier: ReactionModifier): void => {
    spawnReactionBurst();
    onReactBoost();
    onReactModifier(modifier);
    setShowReactPopup(false);
  };

  const springClass =
    springPhase === "compress"
      ? "scale-90"
      : springPhase === "snap"
        ? "scale-105"
        : "scale-100";

  const pills = [
    {
      key: "react",
      icon: "❤️",
      label: "React",
      action: handleReactClick,
      isReact: true,
      extraClass: showReactPopup ? "border-[#b87dff]/60 text-white" : "",
    },
    {
      key: "memory",
      icon: "🧠",
      label: "Memory Note",
      action: () => {
        track("chat_action_clicked", { actionType: "memory" });
        onMemoryNote();
      },
      isReact: false,
      extraClass: memoryActive
        ? "memory-hook-glow border-[#9b59f0]/60 text-[#d9bcff]"
        : "",
    },
    {
      key: "continue",
      icon: "🔄",
      label: "Continue Topic",
      action: onContinueTopic,
      isReact: false,
      extraClass: "",
    },
    {
      key: "story",
      icon: "🎬",
      label: "Story Mode",
      action: () => {
        track("chat_action_clicked", { actionType: "story" });
        onStoryMode();
      },
      isReact: false,
      extraClass: "",
    },
  ] as const;

  return (
    <div className="relative">
      {showReactPopup && (
        <div className="absolute bottom-full left-0 z-[60] mb-2">
          <ReactModifierPopup
            modifiers={reactionModifiers}
            onSelect={handleModifierSelect}
          />
        </div>
      )}

      <div className="relative mb-3 flex gap-2 overflow-x-auto scrollbar-hide">
        {/* Particle burst — rendered above the input zone */}
        {floatTokens.map((token) => (
          <span
            key={token.id}
            className="pointer-events-none absolute z-50 select-none text-base"
            style={{
              left: `${token.leftPct}%`,
              bottom: "100%",
              transform: `rotate(${token.rotateDeg}deg)`,
              animation: "reactParticleBurst 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
            }}
            aria-hidden="true"
          >
            {token.emoji}
          </span>
        ))}

        {pills.map((pill) => (
          <button
            key={pill.key}
            type="button"
            disabled={disabled}
            onClick={pill.action}
            className={`utility-pill relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] text-white/70 hover:border-[#D4AF37]/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 ${pill.extraClass} ${
              pill.isReact
                ? `${springClass} transition-transform duration-200`
                : ""
            }`}
            style={
              pill.isReact
                ? { transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 1.275)" }
                : undefined
            }
          >
            <span>{pill.icon}</span>
            <span>{pill.label}</span>
            {pill.key === "memory" && memorySaved && (
              <span className="ml-0.5 text-[11px] text-[#4ade80]" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Plot Card Deck — Tinder-swipe destiny selector                             */
/* -------------------------------------------------------------------------- */

const THEME_ACCENT_COLORS: Record<string, string> = {
  thriller: "#e8476a",
  romance: "#b87dff",
  betrayal: "#D4AF37",
  power: "#ffb830",
  revenge: "#ff4d6d",
  obsession: "#c084fc",
  escape: "#00d4ff",
  mystery: "#9b59f0",
};

function PlotCardItem({
  card,
  onSelect,
}: {
  card: PlotCard;
  onSelect: (card: PlotCard) => void;
}): ReactNode {
  const [pressed, setPressed] = useState(false);
  const accentColor = THEME_ACCENT_COLORS[card.theme] ?? "#D4AF37";

  const handleSelect = (): void => {
    setPressed(true);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(15); } catch { /* noop */ }
    }
    window.setTimeout(() => setPressed(false), 200);
    onSelect(card);
  };

  return (
    <div
      className="relative shrink-0 w-[220px] snap-center overflow-hidden rounded-2xl border bg-[#0D0B12]/95 p-4 flex flex-col gap-3"
      style={{
        borderColor: `${accentColor}4D`,
        boxShadow: `0 0 18px rgba(0,0,0,0.7), inset 0 0 28px rgba(0,0,0,0.5)`,
        transform: pressed ? "scale(0.96)" : "scale(1)",
        transition: "transform 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      }}
    >
      <span
        className="self-start rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em]"
        style={{ background: `${accentColor}20`, color: accentColor }}
      >
        {card.theme}
      </span>

      <div className="flex-1">
        <p className="font-serif-display text-[16px] font-semibold leading-snug text-white">
          {card.title}
        </p>
        <p className="mt-2 text-[12px] italic leading-snug text-[#D4AF37]/75">
          &ldquo;{card.teaser}&rdquo;
        </p>
      </div>

      <button
        type="button"
        onClick={handleSelect}
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-semibold text-black transition-opacity hover:opacity-90"
        style={{ background: accentColor }}
        aria-label={`Choose timeline: ${card.title}`}
      >
        Choose this path
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

function PlotCardDeck({
  cards,
  onSelect,
  onSkip,
  onReroll,
  isRerolling = false,
}: {
  cards: PlotCard[];
  onSelect: (card: PlotCard) => void;
  onSkip: () => void;
  onReroll: () => void;
  isRerolling?: boolean;
}): ReactNode {
  const handleReroll = (): void => {
    triggerHapticFeedback(18);
    onReroll();
  };

  return (
    <div className="kinetic-enter mt-3 w-full">
      <p className="mb-2 text-[9px] uppercase tracking-[0.26em] text-[#D4AF37]/50">
        ✦ Choose your destiny
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
        {cards.map((card) => (
          <PlotCardItem key={card.card_id} card={card} onSelect={onSelect} />
        ))}
        <button
          type="button"
          onClick={handleReroll}
          disabled={isRerolling}
          className="relative shrink-0 w-[180px] snap-center overflow-hidden rounded-2xl border border-[#D4AF37]/35 bg-gradient-to-br from-[#1a1508] to-[#0D0B12]/95 p-4 flex flex-col items-center justify-center gap-3 disabled:cursor-wait disabled:opacity-60"
          style={{
            boxShadow: "0 0 22px rgba(212,175,55,0.15), inset 0 0 24px rgba(0,0,0,0.5)",
          }}
          aria-label="Re-roll timelines"
        >
          <span className="text-2xl" aria-hidden="true">
            {isRerolling ? "⏳" : "🔄"}
          </span>
          <span className="font-serif-display text-center text-[14px] font-semibold leading-snug text-[#D4AF37]">
            {isRerolling ? "Rewriting fates..." : "Re-roll Timelines"}
          </span>
          <span className="text-center text-[10px] leading-snug text-[#D4AF37]/50">
            {isRerolling ? "Groq is generating new paths" : "3 fresh narrative branches"}
          </span>
        </button>
      </div>
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={onSkip}
          disabled={isRerolling}
          className="text-[11px] tracking-wider text-purple-300/60 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          ✦ Skip to Free Roleplay ✦
        </button>
      </div>
    </div>
  );
}

function GoldDiamond(): ReactNode {
  return (
    <div className="my-3 flex items-center justify-center gap-3">
      <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#d4af37]/60" />
      <span className="text-[10px] text-[#d4af37]">◆</span>
      <span className="h-px w-16 bg-gradient-to-l from-transparent to-[#d4af37]/60" />
    </div>
  );
}

function CheckmarkBadge({
  color,
  glowColor,
}: {
  color: string;
  glowColor?: string;
}): ReactNode {
  const glow = glowColor ?? color;
  return (
    <div
      className="absolute right-2.5 top-2.5 z-20 flex h-6 w-6 items-center justify-center rounded-full"
      style={{
        backgroundColor: color,
        boxShadow: `0 0 12px ${glow}, 0 0 24px ${glow}66`,
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2.5 6L5 8.5L9.5 3.5"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cinematic cosmos canvas (splash + login gate)                              */
/* -------------------------------------------------------------------------- */

function CinematicCosmosCanvas({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <div className={`relative flex flex-col overflow-hidden bg-[#040208] ${className}`}>
      <div
        className="cinematic-cosmos-static pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <div
        className="auth-aurora-pan pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Launch Stage 1 — Cinematic Splash Logo (2700ms)                            */
/* -------------------------------------------------------------------------- */

function CinematicLaunchSplash({ isExiting = false }: { isExiting?: boolean }): ReactNode {
  return (
    <CinematicCosmosCanvas
      className={`fixed inset-0 z-[80] min-h-screen ${isExiting ? "launch-splash-exit" : ""}`}
    >
      <div className="flex min-h-screen w-full flex-1 items-center justify-center">
        <div className="launch-luxury-logo relative flex items-center justify-center">
          <span
            className="launch-logo-neon-aura-outer pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full"
            aria-hidden="true"
          />
          <span
            className="launch-logo-neon-aura pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full"
            aria-hidden="true"
          />
          <h1 className="relative z-10 px-4 text-center font-sans text-4xl font-medium uppercase tracking-[4px] text-white">
            VELVET.AI
          </h1>
        </div>
      </div>
    </CinematicCosmosCanvas>
  );
}

/* -------------------------------------------------------------------------- */
/* Launch Stage 2 — Executive Bento Login Gate                                */
/* -------------------------------------------------------------------------- */

function AlphaGateRestrictedModal({ onClose }: { onClose: () => void }): ReactNode {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alpha-gate-title"
    >
      <button
        type="button"
        aria-label="Dismiss alpha gate notice"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-black/75 backdrop-blur-md"
      />
      <div className="animate-fade-in relative z-[1] w-full max-w-sm overflow-hidden rounded-2xl border border-rose-500/30 bg-zinc-950/50 p-6 shadow-[0_0_40px_rgba(155,89,240,0.18)] backdrop-blur-md">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/50 to-transparent"
          aria-hidden="true"
        />
        <p
          id="alpha-gate-title"
          className="font-serif-display text-center text-[18px] font-semibold uppercase tracking-[0.18em] text-white"
        >
          ALPHA GATE RESTRICTED
        </p>
        <p className="mt-4 text-center font-sans text-[13px] leading-relaxed text-zinc-400">
          Apple Secure Sign-In is currently reserved for verified hardware profiles.
          Please use &apos;Continue with Google&apos; for instant deployment into the
          active timeline.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-[12px] border border-white/10 bg-black/40 py-3 font-sans text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-all duration-200 hover:border-white/20 active:scale-[0.98]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function ExecutiveBentoLoginGate({
  isAuthenticating,
  authError,
  onGoogleSignIn,
}: {
  isAuthenticating: boolean;
  authError: string | null;
  onGoogleSignIn: () => void;
}): ReactNode {
  const [showAlphaGate, setShowAlphaGate] = useState(false);

  const handleGoogle = (): void => {
    triggerHapticFeedback(12);
    onGoogleSignIn();
  };

  const handleApple = (): void => {
    triggerHapticFeedback(12);
    setShowAlphaGate(true);
  };

  return (
    <CinematicCosmosCanvas className="fixed inset-0 z-[70] min-h-screen">
      {showAlphaGate && (
        <AlphaGateRestrictedModal onClose={() => setShowAlphaGate(false)} />
      )}
      <div className="flex min-h-screen w-full flex-1 flex-col items-center justify-center px-5 pb-[8vh]">
        <div className="auth-login-block-enter relative flex w-full max-w-sm flex-col items-center">
          <span
            className="launch-logo-neon-aura-outer pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/4 rounded-full"
            aria-hidden="true"
          />
          <span
            className="launch-logo-neon-aura pointer-events-none absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 -translate-y-1/4 rounded-full"
            aria-hidden="true"
          />
          <h1 className="relative z-10 font-sans text-lg font-medium uppercase tracking-[4px] text-white">
            VELVET.AI
          </h1>
          <p className="relative z-10 mt-2 font-sans text-xs uppercase tracking-wider text-zinc-400">
            Executive Access Layer
          </p>

          <div className="relative z-10 mt-8 flex w-full flex-col gap-4">
            {isAuthenticating ? (
              <div className="flex min-h-[148px] flex-col items-center justify-center rounded-[24px] border border-[#D4AF37]/20 bg-[#09070D]/60 px-6 py-8 backdrop-blur-xl">
                <p className="auth-scan-pulse text-center font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-[#D4AF37]">
                  [ RE-ROUTING SECURE VECTOR TO OAUTH MAINFRAME...
                  <br />
                  AUTHENTICATING LAYERS ]
                </p>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleGoogle}
                  className="auth-glass-button flex w-full items-center justify-center gap-3 rounded-lg px-5 py-[18px] text-[15px] font-semibold text-white active:scale-[0.96]"
                >
                  <GoogleBrandIcon />
                  Continue with Google
                </button>
                <button
                  type="button"
                  onClick={handleApple}
                  className="auth-glass-button auth-glass-button-dark flex w-full items-center justify-center gap-3 rounded-lg px-5 py-[18px] text-[15px] font-semibold text-white active:scale-[0.96]"
                >
                  <AppleBrandIcon />
                  Continue with Apple
                </button>
              </>
            )}
            {authError && (
              <p className="text-center font-mono text-[11px] text-[#ff6b8a]">{authError}</p>
            )}
          </div>
        </div>
      </div>
    </CinematicCosmosCanvas>
  );
}

/* -------------------------------------------------------------------------- */
/* Launch Stage 3 — Executive Narrative Dashboard (Bento Lobby)               */
/* -------------------------------------------------------------------------- */

const GENRE_WORLD_ICONS: Record<number, LucideIcon> = {
  1: Shield,
  2: Shield,
  3: Eye,
  4: BookOpen,
};

const UNIVERSE_HUD_COPY: Record<
  number,
  { title: string; subtitle: string; body: string }
> = {
  1: {
    title: "SYNAPSE: CHARISMA",
    subtitle: "PRIME YOUR PRESENCE",
    body: "Real-world social exposure, friction training, and dominant charisma protocols. Unlock localized lore by stepping directly into the crowd.",
  },
  2: {
    title: "CORPUS: IRON",
    subtitle: "THE PHYSICAL DRILL",
    body: "High-intensity physical failure, raw cold exposure, and pain tolerance thresholds. Shut down the inner voice and prove your absolute grit.",
  },
  3: {
    title: "NEXUS: THRESHOLD",
    subtitle: "BREAK COMFORT ZONES",
    body: "Primal fear-facing, discomfort inoculation, and extreme cognitive distortion. Execute parameters to earn your next psychological horror beat.",
  },
  4: {
    title: "LOGIC: MIND",
    subtitle: "UPGRADE THE CORE",
    body: "Deep-focus isolation, uncompromised cognitive momentum, and zero-procrastination deep study execution.",
  },
};

function GenreWorldBentoTile({
  world,
  onSelect,
}: {
  world: StoryWorld;
  onSelect: () => void;
}): ReactNode {
  const GenreIcon = GENRE_WORLD_ICONS[world.id] ?? BookOpen;
  const hud = UNIVERSE_HUD_COPY[world.id];

  return (
    <button
      type="button"
      onClick={() => {
        triggerHapticFeedback(12);
        onSelect();
      }}
      className="group relative min-h-[160px] w-full overflow-hidden rounded-none border border-zinc-800/60 bg-black/90 p-6 text-left backdrop-blur-xl transition-all duration-200 hover:border-purple-500/80 hover:shadow-[0_0_20px_rgba(168,85,247,0.25)] active:scale-[0.97]"
      aria-label={`Enter ${hud?.title ?? world.name} genre`}
    >
      <div className="absolute right-4 top-4 flex items-center space-x-1.5 rounded border border-zinc-700/50 bg-zinc-900/90 px-2 py-0.5 font-mono text-[10px] text-purple-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" />
        <span>SYS_ARMED</span>
      </div>
      <GenreIcon
        className="absolute bottom-5 right-5 h-5 w-5 text-zinc-600"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="relative flex h-full flex-col justify-between pr-8">
        <div>
          <span className="inline-block border border-zinc-700/60 bg-zinc-950/80 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400/90">
            {hud?.subtitle ?? world.tagline}
          </span>
          <h3 className="mt-3 font-mono text-xl font-bold uppercase tracking-wide text-white">
            {hud?.title ?? world.name}
          </h3>
          <p className="mt-2 font-mono text-sm leading-relaxed text-zinc-400">
            {hud?.body ?? world.description}
          </p>
        </div>
        <span className="mt-4 font-mono text-xs uppercase tracking-wider text-zinc-500 transition-colors group-hover:text-purple-300">
          LOCK TARGET →
        </span>
      </div>
    </button>
  );
}

function CharacterScreenHeader({
  worldName,
  onBack,
}: {
  worldName: string;
  onBack: () => void;
}): ReactNode {
  return (
    <header className="relative grid shrink-0 grid-cols-[auto_1fr_auto] items-center pb-3 pt-1">
      <button
        type="button"
        onClick={onBack}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[16px] text-zinc-300 transition-transform active:scale-[0.96]"
        aria-label="Back to genres"
      >
        ←
      </button>
      <h1 className="text-center font-sans text-[13px] font-bold uppercase tracking-[4px] text-white">
        {worldName}
      </h1>
      <span className="h-9 w-9" aria-hidden="true" />
    </header>
  );
}

function DashboardCharacterTile({
  character,
  onSelect,
  disabled = false,
  isRecruiting = false,
}: {
  character: StoryCharacter;
  onSelect: () => void;
  disabled?: boolean;
  isRecruiting?: boolean;
}): ReactNode {
  const { theme } = character;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) {
          return;
        }
        triggerHapticFeedback(12);
        onSelect();
      }}
      className="group relative flex h-auto min-h-[110px] w-full flex-col justify-between rounded-2xl border bg-zinc-950/45 p-4 text-left backdrop-blur-md transition-all duration-300 active:scale-[0.97] disabled:cursor-wait disabled:opacity-55"
      style={{
        borderColor: theme.border,
        borderWidth: 1,
        boxShadow: `0 0 28px ${softenThemeGlow(theme.glow)}`,
      }}
      aria-label={`Choose questmaster ${character.name}`}
      aria-busy={isRecruiting}
    >
      <span
        className="pointer-events-none absolute left-0 top-1/2 h-[160%] w-[55%] -translate-y-1/2 rounded-full opacity-20 blur-3xl"
        style={{ background: theme.glow }}
        aria-hidden="true"
      />

      <div className="relative z-[1]">
        <span className="block text-base font-bold text-white">{character.name}</span>
        <p className="mb-3 mt-1 block text-xs leading-normal tracking-wide text-zinc-400">
          {character.role}
        </p>
      </div>

      {character.quote && (
        <p className="relative z-[1] mb-2 font-sans text-xs italic text-zinc-300">
          &ldquo;{character.quote}&rdquo;
        </p>
      )}

      <span
        className="relative z-[1] mt-auto block pt-2 text-[11px] font-bold uppercase tracking-widest transition-colors group-hover:brightness-110"
        style={{ color: theme.text }}
      >
        {isRecruiting ? "SYNCING QUESTMASTER…" : QUESTMASTER_RECRUIT_CTA}
      </span>
    </button>
  );
}

function ExecutiveNarrativeDashboard({
  dashboardView,
  selectedCharacter,
  selectedWorld,
  selectedWorldId,
  messages,
  lockState,
  activeStoryId,
  userId,
  trust,
  instantMount,
  isRecruitingQuestmaster = false,
  recruitError = null,
  onSelectLobbyWorld,
  onContinueFromLobby,
  onSelectLobbyCharacter,
  onBackToGenres,
  onBackToCharacters,
  onSwitchStory,
  onEnterNarrative,
}: {
  dashboardView: DashboardView;
  selectedCharacter: StoryCharacter | undefined;
  selectedWorld: StoryWorld | undefined;
  selectedWorldId: number | null;
  messages: ChatMessage[];
  lockState: CliffhangerLockState | null;
  activeStoryId: string;
  userId: string | null;
  trust: number;
  instantMount: boolean;
  isRecruitingQuestmaster?: boolean;
  recruitError?: string | null;
  onSelectLobbyWorld: (worldId: number) => void;
  onContinueFromLobby: () => void;
  onSelectLobbyCharacter: (characterId: number, worldId: number) => void;
  onBackToGenres: () => void;
  onBackToCharacters: () => void;
  onSwitchStory: (storyId: string) => void;
  onEnterNarrative: () => void;
}): ReactNode {
  const mountClass = instantMount ? "dashboard-instant-mount" : "auth-gate-enter";
  const isMafiaAtmosphere =
    selectedWorld?.id === 2 || selectedCharacter?.worldId === 2;
  const isHorrorAtmosphere =
    selectedWorld?.id === 3 || selectedCharacter?.worldId === 3;
  const isSchoolAtmosphere =
    selectedWorld?.id === 4 || selectedCharacter?.worldId === 4;

  const atmosphereDiv = (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        background: isMafiaAtmosphere
          ? [
              "radial-gradient(ellipse 85% 48% at 50% 12%, rgba(255,184,48,0.14) 0%, transparent 68%)",
              "radial-gradient(ellipse 55% 65% at 12% 88%, rgba(92,61,10,0.24) 0%, transparent 55%)",
            ].join(", ")
          : isHorrorAtmosphere
            ? [
                "radial-gradient(ellipse 85% 48% at 50% 12%, rgba(34,211,238,0.12) 0%, transparent 68%)",
                "radial-gradient(ellipse 55% 65% at 12% 88%, rgba(8,51,68,0.28) 0%, transparent 55%)",
              ].join(", ")
            : isSchoolAtmosphere
              ? [
                  "radial-gradient(ellipse 85% 48% at 50% 12%, rgba(139,92,246,0.16) 0%, transparent 68%)",
                  "radial-gradient(ellipse 55% 65% at 12% 88%, rgba(76,29,149,0.26) 0%, transparent 55%)",
                ].join(", ")
              : [
                  "radial-gradient(ellipse 85% 48% at 50% 12%, rgba(91,37,137,0.3) 0%, transparent 68%)",
                  "radial-gradient(ellipse 55% 65% at 12% 88%, rgba(41,15,65,0.28) 0%, transparent 55%)",
                ].join(", "),
      }}
      aria-hidden="true"
    />
  );

  /* ── STAGE: Stories (story arcs for selected character) ─────────────── */
  if (dashboardView === "stories" && selectedCharacter) {
    return (
      <div className={`relative flex h-full flex-col bg-black ${mountClass}`}>
        {atmosphereDiv}
        <div className="relative z-20 flex shrink-0 items-center gap-3 px-4 pb-2 pt-4">
          <button
            type="button"
            onClick={onBackToCharacters}
            className="rounded-full border border-white/10 bg-black/50 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#D4AF37]/80 transition-transform active:scale-[0.96]"
          >
            ← Characters
          </button>
          <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#6b6280]">
            {selectedCharacter.name.split(" ")[0]} · Story Arcs
          </span>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <StoriesTimelineTab
            character={selectedCharacter}
            messages={messages}
            lockState={lockState}
            activeStoryId={activeStoryId}
            userId={userId}
            worldId={selectedWorldId ?? 0}
            trust={trust}
            onSwitchStory={onSwitchStory}
          />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-12 z-30 flex justify-center px-6">
          <button
            type="button"
            onClick={() => {
              triggerHapticFeedback(12);
              onEnterNarrative();
            }}
            className="pointer-events-auto btn-gold-gradient rounded-full px-8 py-3.5 font-serif-display text-[14px] font-semibold text-[#2a1f08] shadow-[0_0_30px_rgba(212,175,55,0.25)] transition-transform active:scale-[0.96]"
          >
            Enter Narrative
          </button>
        </div>
      </div>
    );
  }

  /* ── STAGE: Characters (4 character tiles for selected genre) ────────── */
  if (dashboardView === "characters" && selectedWorld) {
    const worldCharacters = getCharactersForWorld(selectedWorld.id);

    return (
      <div className={`relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-black ${mountClass}`}>
        {atmosphereDiv}
        {selectedWorld.id === 1 && <RainParticleMatrix />}
        <div
          className="velvet-mobile-scroll relative z-10 mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col overflow-y-auto overscroll-contain scroll-smooth px-4 pt-2 pb-32"
          style={VIEWPORT_SCROLL_TOUCH_STYLE}
        >
          <CharacterScreenHeader worldName={selectedWorld.name} onBack={onBackToGenres} />
          {recruitError && (
            <div
              className="mt-3 rounded-xl border border-[#e8476a]/45 bg-[#e8476a]/10 px-3 py-2.5 text-[12px] leading-relaxed text-[#ffd0da]"
              role="alert"
            >
              {recruitError}
            </div>
          )}
          {isRecruitingQuestmaster && (
            <p className="mt-3 text-center text-[11px] uppercase tracking-[0.2em] text-[#b87dff]">
              Linking quest profile…
            </p>
          )}
          <div className="mt-4 flex w-full flex-col gap-4">
            {worldCharacters.map((character) => (
              <DashboardCharacterTile
                key={character.id}
                character={character}
                disabled={isRecruitingQuestmaster}
                isRecruiting={isRecruitingQuestmaster}
                onSelect={() =>
                  onSelectLobbyCharacter(character.id, selectedWorld.id)
                }
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── STAGE: Lobby (2x2 world selection grid) ───────────────────────── */
  return (
    <div className={`relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-black ${mountClass}`}>
      <WorldSelectionScreen
        selectedWorldId={selectedWorldId}
        onSelectWorld={onSelectLobbyWorld}
        onContinue={onContinueFromLobby}
      />
    </div>
  );
}

function GoogleBrandIcon(): ReactNode {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function AppleBrandIcon(): ReactNode {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Phase 2 — Narrative World Selection Matrix                                 */
/* -------------------------------------------------------------------------- */

function WorldCard({
  world,
  selected,
  onSelect,
}: {
  world: StoryWorld;
  selected: boolean;
  onSelect: (worldId: number) => void;
}): ReactNode {
  const hud = UNIVERSE_HUD_COPY[world.id] ?? {
    title: world.name,
    subtitle: world.tagline,
    body: world.description,
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(world.id)}
      className={`group relative flex h-full w-full flex-col overflow-hidden rounded-none border bg-black/90 p-4 text-left backdrop-blur-xl transition-all duration-300 active:scale-[0.98] ${
        selected
          ? "border-purple-500/80 shadow-[0_0_20px_rgba(168,85,247,0.25)]"
          : "border-zinc-800/60 hover:border-purple-500/80 hover:shadow-[0_0_20px_rgba(168,85,247,0.25)]"
      }`}
      aria-pressed={selected}
      aria-label={`Select ${hud.title}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: `${world.imageOverlay}, ${world.imageGradient}`,
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/40"
        aria-hidden="true"
      />

      <div className="relative z-10 mb-3 flex items-start justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-500">
          VEC_{String(world.id).padStart(2, "0")}
        </span>
        <div className="flex items-center space-x-1.5 rounded border border-zinc-700/50 bg-zinc-900/90 px-2 py-0.5 font-mono text-[10px] text-purple-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" />
          <span>SYS_ARMED</span>
        </div>
      </div>

      <div className="relative z-10 mt-auto flex flex-col gap-1.5">
        <h3 className="font-mono text-[13px] font-bold uppercase tracking-[0.12em] text-white">
          {hud.title}
        </h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-400/90">
          {hud.subtitle}
        </p>
        <p className="font-mono text-[10px] leading-snug text-zinc-400">
          {hud.body}
        </p>
        {selected && (
          <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.3em] text-purple-300">
            TARGET_LOCKED
          </span>
        )}
      </div>
    </button>
  );
}

function WorldSelectionScreen({
  selectedWorldId,
  onSelectWorld,
  onContinue,
}: {
  selectedWorldId: number | null;
  onSelectWorld: (worldId: number) => void;
  onContinue: () => void;
}): ReactNode {
  return (
    <div className="phase-enter relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden pb-16">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(91, 37, 137, 0.22) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />
      <header className="relative shrink-0 px-1 pb-4 text-center">
        <h1 className="font-mono text-xl font-black uppercase tracking-[0.22em] text-white">
          SELECT UNIVERSE SYNC
        </h1>
        <p className="mt-2 font-mono text-xs font-medium leading-relaxed tracking-wide text-zinc-400">
          Establish baseline synchronization with a single reality vector.
        </p>
      </header>

      <div className="stardust mb-3 grid min-h-0 w-full flex-1 grid-cols-2 grid-rows-2 gap-3 [&>*]:h-full [&>*]:min-h-0">
        {STORY_WORLDS.map((world) => (
          <WorldCard
            key={world.id}
            world={world}
            selected={selectedWorldId === world.id}
            onSelect={onSelectWorld}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={selectedWorldId === null}
        className="mt-auto w-full rounded-none border-b-4 border-amber-800 bg-gradient-to-r from-amber-500 to-yellow-600 py-3.5 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_25px_rgba(234,179,8,0.3)] transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
      >
        INITIALIZE PROTOCOL
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Phase 3½ — Story Selection ("The Timeline Crossroads")                     */
/* -------------------------------------------------------------------------- */

function StoryCard({
  story,
  characterTheme,
  onSelect,
  index,
}: {
  story: StoryDefinition;
  characterTheme: StoryCharacter["theme"];
  onSelect: (storyId: string) => void;
  index: number;
}): ReactNode {
  const [hovered, setHovered] = useState(false);
  const [shimmer, setShimmer] = useState(false);

  const handleEnter = (): void => {
    setHovered(true);
    setShimmer(true);
  };

  const handleLeave = (): void => {
    setHovered(false);
    window.setTimeout(() => setShimmer(false), 700);
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(story.story_id)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onTouchStart={handleEnter}
      onTouchEnd={handleLeave}
      className="relative w-full overflow-hidden rounded-2xl border border-[#D4AF37]/20 bg-[#0D0C14]/90 p-5 text-left"
      style={{
        transform: hovered ? "scale(1.02)" : "scale(1)",
        transition: `transform 400ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 300ms ease`,
        boxShadow: hovered
          ? `0 0 28px ${characterTheme.glow}, 0 0 60px rgba(212,175,55,0.08)`
          : `0 0 10px rgba(0,0,0,0.6)`,
        animationDelay: `${index * 80}ms`,
      }}
      aria-label={`Select story: ${story.title}`}
    >
      {shimmer && (
        <span
          className="pointer-events-none absolute inset-y-0 w-[80px] -skew-x-12 bg-white/[0.07]"
          style={{ animation: "shimmerSweep 700ms ease-out forwards" }}
          aria-hidden="true"
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#D4AF37]/60">
            Timeline {String(index + 1).padStart(2, "0")}
          </p>
          <h3 className="font-serif-display mt-1.5 text-[17px] font-medium leading-snug text-white">
            {story.title}
          </h3>
          <p className="mt-2 text-[12px] italic leading-relaxed text-[#D4AF37]/75">
            &ldquo;{story.tagline}&rdquo;
          </p>
        </div>
        <span
          className="mt-1 shrink-0 rounded-full p-2 text-[11px]"
          style={{
            background: characterTheme.glow.replace("0.5", "0.12").replace("0.45", "0.12").replace("0.4", "0.12"),
            color: characterTheme.text,
          }}
          aria-hidden="true"
        >
          →
        </span>
      </div>
    </button>
  );
}

function StorySelectionScreen({
  character,
  world,
  onSelectStory,
  onBack,
}: {
  character: StoryCharacter;
  world: StoryWorld;
  onSelectStory: (storyId: string) => void;
  onBack: () => void;
}): ReactNode {
  const stories = getCharacterStories(character.id);
  const firstName = character.name.split(" ")[0];

  return (
    <div className="phase-enter relative flex h-full flex-col overflow-hidden bg-black px-5 pb-8 pt-10">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${character.theme.glow.replace("0.5", "0.18").replace("0.45", "0.18").replace("0.4", "0.18")} 0%, transparent 65%)`,
        }}
        aria-hidden="true"
      />

      <button
        type="button"
        onClick={onBack}
        className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[14px] text-[#aaa] transition-colors hover:border-white/30 hover:text-white"
        aria-label="Back to character selection"
      >
        ←
      </button>

      <header className="relative mb-6 text-center">
        <div
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold ring-2"
          style={{
            background: character.avatarGradient,
            borderColor: character.theme.border,
            borderWidth: "2px",
            borderStyle: "solid",
            boxShadow: `0 0 20px ${character.theme.glow}`,
          }}
        >
          {character.initials}
        </div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#D4AF37]/60">
          {world.name}
        </p>
        <h1
          className="font-serif-display mt-1 text-[22px] font-semibold"
          style={{ color: character.theme.text }}
        >
          Select {firstName}&apos;s Destiny
        </h1>
        <p className="mt-2 text-[11px] leading-relaxed text-[#8a8498]">
          Choose your narrative timeline. Each path holds independent memories.
        </p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#D4AF37]/25" />
          <span className="text-[9px] text-[#D4AF37]/40">◆</span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#D4AF37]/25" />
        </div>
      </header>

      <ViewportScrollBody glass className="relative flex flex-col gap-4">
        {stories.map((story, index) => (
          <StoryCard
            key={story.story_id}
            story={story}
            characterTheme={character.theme}
            onSelect={onSelectStory}
            index={index}
          />
        ))}
      </ViewportScrollBody>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Phase 3 — Intimate Character Selection Panel                               */
/* -------------------------------------------------------------------------- */

function RomanceCharacterCard({
  character,
  onStartStory,
  index,
}: {
  character: StoryCharacter;
  onStartStory: (characterId: number) => void;
  index: number;
}): ReactNode {
  const { theme } = character;

  return (
    <article
      className="overflow-hidden rounded-2xl border-2 bg-black/80 transition-transform duration-300 active:scale-[0.985]"
      style={{
        borderColor: theme.border,
        boxShadow: `0 0 16px ${theme.glow}, inset 0 0 24px ${theme.glow.replace("0.45", "0.08").replace("0.4", "0.08")}`,
        animationDelay: `${index * 80}ms`,
      }}
    >
      <div className="flex min-h-[148px]">
        <div
          className="relative w-[38%] shrink-0 overflow-hidden"
          style={{ background: theme.portraitBackground }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/80" />
          <div
            className="absolute inset-0 flex items-end justify-center pb-3"
            aria-hidden="true"
          >
            <span
              className="font-serif-display text-[28px] font-semibold text-white/20"
              style={{ textShadow: `0 0 20px ${theme.glow}` }}
            >
              {character.initials}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between px-3.5 py-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{theme.icon}</span>
              <h3
                className="font-serif-display truncate text-[17px] font-medium italic"
                style={{ color: theme.text }}
              >
                {character.name}
              </h3>
            </div>
            <p
              className="mt-0.5 text-[10px] font-medium leading-snug"
              style={{ color: theme.text }}
            >
              {character.role}
            </p>
            <p className="font-serif-display mt-2 text-[11px] italic leading-snug text-white/85">
              &ldquo;{character.quote}&rdquo;
            </p>
          </div>

          <button
            type="button"
            onClick={() => onStartStory(character.id)}
            className="mt-3 w-full rounded-lg py-2 text-[12px] font-semibold text-white shadow-lg transition-all duration-300 hover:brightness-110 active:scale-[0.98]"
            style={{
              background: theme.buttonGradient,
              boxShadow: `0 4px 16px ${theme.glow}`,
            }}
          >
            {QUESTMASTER_RECRUIT_CTA}
          </button>
        </div>
      </div>
    </article>
  );
}

function RomanceCharacterSelectionScreen({
  onSelectCharacter,
  onBack,
}: {
  onSelectCharacter: (characterId: number) => void;
  onBack: () => void;
}): ReactNode {
  const characters = getCharactersForWorld(1);

  return (
    <div className="phase-enter relative flex h-full flex-col overflow-hidden bg-black">
      <button
        type="button"
        onClick={onBack}
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[14px] text-[#aaa] transition-colors hover:border-white/30 hover:text-white"
        aria-label="Back to worlds"
      >
        ←
      </button>

      <header className="shrink-0 px-5 pb-4 pt-10 text-center">
        <h1 className="font-serif-display text-romance-crimson text-[26px] font-semibold tracking-[0.12em] uppercase sm:text-[28px]">
          Romance{" "}
          <span className="inline-block not-italic" aria-hidden="true">
            ❤
          </span>{" "}
          Drama
        </h1>
        <p className="font-serif-display mt-3 text-[13px] text-[#b0b0b0]">
          Your story begins here.
        </p>
        <p className="font-serif-display mt-1 text-[13px] text-[#e8476a]/90">
          People here will remember how you treat them.
        </p>
        <p className="mt-4 text-[12px] tracking-wide text-white/70">
          <span className="text-[#d4af37]">✦</span> Choose who enters your
          story first
        </p>
      </header>

      <ViewportScrollBody className="flex flex-col gap-3 px-4">
        {characters.map((character, index) => (
          <RomanceCharacterCard
            key={character.id}
            character={character}
            onStartStory={onSelectCharacter}
            index={index}
          />
        ))}
      </ViewportScrollBody>
    </div>
  );
}

function CharacterCard({
  character,
  onSelect,
}: {
  character: StoryCharacter;
  onSelect: (characterId: number) => void;
}): ReactNode {
  const { theme } = character;

  return (
    <article
      className="overflow-hidden rounded-2xl border-2 bg-black/80"
      style={{
        borderColor: theme.border,
        boxShadow: `0 0 14px ${theme.glow}`,
      }}
    >
      <div className="flex min-h-[130px]">
        <div
          className="w-[36%] shrink-0"
          style={{ background: theme.portraitBackground }}
        />
        <div className="flex min-w-0 flex-1 flex-col justify-between px-3.5 py-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{theme.icon}</span>
              <h3
                className="font-serif-display text-[16px] font-medium italic"
                style={{ color: theme.text }}
              >
                {character.name}
              </h3>
            </div>
            <p className="mt-0.5 text-[10px]" style={{ color: theme.text }}>
              {character.role}
            </p>
            <p className="font-serif-display mt-2 text-[11px] italic text-white/80">
              &ldquo;{character.quote}&rdquo;
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelect(character.id)}
            className="mt-3 w-full rounded-lg py-2 text-[12px] font-semibold text-white"
            style={{ background: theme.buttonGradient }}
          >
            {QUESTMASTER_RECRUIT_CTA}
          </button>
        </div>
      </div>
    </article>
  );
}

function CharacterSelectionScreen({
  world,
  onSelectCharacter,
  onBack,
}: {
  world: StoryWorld;
  onSelectCharacter: (characterId: number) => void;
  onBack: () => void;
}): ReactNode {
  if (world.id === 1) {
    return (
      <RomanceCharacterSelectionScreen
        onSelectCharacter={onSelectCharacter}
        onBack={onBack}
      />
    );
  }

  const characters = getCharactersForWorld(world.id);
  const accent = ACCENT_STYLES[world.accent];

  return (
    <div className="phase-enter flex h-full flex-col px-5 pb-8 pt-10">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 self-start text-[13px] text-[#8a8a8a] transition-colors hover:text-white"
      >
        ← Back to worlds
      </button>

      <header className="mb-6 text-center">
        <span className="text-xl">{world.icon}</span>
        <h1 className="font-serif-display text-gold-gradient mt-2 text-[26px] font-semibold">
          {world.name}
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: accent.text }}>
          {world.tagline}
        </p>
        <GoldDiamond />
        <p className="text-[12px] text-[#8a8a8a]">
          Choose who you&apos;ll meet first.
        </p>
      </header>

      <ViewportScrollBody className="flex flex-col gap-3">
        {characters.map((character) => (
          <CharacterCard
            key={character.id}
            character={character}
            onSelect={onSelectCharacter}
          />
        ))}
      </ViewportScrollBody>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Phase 4 — Live Narrative Stream Module                                     */
/* -------------------------------------------------------------------------- */

function ChronoVaultCounter({
  countdown,
}: {
  countdown: { hours: string; minutes: string; seconds: string; expired: boolean };
}): ReactNode {
  const [ms, setMs] = useState(0);

  useEffect(() => {
    let rafId: number;
    let last = performance.now();

    const tick = (now: number): void => {
      const delta = now - last;
      last = now;
      setMs((previous) => {
        const next = previous - Math.floor(delta);
        return next <= 0 ? 990 : next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const msDisplay = String(Math.max(0, ms)).padStart(3, "0").slice(0, 3);

  const units: Array<{ value: string; label: string; weight: string }> = [
    { value: countdown.hours, label: "HRS", weight: "font-light" },
    { value: countdown.minutes, label: "MIN", weight: "font-normal" },
    { value: countdown.seconds, label: "SEC", weight: "font-semibold" },
    { value: msDisplay, label: "MS", weight: "font-bold" },
  ];

  return (
    <div className="flex items-end justify-center gap-1">
      {units.map((unit, index) => (
        <div key={unit.label} className="flex items-end">
          <div className="flex flex-col items-center">
            <span
              className={`${unit.weight} min-w-[44px] text-center text-white tabular-nums shadow-[0_0_15px_rgba(212,175,55,0.25)] ${
                unit.label === "MS"
                  ? "text-[18px] text-white/60"
                  : "text-[26px]"
              }`}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {unit.value}
            </span>
            <span className="mt-1 text-[8px] uppercase tracking-[0.25em] text-[#D4AF37]/50">
              {unit.label}
            </span>
          </div>
          {index < units.length - 1 && (
            <span className="mb-5 px-[2px] text-[18px] font-thin text-[#D4AF37]/40">
              :
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function VaultBypassButton({
  isUnlocking,
  onClick,
}: {
  isUnlocking: boolean;
  onClick: () => void;
}): ReactNode {
  const [hovered, setHovered] = useState(false);
  const [shimmer, setShimmer] = useState(false);

  const handleEnter = (): void => {
    setHovered(true);
    setShimmer(true);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([12]);
      } catch {
        /* vibration unsupported */
      }
    }
  };

  const handleLeave = (): void => {
    setHovered(false);
    window.setTimeout(() => setShimmer(false), 600);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isUnlocking}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onTouchStart={handleEnter}
      onTouchEnd={handleLeave}
      className={`relative mt-6 w-full overflow-hidden rounded-xl bg-[#D4AF37] px-6 py-4 text-[15px] font-bold tracking-wide text-[#1a1200] shadow-[0_0_20px_rgba(212,175,55,0.5)] transition-transform duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
        hovered && !isUnlocking ? "scale-[1.02]" : "scale-100"
      }`}
      style={{
        transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
      aria-label="Bypass time lock for $1.00"
    >
      {shimmer && (
        <span
          className="pointer-events-none absolute inset-y-0 w-[60px] -skew-x-12 bg-white/35"
          style={{ animation: "shimmerSweep 600ms ease-out forwards" }}
          aria-hidden="true"
        />
      )}
      <span className="relative z-[1]">
        {isUnlocking ? "Processing…" : "Bypass Time Lock Instantly ($1.00)"}
      </span>
    </button>
  );
}

function CliffhangerLockWidget({
  lockState,
  countdown,
  onUnlockClick,
  isUnlocking,
}: {
  lockState: CliffhangerLockState;
  countdown: { hours: string; minutes: string; seconds: string; expired: boolean };
  onUnlockClick: () => void;
  isUnlocking: boolean;
}): ReactNode {
  return (
    <div className="animate-fade-in relative mx-4 mb-2 overflow-hidden rounded-2xl border border-[#D4AF37]/35 bg-black/85 shadow-[0_0_40px_rgba(212,175,55,0.18)] backdrop-blur-xl">
      {/* Top accent line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />

      <div className="px-5 pb-6 pt-5">
        <p className="text-center text-[9px] font-semibold uppercase tracking-[0.32em] text-[#D4AF37]/60">
          THE CHRONO VAULT
        </p>
        <p className="mt-1 text-center text-[10px] uppercase tracking-[0.18em] text-white/40">
          Timeline Stabilizing…
        </p>

        <div className="mt-5">
          <ChronoVaultCounter countdown={countdown} />
        </div>

        <p className="mt-5 text-center text-[11px] italic leading-relaxed text-[#a89060]">
          &ldquo;{lockState.teaser}&rdquo;
        </p>

        <VaultBypassButton
          isUnlocking={isUnlocking}
          onClick={onUnlockClick}
        />
      </div>
    </div>
  );
}

function PremiumUnlockModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}): ReactNode {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm">
      <div className="animate-fade-in w-full max-w-sm overflow-hidden rounded-2xl border border-[#D4AF37]/40 bg-gradient-to-b from-[#1a1508] to-black p-6 shadow-[0_0_40px_rgba(212,175,55,0.25)]">
        <p className="font-serif-display text-gold-gradient text-center text-[20px] font-semibold">
          Velvet Premium
        </p>
        <GoldDiamond />
        <p className="mt-2 text-center text-[14px] leading-relaxed text-[#e8dcc0]">
          {message}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="btn-gold-gradient font-serif-display mt-6 w-full rounded-full py-3 text-[15px] font-semibold text-[#2a1f08]"
        >
          Continue the story
        </button>
      </div>
    </div>
  );
}

function trustToAffinityPercent(trust: number): number {
  return Math.round(((trust + 1) / 2) * 100);
}

function AffinityEngine({
  trust,
  flashing,
  affinityPercentOverride = null,
  statusTag = null,
}: {
  trust: number;
  flashing: boolean;
  affinityPercentOverride?: number | null;
  statusTag?: HardwareStatusTag | null;
}): ReactNode {
  const percent =
    affinityPercentOverride != null
      ? Math.round(affinityPercentOverride)
      : trustToAffinityPercent(trust);
  const isWarm = trust >= 0 || percent >= 50;

  return (
    <div className="mt-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className={`text-[9px] font-semibold uppercase tracking-[0.22em] transition-colors duration-300 ${
            flashing ? "text-[#b87dff]" : "text-[#D4AF37]/70"
          }`}
        >
          Affinity Engine
        </span>
        <span
          className={`text-[10px] tabular-nums transition-colors duration-300 ${
            flashing ? "text-[#b87dff]" : "text-[#D4AF37]/90"
          }`}
        >
          {percent}%
        </span>
      </div>
      {statusTag && (
        <p
          className={`mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] ${
            statusTag === "RESPECT" ? "text-[#b87dff]" : "text-[#e8476a]/85"
          }`}
        >
          {statusTag}
        </p>
      )}
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-[#1a1a1a]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${percent}%`,
            transition: "width 750ms ease-out, box-shadow 300ms ease-out, background 300ms ease-out",
            background: flashing
              ? "linear-gradient(90deg, #5b2589, #9b59f0, #b87dff)"
              : isWarm
                ? "linear-gradient(90deg, #8b6914, #D4AF37, #f5e6a8)"
                : "linear-gradient(90deg, #590d22, #e8476a, #ff6b8a)",
            boxShadow: flashing
              ? "0 0 14px rgba(155,89,240,0.75)"
              : isWarm
                ? "0 0 10px rgba(212,175,55,0.35)"
                : "0 0 10px rgba(232,71,106,0.35)",
          }}
        />
      </div>
    </div>
  );
}

function TypingIndicator(): ReactNode {
  return (
    <div className="kinetic-enter mb-1 flex flex-col items-start">
      <div className="tech-chassis-wrap max-w-[300px]">
        <div className="tech-chassis-inner typing-pulse-glow px-4 py-3.5">
          <div className="flex items-center gap-1.5 px-0.5 py-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#9b59f0] [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#b87dff] [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#9b59f0] [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  partIndex = 0,
  onPlotCardSelect,
  onPlotCardSkip,
  onPlotCardReroll,
  isRerollingPlotCards = false,
}: {
  message: ChatMessage;
  partIndex?: number;
  onPlotCardSelect?: (card: PlotCard) => void;
  onPlotCardSkip?: () => void;
  onPlotCardReroll?: () => void;
  isRerollingPlotCards?: boolean;
}): ReactNode {
  const isUser = message.role === "user";
  const enterStyle = { animationDelay: `${partIndex * 80}ms` };

  if (isUser) {
    return (
      <div
        className="kinetic-enter mb-4 flex w-full flex-col items-end"
        style={enterStyle}
      >
        <TechChassisUser>
          <p className="text-[14px] leading-snug text-white whitespace-pre-wrap">
            {message.content}
          </p>
        </TechChassisUser>
        <div className="mt-1 flex w-full max-w-[82%] flex-col items-end">
          <span className="audit-checkmarks text-[11px]" aria-label="Delivered">
            ✓✓
          </span>
          <MessageTimestamp messageId={message.id} align="right" />
        </div>
      </div>
    );
  }

  const showCursor = Boolean(message.streaming && message.content.trim().length > 0);
  const hasPlotCards =
    !message.streaming &&
    Array.isArray(message.plot_cards) &&
    message.plot_cards.length > 0 &&
    onPlotCardSelect !== undefined &&
    onPlotCardSkip !== undefined &&
    onPlotCardReroll !== undefined;

  if (message.streaming && message.content.trim().length === 0) {
    return null;
  }

  if (message.content.trim().length === 0 && !hasPlotCards) {
    return null;
  }

  return (
    <div className="kinetic-enter mb-1 flex flex-col items-start" style={enterStyle}>
      {message.content.trim().length > 0 && (
        <TechChassisCharacter>
          <div className="px-4 py-3.5">
            <p
              className={`text-[14px] leading-snug text-white whitespace-pre-wrap ${
                showCursor ? "typewriter-cursor" : ""
              }`}
            >
              {message.content}
            </p>
          </div>
        </TechChassisCharacter>
      )}
      {hasPlotCards && (
        <PlotCardDeck
          cards={message.plot_cards!}
          onSelect={onPlotCardSelect!}
          onSkip={onPlotCardSkip!}
          onReroll={onPlotCardReroll!}
          isRerolling={isRerollingPlotCards}
        />
      )}
      <MessageTimestamp messageId={message.id} align="left" />
    </div>
  );
}

function AdventureChoiceHub({
  options,
  onSelect,
  disabled,
  showWriteOwn = false,
  onWriteOwn,
}: {
  options: string[];
  onSelect: (text: string) => void;
  disabled: boolean;
  showWriteOwn?: boolean;
  onWriteOwn?: (text: string) => void;
}): ReactNode {
  const labels = ["Option A", "Option B"];
  const [ownText, setOwnText] = useState("");

  const handleSelect = (text: string): void => {
    triggerHapticFeedback(12);
    onSelect(text);
  };

  const handleOwnSend = (): void => {
    const trimmed = ownText.trim();
    if (!trimmed || disabled) return;
    triggerHapticFeedback(12);
    setOwnText("");
    onWriteOwn?.(trimmed);
  };

  const handleOwnKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleOwnSend();
    }
  };

  return (
    <div className="flex w-full flex-col gap-2.5 px-1 py-2">
      {options.map((option, index) => (
        <button
          key={`${index}-${option.slice(0, 24)}`}
          type="button"
          disabled={disabled}
          onClick={() => handleSelect(option)}
          className="choice-capsule-interactive group w-full rounded-xl border border-[#D4AF37]/40 bg-black px-5 py-3.5 text-center disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D4AF37]/60 group-hover:text-[#D4AF37]">
            {labels[index] ?? `Option ${index + 1}`}
          </span>
          <span className="mt-1 block text-[13px] leading-snug text-[#D4AF37] group-hover:text-white">
            {option}
          </span>
        </button>
      ))}
      {showWriteOwn && (
        <div className="flex items-center gap-2 rounded-xl border border-[#9b59f0]/30 bg-[#0a0810]/80 px-3 py-2">
          <span className="shrink-0 text-[13px]">✍️</span>
          <input
            type="text"
            value={ownText}
            onChange={(e) => setOwnText(e.target.value)}
            onKeyDown={handleOwnKeyDown}
            disabled={disabled}
            placeholder="Write your own move..."
            className="flex-1 bg-transparent text-[13px] text-white/80 placeholder:text-[#6b6280] outline-none disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Write your own move"
          />
          <button
            type="button"
            onClick={handleOwnSend}
            disabled={disabled || ownText.trim().length === 0}
            className="send-purple-glow flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M3 9L15 3L9 15L8 10L3 9Z" fill="white" stroke="white" strokeWidth="1" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Story Mode — high-retention narrative onboarding loop                       */
/* -------------------------------------------------------------------------- */

function StoryPathButton({
  path,
  onChoose,
}: {
  path: CharacterStoryPath;
  onChoose: (path: CharacterStoryPath) => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={() => {
        triggerHapticFeedback(12);
        onChoose(path);
      }}
      className="group flex w-full items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-zinc-950/50 px-4 py-3 text-left text-white backdrop-blur-md transition-all duration-200 hover:border-rose-400/60 active:scale-[0.98]"
    >
      <span className="min-w-0 text-[13px] font-medium leading-snug">
        <span aria-hidden="true">🎬 </span>
        <span className="text-rose-300/80">[{path.chapter}]</span> {path.title}
      </span>
      <span
        className="shrink-0 text-rose-300/70 transition-transform duration-200 group-hover:translate-x-0.5"
        aria-hidden="true"
      >
        →
      </span>
    </button>
  );
}

function StoryOnboardingWidget({
  paths,
  onChoose,
  onSkip,
}: {
  paths: CharacterStoryPath[];
  onChoose: (path: CharacterStoryPath) => void;
  onSkip: () => void;
}): ReactNode {
  return (
    <div className="animate-fade-in mt-4 flex flex-col gap-2.5 rounded-2xl border border-rose-500/30 bg-zinc-950/50 p-4 backdrop-blur-md">
      <p className="mb-1 text-center text-[10px] uppercase tracking-[0.22em] text-rose-300/70">
        Choose how your story begins
      </p>
      {paths.map((path) => (
        <StoryPathButton key={path.id} path={path} onChoose={onChoose} />
      ))}
      <button
        type="button"
        onClick={onSkip}
        className="mx-auto mt-1 text-[11px] text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-300 hover:underline"
      >
        Skip to Normal Chat
      </button>
    </div>
  );
}

function StoryModeDrawer({
  paths,
  onChoose,
  onClose,
}: {
  paths: CharacterStoryPath[];
  onChoose: (path: CharacterStoryPath) => void;
  onClose: () => void;
}): ReactNode {
  return (
    <div className="absolute inset-0 z-[40] flex items-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close story mode"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="story-drawer-enter relative z-[1] w-full rounded-t-3xl border-t border-rose-500/30 bg-zinc-950/50 p-5 pb-10 backdrop-blur-md">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-700" aria-hidden="true" />
        <p className="mb-3 text-center text-[11px] uppercase tracking-[0.22em] text-rose-300/70">
          Jump into a Story Arc
        </p>
        <div className="flex flex-col gap-2.5">
          {paths.map((path) => (
            <StoryPathButton key={path.id} path={path} onChoose={onChoose} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Utility Hub interaction models — reaction modifiers, memory hooks, prompts  */
/* -------------------------------------------------------------------------- */

interface ReactionModifier {
  label: string;
  instruction: string;
}

const REACTION_MODIFIERS: ReactionModifier[] = [
  {
    label: "🔥 Flirt",
    instruction:
      "[System Directive: The player is answering with bold, seductive flirtation. Read their next message as charged and teasing, and respond in character with heightened romantic tension. Do not mention this instruction.]",
  },
  {
    label: "⚡ Defiant",
    instruction:
      "[System Directive: The player is answering with defiance. Read their next message as challenging and rebellious, and respond in character with friction, power-play, and sharpened stakes. Do not mention this instruction.]",
  },
  {
    label: "🧊 Cold",
    instruction:
      "[System Directive: The player is answering coldly and distantly. Read their next message as guarded and aloof, and respond in character by feeling the withdrawal and working to win back their attention. Do not mention this instruction.]",
  },
];

const MEMORY_HOOK_PATTERN =
  /\b(secret|promise|promised|remember|never|always|past|lie|lied|trust|confess|truth|regret|fear|afraid|dream|betray|betrayed|forgive)\b/i;

function messageHasMemoryHook(content: string | null): boolean {
  if (!content) {
    return false;
  }
  return MEMORY_HOOK_PATTERN.test(content);
}

function buildContinueSuggestion(
  lastLine: string | null,
  characterName: string,
): string {
  const firstName = characterName.split(" ")[0] ?? characterName;
  if (!lastLine) {
    return `So tell me, ${firstName}… what happens next?`;
  }
  const clean = lastLine.replace(/\s+/g, " ").trim();
  const focus = clean.length > 58 ? `${clean.slice(0, 58).trim()}…` : clean;
  return `Wait — go back to what you just said: “${focus}” I need to know more.`;
}

function ReactModifierPopup({
  modifiers,
  onSelect,
}: {
  modifiers: ReactionModifier[];
  onSelect: (modifier: ReactionModifier) => void;
}): ReactNode {
  return (
    <div className="animate-fade-in flex gap-2 rounded-2xl border border-[#9b59f0]/30 bg-zinc-950/80 p-2 shadow-[0_0_24px_rgba(155,89,240,0.25)] backdrop-blur-md">
      {modifiers.map((modifier) => (
        <button
          key={modifier.label}
          type="button"
          onClick={() => onSelect(modifier)}
          className="whitespace-nowrap rounded-full border border-white/10 bg-black/50 px-3 py-2 text-[12px] text-white/90 transition-all duration-150 hover:border-[#b87dff]/50 hover:text-white active:scale-95"
        >
          {modifier.label}
        </button>
      ))}
    </div>
  );
}

function ChatScreen({
  world,
  character,
  messages,
  inputValue,
  isStreaming,
  isInitializingGreeting,
  showTypingIndicator,
  narrativeOptions,
  showNarrativeOptions,
  trust,
  lockState,
  countdown,
  errorMessage,
  onInputChange,
  onSend,
  onOptionSelect,
  onUnlockClick,
  isUnlocking,
  onBack,
  hasBottomNav = false,
  onReactBoost,
  onPlotCardSelect,
  onPlotCardSkip,
  onPlotCardReroll,
  isRerollingPlotCards = false,
  activeStoryTitle,
  activeStoryId,
  plotCardPhase = "normal",
  onDismissWriteOwn,
  onStoryModeSelect,
  onReactionModifier,
  storyPaths,
  questStatus,
  questSessionLoaded,
  isSubmittingQuest,
  questCompleteError,
  onQuestComplete,
  affinityBoostNonce = 0,
  userId = null,
  missionId = null,
  missionText = null,
  missionSensorKind = "camera_environment",
  missionSensorLabel = null,
  isChapterLocked = false,
  hardwareAffinityScore = null,
  hardwareStatusTag = null,
  onMissionVerified,
}: {
  world: StoryWorld;
  character: StoryCharacter;
  messages: ChatMessage[];
  inputValue: string;
  isStreaming: boolean;
  isInitializingGreeting: boolean;
  showTypingIndicator: boolean;
  narrativeOptions: string[];
  showNarrativeOptions: boolean;
  trust: number;
  lockState: CliffhangerLockState | null;
  countdown: { hours: string; minutes: string; seconds: string; expired: boolean };
  errorMessage: string | null;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onOptionSelect: (text: string) => void;
  onDirectorContinue: () => void;
  onUnlockClick: () => void;
  isUnlocking: boolean;
  onBack?: () => void;
  hasBottomNav?: boolean;
  onReactBoost: () => void;
  onPlotCardSelect: (card: PlotCard) => void;
  onPlotCardSkip: () => void;
  onPlotCardReroll: () => void;
  isRerollingPlotCards?: boolean;
  activeStoryTitle: string | null;
  activeStoryId: string;
  plotCardPhase?: PlotCardPhase;
  onDismissWriteOwn?: () => void;
  onStoryModeSelect: (storyId: string, instruction: string) => void;
  onReactionModifier: (instruction: string) => void;
  storyPaths: CharacterStoryPath[];
  questStatus: QuestStatus | null;
  questSessionLoaded: boolean;
  isSubmittingQuest: boolean;
  questCompleteError: string | null;
  onQuestComplete: (verification: string) => Promise<void>;
  affinityBoostNonce?: number;
  userId?: string | null;
  missionId?: string | null;
  missionText?: string | null;
  missionSensorKind?: HardwareSensorKind;
  missionSensorLabel?: string | null;
  isChapterLocked?: boolean;
  hardwareAffinityScore?: number | null;
  hardwareStatusTag?: HardwareStatusTag | null;
  onMissionVerified?: (
    payload: MissionGateSuccessPayload,
  ) => void | Promise<void>;
}): ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showMemoryOverlay, setShowMemoryOverlay] = useState(false);
  const [reactionToast, setReactionToast] = useState<string | null>(null);
  const [affinityFlashing, setAffinityFlashing] = useState(false);
  const [activeStoryMode, setActiveStoryMode] = useState<null | "sandbox" | string>(
    null,
  );
  const [showStoryDrawer, setShowStoryDrawer] = useState(false);
  const [pendingReaction, setPendingReaction] = useState<string | null>(null);
  const [savedMemories, setSavedMemories] = useState<string[]>([]);
  const [memorySaved, setMemorySaved] = useState(false);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | null>(null);
  const prevUserMessageCountRef = useRef(0);

  const isQuestHydrationHold =
    !questSessionLoaded && activeStoryId.startsWith("quest:");
  const isQuestLocked =
    isChapterLocked ||
    isQuestHydrationHold ||
    (questSessionLoaded && questStatus === "PENDING");

  const showHardwareMissionGate =
    isQuestLocked &&
    Boolean(userId && missionId && missionText) &&
    !isInitializingGreeting;

  const showEnergyCheckIn = showHardwareMissionGate && energyLevel === null;

  const resolvedGateMission = ((): {
    missionId: string;
    missionText: string;
    sensorKind: HardwareSensorKind;
    sensorLabel: string;
  } | null => {
    if (!showHardwareMissionGate || !missionId || !missionText || energyLevel === null) {
      return null;
    }
    if (isLowEnergy(energyLevel)) {
      return {
        missionId: RECOVERY_SYNC_MISSION.id,
        missionText: RECOVERY_SYNC_MISSION.missionText,
        sensorKind: RECOVERY_SYNC_MISSION.sensorKind,
        sensorLabel: RECOVERY_SYNC_MISSION.sensorLabel,
      };
    }
    return {
      missionId,
      missionText,
      sensorKind: missionSensorKind,
      sensorLabel: missionSensorLabel ?? "Hardware Proof",
    };
  })();

  useEffect(() => {
    // Reset check-in whenever a new hardware lock deploys.
    setEnergyLevel(null);
  }, [missionId]);

  const handleEnergySelect = useCallback(
    (level: EnergyLevel): void => {
      setEnergyLevel(level);
      if (userId) {
        void submitEmpathyCheckIn({
          userId,
          energyLevel: level,
          empathyMode: isLowEnergy(level) ? "RECOVERY" : "STANDARD",
          note: `CHECKIN:E${level}:${missionId ?? "unknown"}`,
        }).catch((error) => {
          console.warn("[velvet/empathy] check-in log failed:", error);
        });
      }
    },
    [missionId, userId],
  );

  useEffect(() => {
    if (affinityBoostNonce > 0) {
      setAffinityFlashing(true);
      const timer = window.setTimeout(() => setAffinityFlashing(false), 900);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [affinityBoostNonce]);

  useEffect(() => {
    setActiveStoryMode(null);
    setShowStoryDrawer(false);
    setPendingReaction(null);
    setShowMemoryOverlay(false);
    setReactionToast(null);
    setMemorySaved(false);
    setSavedMemories([]);
  }, [character.id]);

  const isLocked = lockState !== null;
  const isCardsVisible = plotCardPhase === "cards-visible";
  const isFreePlay = plotCardPhase === "free-play";
  const isStoryHybrid = plotCardPhase === "story-hybrid";

  const encounterInputLocked =
    isCardsVisible ||
    isInitializingGreeting ||
    (showTypingIndicator && isCardsVisible);

  const inputFullyLocked =
    isLocked ||
    isStreaming ||
    isInitializingGreeting ||
    showTypingIndicator ||
    isCardsVisible ||
    isQuestLocked;

  const inputDisabled = inputFullyLocked;

  const composerHidden =
    isCardsVisible || isInitializingGreeting || (showTypingIndicator && isCardsVisible);

  const visibleMessages = messages.filter(
    (message) => !(message.streaming && message.content.trim().length === 0),
  );

  const awaitingCharacterReply =
    showTypingIndicator ||
    messages.some(
      (message) => message.streaming && message.content.trim().length === 0,
    );

  const choicesActive =
    !isLocked &&
    !isStreaming &&
    !showTypingIndicator &&
    !isQuestLocked &&
    (isStoryHybrid ||
      (showNarrativeOptions && narrativeOptions.length > 0 && !isCardsVisible && !isFreePlay));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [
    messages,
    showTypingIndicator,
    isInitializingGreeting,
    awaitingCharacterReply,
    choicesActive,
    narrativeOptions,
  ]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!inputDisabled) {
        onSend();
      }
    }
  };

  const hasUserTurn = messages.some((message) => message.role === "user");

  const showStoryOnboarding =
    activeStoryMode === null &&
    !hasUserTurn &&
    visibleMessages.length > 0 &&
    !isInitializingGreeting &&
    !awaitingCharacterReply &&
    !isLocked &&
    !isCardsVisible;

  const handleChooseStoryPath = (path: CharacterStoryPath): void => {
    track("story_arc_started", { storyId: path.id });
    setActiveStoryMode(path.id);
    setShowStoryDrawer(false);
    onStoryModeSelect(path.id, path.instruction);
  };

  const handleSkipStory = (): void => {
    setActiveStoryMode("sandbox");
  };

  const latestAssistantContent = useMemo(() => {
    const assistantMessages = messages.filter(
      (message) => message.role === "assistant" && message.content.trim().length > 0,
    );
    return assistantMessages.length > 0
      ? assistantMessages[assistantMessages.length - 1].content.trim()
      : null;
  }, [messages]);

  const memoryHookActive = useMemo(
    () => messageHasMemoryHook(latestAssistantContent),
    [latestAssistantContent],
  );

  const handleReactionModifierSelect = (modifier: ReactionModifier): void => {
    setPendingReaction(modifier.label);
    onReactionModifier(modifier.instruction);
    setReactionToast(`${modifier.label} primed for your next message`);
    window.setTimeout(() => setReactionToast(null), 2000);
  };

  const handleMemoryNote = (): void => {
    if (latestAssistantContent) {
      const snippet =
        latestAssistantContent.length > 140
          ? `${latestAssistantContent.slice(0, 140).trim()}…`
          : latestAssistantContent;
      const next = appendSavedMemoryNote(
        world.id,
        character.id,
        activeStoryId,
        snippet,
      );
      setSavedMemories(next);
      setMemorySaved(true);
      window.setTimeout(() => setMemorySaved(false), 2000);
      setReactionToast(`Memory saved · ${next.length} in vault`);
      window.setTimeout(() => setReactionToast(null), 2000);
    }
    setShowMemoryOverlay((previous) => !previous);
  };

  const handleContinueTopic = (): void => {
    const suggestion = buildContinueSuggestion(latestAssistantContent, character.name);
    onInputChange(suggestion);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Clear the locked reaction modifier once the player's next turn is committed.
  useEffect(() => {
    const userMessageCount = messages.filter(
      (message) => message.role === "user",
    ).length;
    if (userMessageCount > prevUserMessageCountRef.current) {
      setPendingReaction(null);
    }
    prevUserMessageCountRef.current = userMessageCount;
  }, [messages]);

  return (
    <div className="chat-enter relative flex h-full min-h-0 flex-col bg-black">
      <div className="purple-vignette pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />
      <div className="viewport-vignette pointer-events-none absolute inset-0 z-[3]" aria-hidden="true" />

      {reactionToast && (
        <div className="absolute left-1/2 top-20 z-[50] -translate-x-1/2 rounded-full border border-[#9b59f0]/40 bg-[#12111A]/95 px-4 py-2 text-[12px] text-[#b87dff] backdrop-blur-md">
          {reactionToast}
        </div>
      )}

      <header className="relative z-[4] shrink-0 border-b border-[#9b59f0]/15 bg-black/85 px-4 py-3 backdrop-blur-md">
        <div className="flex items-start gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mt-2 text-[18px] text-[#8a8a8a] hover:text-white"
              disabled={isStreaming}
              aria-label="Go back"
            >
              ←
            </button>
          ) : (
            <span className="w-[18px]" aria-hidden="true" />
          )}

          <div className="flex min-w-0 flex-1 flex-col items-center text-center">
            <div
              className="mb-2 flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold ring-2 ring-[#9b59f0]/40"
              style={{ background: character.avatarGradient }}
            >
              {character.initials}
            </div>
            <h2 className="font-serif-display flex items-center justify-center gap-1 text-[17px] text-white">
              {character.name}
              <span className="text-[13px]">✨</span>
            </h2>
            <p className="mt-0.5 text-[11px] text-[#9b59f0]/75">
              {world.name}
              {activeStoryTitle
                ? ` · ${activeStoryTitle}`
                : isFreePlay
                  ? " · Free Roleplay"
                  : isCardsVisible
                    ? " · Destiny Crossroads"
                    : " · Just Chat Mode"}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="online-pulse-dot h-2 w-2 rounded-full bg-[#4ade80]" />
              <span className="text-[11px] text-[#4ade80]/90">Active</span>
            </div>
            <div className="mt-2 w-full max-w-[220px]">
              <AffinityEngine
                trust={trust}
                flashing={affinityFlashing}
                affinityPercentOverride={hardwareAffinityScore}
                statusTag={hardwareStatusTag}
              />
            </div>
          </div>

          <button
            type="button"
            className="mt-2 px-1 text-[18px] text-[#8a8a8a] hover:text-white"
            aria-label="Menu"
          >
            ⋯
          </button>
        </div>
      </header>

      {!isLocked && messages.length > 0 && <MemorySystemNode />}

      <MemoryScannerSheet
        character={character}
        trust={trust}
        messages={messages}
        isOpen={showMemoryOverlay}
        onClose={() => setShowMemoryOverlay(false)}
      />

      {isLocked && lockState && (
        <div className="relative z-[4] shrink-0 px-0 pt-3">
          <CliffhangerLockWidget
            lockState={lockState}
            countdown={countdown}
            onUnlockClick={onUnlockClick}
            isUnlocking={isUnlocking}
          />
        </div>
      )}

      <div className="relative z-[2] flex min-h-0 flex-1 flex-col">
        <div
          className="ambient-scene-layer ambient-ken-burns pointer-events-none absolute inset-0"
          style={{ background: getWorldSceneBackground(world.id) }}
          aria-hidden="true"
        />
        <div
          className="ambient-color-dodge-overlay pointer-events-none absolute inset-0"
          aria-hidden="true"
        />
        {world.id === 1 && <RainParticleMatrix />}
        <div
          ref={scrollRef}
          className="velvet-mobile-scroll-glass relative z-[3] flex-1 min-h-0 w-full touch-pan-y overflow-y-auto overscroll-contain scroll-smooth px-4 pt-2 pb-36"
          style={{ ...VIEWPORT_SCROLL_TOUCH_STYLE, scrollBehavior: "smooth" }}
        >
          {isInitializingGreeting && (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="tech-chassis-wrap">
                <div className="tech-chassis-inner typing-pulse-glow px-6 py-5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#D4AF37] [animation-delay:0ms]" />
                    <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#D4AF37] [animation-delay:150ms]" />
                    <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#D4AF37] [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            </div>
          )}
          {visibleMessages.map((message, index) => (
            <ChatBubble
              key={message.id}
              message={message}
              partIndex={index}
              onPlotCardSelect={onPlotCardSelect}
              onPlotCardSkip={onPlotCardSkip}
              onPlotCardReroll={onPlotCardReroll}
              isRerollingPlotCards={isRerollingPlotCards}
            />
          ))}
          {showStoryOnboarding && storyPaths.length > 0 && (
            <StoryOnboardingWidget
              paths={storyPaths}
              onChoose={handleChooseStoryPath}
              onSkip={handleSkipStory}
            />
          )}
          {awaitingCharacterReply && !isInitializingGreeting && (
            <TypingIndicator />
          )}
          {questSessionLoaded &&
            questStatus === "PENDING" &&
            !showHardwareMissionGate && (
            <div className="mt-4 pb-2">
              <div className="rounded-2xl border border-[#9b59f0]/30 bg-[#12081f]/90 p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#b87dff]">
                  Hardware Lock Active
                </p>
                <p className="text-[12px] leading-relaxed text-[#cfc6e0]">
                  Sign in and load a quest line to open The Watcher camera HUD.
                </p>
                {questCompleteError && (
                  <p className="mt-2 text-[11px] text-[#e8476a]">{questCompleteError}</p>
                )}
                {!isSubmittingQuest && (
                  <button
                    type="button"
                    onClick={() => {
                      void onQuestComplete(
                        "Manual override proof — mission executed in real life.",
                      );
                    }}
                    className="mt-3 w-full rounded-full border border-[#9b59f0]/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d9bcff]"
                  >
                    Fallback Text Proof
                  </button>
                )}
              </div>
            </div>
          )}
          {choicesActive && (
            <div className="choice-hub-in-feed mt-4 pb-2">
              <AdventureChoiceHub
                options={narrativeOptions}
                onSelect={onOptionSelect}
                disabled={inputDisabled}
                showWriteOwn={isStoryHybrid}
                onWriteOwn={(text) => {
                  onDismissWriteOwn?.();
                  onOptionSelect(text);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {errorMessage && (
        <p className="relative z-[4] shrink-0 px-4 pb-2 text-center text-[12px] text-[#e8476a]">
          {errorMessage}
        </p>
      )}

      {!(choicesActive && !isFreePlay) && (
      <div
        className={`relative z-[4] shrink-0 border-t border-[#9b59f0]/15 backdrop-blur-md ${
          isLocked || showHardwareMissionGate
            ? "bg-black/85 backdrop-blur-xl"
            : "bg-[#0a0810]/95"
        } ${hasBottomNav ? "pb-20" : "pb-6"}`}
      >
        {isLocked ? (
          /* Smoke-glass shield — input zone replaced by vault vault prompt */
          <div className="animate-fade-in flex items-center justify-center gap-2 px-4 py-5 text-center">
            <span className="inline-block h-2 w-2 rounded-full bg-[#D4AF37] opacity-60 shadow-[0_0_8px_#D4AF37] animate-pulse" />
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#D4AF37]/70">
              Bypass the vault above to continue
            </p>
            <span className="inline-block h-2 w-2 rounded-full bg-[#D4AF37] opacity-60 shadow-[0_0_8px_#D4AF37] animate-pulse" />
          </div>
        ) : showHardwareMissionGate ? (
          <div className="px-3 py-3">
            <div className="mb-2 flex items-center justify-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#9b59f0] shadow-[0_0_8px_#9b59f0] animate-pulse" />
              <p className="text-[10px] uppercase tracking-[0.24em] text-[#b87dff]/80">
                Chat locked — hardware proof required
              </p>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#9b59f0] shadow-[0_0_8px_#9b59f0] animate-pulse" />
            </div>

            {showEnergyCheckIn ? (
              <section
                className="relative overflow-hidden rounded-2xl border border-[#9b59f0]/45 bg-[#07040f]/95 px-4 py-5 shadow-[0_0_40px_rgba(155,89,240,0.28)]"
                aria-label="Human check-in overlay"
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(155,89,240,0.18),transparent_55%)]" />
                <div className="relative z-[1] space-y-4">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#b87dff]">
                      The Watcher // Human Check-In
                    </p>
                    <p className="mt-2 text-[15px] font-medium leading-snug text-white">
                      Rate your current focus node energy (1-5)
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#9a90b0]">
                      Low energy auto-routes to Recovery Sync — no guilt, no wall.
                    </p>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {([1, 2, 3, 4, 5] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => {
                          handleEnergySelect(level);
                        }}
                        className="aspect-square rounded-xl border border-[#9b59f0]/45 bg-[#12081f] text-[16px] font-bold text-[#f0e7ff] transition-transform active:scale-95 hover:border-[#b87dff] hover:bg-[#9b59f0]/20"
                        aria-label={`Energy level ${level}`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  <p className="text-center text-[10px] uppercase tracking-[0.18em] text-[#6f6685]">
                    1 exhausted · 5 locked in
                  </p>
                </div>
              </section>
            ) : resolvedGateMission ? (
              <MissionGate
                userId={userId!}
                missionId={resolvedGateMission.missionId}
                missionText={resolvedGateMission.missionText}
                sensorKind={resolvedGateMission.sensorKind}
                sensorLabel={resolvedGateMission.sensorLabel}
                energyLevel={energyLevel}
                onSuccess={async (payload) => {
                  setEnergyLevel(null);
                  await onMissionVerified?.(payload);
                }}
              />
            ) : null}
          </div>
        ) : (
          <>
            <div
              className={`px-4 py-3 ${
                choicesActive && !isFreePlay ? "min-h-0 py-2" : "min-h-[120px]"
              }`}
            >
              <div
                className={`input-composer-shell ${
                  composerHidden || (choicesActive && !isFreePlay)
                    ? "input-composer-shell-exit"
                    : ""
                }`}
              >
                <UtilityHub
                  disabled={inputDisabled}
                  characterName={character.name}
                  reactionModifiers={REACTION_MODIFIERS}
                  onReactModifier={handleReactionModifierSelect}
                  onReactBoost={() => {
                    onReactBoost();
                    setAffinityFlashing(true);
                    window.setTimeout(() => setAffinityFlashing(false), 900);
                  }}
                  memoryActive={memoryHookActive}
                  memorySaved={memorySaved}
                  onMemoryNote={handleMemoryNote}
                  onContinueTopic={handleContinueTopic}
                  onStoryMode={() => setShowStoryDrawer(true)}
                />
                {pendingReaction && (
                  <div className="mb-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#b87dff]/40 bg-[#b87dff]/10 px-3 py-1 text-[11px] text-[#d9bcff]">
                      {pendingReaction}
                      <button
                        type="button"
                        onClick={() => setPendingReaction(null)}
                        className="text-[#d9bcff]/70 hover:text-white"
                        aria-label="Clear reaction modifier"
                      >
                        ×
                      </button>
                    </span>
                    <span className="text-[10px] text-[#6b6280]">
                      applied to your next message
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={inputDisabled}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-[#9b59f0]/80 hover:text-[#b87dff] disabled:opacity-40"
                    aria-label="Emoji"
                  >
                    ☺
                  </button>
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(event) => onInputChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={inputDisabled}
                    placeholder={
                      isQuestLocked
                        ? "[QUEST ACTIVE] Complete your mission in real life to unlock chat..."
                        : isInitializingGreeting || awaitingCharacterReply
                          ? `${character.name} is typing...`
                          : isFreePlay
                            ? `Say anything to ${character.name}...`
                            : `Message ${character.name}...`
                    }
                    className="flex-1 rounded-full border border-[#9b59f0]/20 bg-[#12111A]/80 px-4 py-3 text-[14px] text-white placeholder:text-[#6b6280] outline-none transition-colors focus:border-[#9b59f0]/50 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Chat message input"
                  />
                  <button
                    type="button"
                    onClick={onSend}
                    disabled={inputDisabled || inputValue.trim().length === 0}
                    className="send-purple-glow flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Send message"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 9L15 3L9 15L8 10L3 9Z"
                        fill="white"
                        stroke="white"
                        strokeWidth="1"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {showStoryDrawer && storyPaths.length > 0 && (
        <StoryModeDrawer
          paths={storyPaths}
          onChoose={handleChooseStoryPath}
          onClose={() => setShowStoryDrawer(false)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Root Application Orchestrator                                              */
/* -------------------------------------------------------------------------- */

export default function HomePage(): ReactNode {
  const {
    session,
    user,
    isAuthLoading,
    hadCachedSessionOnMount,
    isAuthenticating,
    authError,
    signInWithGoogle,
    signOut,
  } = useVelvetAuth();

  // Hydration safeguard: the server prerender has no access to localStorage, so
  // optimistic auth probes (peekPersistedAuthMarker / hadCachedSessionOnMount)
  // resolve differently on the client. Gate all dynamic auth-routed layout
  // behind a post-mount flag so the server payload and the client first paint
  // render the identical neutral shell.
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [launchStage, setLaunchStage] = useState<LaunchStage>(() =>
    hadCachedSessionOnMount ? "dashboard" : "splash-logo",
  );
  const [isSplashExiting, setIsSplashExiting] = useState(false);
  const [dashboardView, setDashboardView] = useState<DashboardView>("lobby");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const instantDashboardMountRef = useRef(hadCachedSessionOnMount);

  const [phase, setPhase] = useState<AppPhase>(() =>
    hadCachedSessionOnMount ? "dashboard" : "splash",
  );
  const [selectedWorldId, setSelectedWorldId] = useState<number | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializingGreeting, setIsInitializingGreeting] = useState(false);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumModalMessage, setPremiumModalMessage] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [lockState, setLockState] = useState<CliffhangerLockState | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [trust, setTrust] = useState(0);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [currentTab, setCurrentTab] = useState<AppTab>("character");
  const [appTheme, setAppTheme] = useState<AppTheme>("dark");
  const [userEmail, setUserEmail] = useState("");
  const [activeStoryId, setActiveStoryId] = useState<string>("default");
  const [activeStoryTitle, setActiveStoryTitle] = useState<string | null>(null);
  const [activeQuestLineId, setActiveQuestLineId] = useState<QuestLineId | null>(
    null,
  );
  const [plotCardPhase, setPlotCardPhase] = useState<PlotCardPhase>("normal");
  const [isRerollingPlotCards, setIsRerollingPlotCards] = useState(false);
  const [questStatus, setQuestStatus] = useState<QuestStatus | null>(null);
  const [questSessionLoaded, setQuestSessionLoaded] = useState(false);
  const [isSubmittingQuest, setIsSubmittingQuest] = useState(false);
  const [questCompleteError, setQuestCompleteError] = useState<string | null>(null);
  const [affinityBoostNonce, setAffinityBoostNonce] = useState(0);
  const [questProgressRefreshNonce, setQuestProgressRefreshNonce] = useState(0);
  const [hardwareAffinityScore, setHardwareAffinityScore] = useState<
    number | null
  >(null);
  const [hardwareStatusTag, setHardwareStatusTag] =
    useState<HardwareStatusTag | null>(null);
  const [hardwareArcProgress, setHardwareArcProgress] = useState<number | null>(
    null,
  );
  const [isChapterLocked, setIsChapterLocked] = useState(false);
  const [hardwareMissionIndex, setHardwareMissionIndex] = useState(0);
  const [activeHardwareMission, setActiveHardwareMission] =
    useState<HardwareMission | null>(null);
  const [missionSequenceOrder, setMissionSequenceOrder] = useState(0);
  const [narrativeBeatsSinceUnlock, setNarrativeBeatsSinceUnlock] = useState(0);
  const [cliffhangerThreshold, setCliffhangerThreshold] = useState(() =>
    rollCliffhangerThreshold(),
  );
  const [isGeneratingStoryNode, setIsGeneratingStoryNode] = useState(false);
  const [themeRipple, setThemeRipple] = useState<
    (ThemeToggleOrigin & { targetTheme: AppTheme }) | null
  >(null);

  const streamingMessageIdRef = useRef<string | null>(null);
  const pendingReactionNoteRef = useRef<string | null>(null);
  const behaviorSystemPromptRef = useRef<string | undefined>(undefined);
  const plotCardPhaseRef = useRef<PlotCardPhase>("normal");
  const activeStoryIdRef = useRef<string>("default");
  const activeQuestLineIdRef = useRef<QuestLineId | null>(null);
  const questStatusRef = useRef<QuestStatus | null>(null);
  const userIdRef = useRef<string | null>(null);
  const navigationHydratedRef = useRef(false);
  const skipNavigationPersistRef = useRef(false);
  const cliffhangerThresholdRef = useRef(cliffhangerThreshold);
  const narrativeBeatsRef = useRef(0);
  const hardwareMissionIndexRef = useRef(0);
  const missionSequenceOrderRef = useRef(0);
  const cliffhangerArmedRef = useRef(true);
  const cliffhangerInFlightRef = useRef(false);

  const userId = user?.id ?? null;
  const isAuthenticated = Boolean(session && userId);
  const showLaunchSplash =
    launchStage === "splash-logo" && !isAuthenticated && !isSigningOut;
  const showLoginGate =
    launchStage === "login-gate" && !isAuthenticated && !isSigningOut;
  const showDashboard =
    launchStage === "dashboard" && isAuthenticated && !isSigningOut;

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let mounted = true;

    const hydrateAuthSession = async (): Promise<void> => {
      if (typeof window !== "undefined") {
        const rawHash = window.location.hash || "";
        const hashParams = new URLSearchParams(rawHash.replace(/^#/, ""));
        const searchParams = new URLSearchParams(window.location.search);
        const accessToken =
          hashParams.get("access_token") ?? searchParams.get("access_token");
        const refreshToken =
          hashParams.get("refresh_token") ?? searchParams.get("refresh_token");
        const code = searchParams.get("code");

        // Client fallback: Supabase sometimes returns implicit tokens on `/#access_token=…`
        // (hash is invisible to the server). Persist session, then scrub the URL.
        if (rawHash.includes("access_token") && accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.warn(
              "[velvet/auth] OAuth hash session failed:",
              error.message,
            );
          }
          window.history.replaceState({}, "", "/");
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.warn(
              "[velvet/auth] OAuth code exchange failed:",
              error.message,
            );
          } else {
            window.history.replaceState({}, "", "/");
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.warn(
              "[velvet/auth] OAuth hash session failed:",
              error.message,
            );
          } else {
            window.history.replaceState({}, "", "/");
          }
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) {
        return;
      }

      if (data.session?.user) {
        setLaunchStage("dashboard");
        setDashboardView("lobby");
        setPhase("worlds" as AppPhase);
      } else {
        setPhase("login" as AppPhase);
      }
    };

    void hydrateAuthSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) {
        return;
      }

      if (nextSession?.user) {
        setLaunchStage("dashboard");
        setDashboardView("lobby");
        setPhase("worlds" as AppPhase);
      } else {
        setLaunchStage("login-gate");
        setPhase("login" as AppPhase);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const clearChatSessionState = useCallback((): void => {
    setMessages([]);
    setLockState(null);
    setErrorMessage(null);
    setInputValue("");
    setIsInitializingGreeting(false);
    setShowTypingIndicator(false);
    setSuggestions([]);
    setShowSuggestions(false);
    setTrust(0);
    setShowPremiumModal(false);
    setActiveStoryId("default");
    setActiveStoryTitle(null);
    setPlotCardPhase("normal");
    setIsRerollingPlotCards(false);
    setConversationId(null);
    setQuestStatus(null);
    setQuestSessionLoaded(false);
    setIsSubmittingQuest(false);
    setQuestCompleteError(null);
    streamingMessageIdRef.current = null;
    pendingReactionNoteRef.current = null;
  }, []);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    questStatusRef.current = questStatus;
  }, [questStatus]);

  useEffect(() => {
    if (
      !isMounted ||
      !userId ||
      phase !== "chat" ||
      selectedCharacterId === null ||
      launchStage !== "dashboard"
    ) {
      return;
    }

    let cancelled = false;
    setQuestSessionLoaded(false);

    const loadQuestSession = async (): Promise<void> => {
      try {
        const session: QuestSessionResponse = await fetchQuestSession(userId);
        if (cancelled) {
          return;
        }
        setQuestStatus((previous) => {
          if (previous === "PENDING" || previous === "COMPLETED") {
            return previous;
          }
          return session.questStatus;
        });
        if (session.questStatus === "PENDING") {
          setActiveHardwareMission((current) => {
            if (current) {
              return current;
            }
            return getHardwareMissionByIndex(hardwareMissionIndexRef.current);
          });
          cliffhangerArmedRef.current = false;
        } else if (
          session.questStatus === "UNLOCKED" ||
          session.questStatus === "COMPLETED"
        ) {
          cliffhangerArmedRef.current = true;
        }
      } catch {
        if (cancelled) {
          return;
        }
        setQuestStatus((previous) => previous ?? "UNLOCKED");
      } finally {
        if (!cancelled) {
          setQuestSessionLoaded(true);
        }
      }
    };

    void loadQuestSession();

    return () => {
      cancelled = true;
    };
  }, [
    isMounted,
    userId,
    phase,
    selectedCharacterId,
    selectedWorldId,
    activeStoryId,
    launchStage,
  ]);

  useEffect(() => {
    if (user?.email) {
      setUserEmail(user.email);
    }
  }, [user?.email]);

  useEffect(() => {
    if (launchStage !== "splash-logo" || isAuthenticated || isAuthLoading) {
      return;
    }

    setIsSplashExiting(false);

    const exitTimer = window.setTimeout(() => {
      setIsSplashExiting(true);
    }, LAUNCH_SPLASH_ANIM_MS + LAUNCH_SPLASH_HOLD_MS);

    const stageTimer = window.setTimeout(() => {
      setLaunchStage("login-gate");
      setIsSplashExiting(false);
    }, LAUNCH_SPLASH_TOTAL_MS);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(stageTimer);
    };
  }, [launchStage, isAuthenticated, isAuthLoading]);

  useEffect(() => {
    if (isAuthLoading || isSigningOut || !isAuthenticated) {
      return;
    }

    setLaunchStage("dashboard");
    setPhase((current) => (current === "chat" ? "chat" : ("worlds" as AppPhase)));
  }, [isAuthenticated, isAuthLoading, isSigningOut]);

  useEffect(() => {
    if (!isAuthenticated && !isSigningOut && launchStage === "dashboard") {
      setLaunchStage("login-gate");
      setDashboardView("lobby");
      setPhase("splash");
    }
  }, [isAuthenticated, isSigningOut, launchStage]);

  useEffect(() => {
    if (!isMounted || !isAuthenticated || navigationHydratedRef.current) {
      return;
    }

    const persisted = readPersistedNavigationState();
    if (persisted) {
      const validated = validatePersistedNavigationState(persisted);
      if (validated) {
        skipNavigationPersistRef.current = true;
        setDashboardView(validated.dashboardView);
        setPhase(validated.phase);
        setSelectedWorldId(validated.selectedWorldId);
        setSelectedCharacterId(validated.selectedCharacterId);
      }
    }

    navigationHydratedRef.current = true;
  }, [isMounted, isAuthenticated]);

  useEffect(() => {
    if (!isMounted || !isAuthenticated || !navigationHydratedRef.current) {
      return;
    }

    if (skipNavigationPersistRef.current) {
      skipNavigationPersistRef.current = false;
      return;
    }

    writePersistedNavigationState({
      dashboardView,
      phase,
      selectedWorldId,
      selectedCharacterId,
    });
  }, [
    isMounted,
    isAuthenticated,
    dashboardView,
    phase,
    selectedWorldId,
    selectedCharacterId,
  ]);

  useEffect(() => {
    plotCardPhaseRef.current = plotCardPhase;
  }, [plotCardPhase]);

  useEffect(() => {
    activeStoryIdRef.current = activeStoryId;
  }, [activeStoryId]);

  useEffect(() => {
    activeQuestLineIdRef.current = activeQuestLineId;
  }, [activeQuestLineId]);

  useEffect(() => {
    const persistedQuestLine = readActiveQuestLineId();
    if (persistedQuestLine) {
      setActiveQuestLineId(persistedQuestLine);
    }
  }, []);

  const selectedWorld = useMemo(
    () => (selectedWorldId !== null ? getWorldById(selectedWorldId) : undefined),
    [selectedWorldId],
  );

  const selectedCharacter = useMemo(
    () =>
      selectedCharacterId !== null
        ? getCharacterById(selectedCharacterId)
        : undefined,
    [selectedCharacterId],
  );

  const characterStoryPaths = useMemo(
    () =>
      selectedCharacterId !== null
        ? buildStoryPathsForCharacter(selectedCharacterId)
        : [],
    [selectedCharacterId],
  );

  const activeBehaviorSystemPrompt = useMemo(
    () =>
      selectedCharacterId !== null
        ? getBehaviorSystemPrompt(selectedCharacterId)
        : undefined,
    [selectedCharacterId],
  );

  useEffect(() => {
    behaviorSystemPromptRef.current = activeBehaviorSystemPrompt;
  }, [activeBehaviorSystemPrompt]);

  const navigationResolution = useMemo(() => {
    const world = selectedWorld;
    const character = selectedCharacter;
    let resolvedDashboardView = dashboardView;
    let needsRepair = false;

    if (resolvedDashboardView === "chat") {
      if (!world || !character) {
        resolvedDashboardView = world ? "characters" : "lobby";
        needsRepair = true;
      }
    } else if (resolvedDashboardView === "characters" && !world) {
      resolvedDashboardView = "lobby";
      needsRepair = true;
    } else if (resolvedDashboardView === "stories" && !character) {
      resolvedDashboardView = world ? "characters" : "lobby";
      needsRepair = true;
    }

    const resolvedPhase =
      resolvedDashboardView === "chat"
        ? "chat"
        : phase === "chat"
          ? "dashboard"
          : phase;

    if (resolvedPhase !== phase) {
      needsRepair = true;
    }

    if (
      character &&
      world &&
      character.worldId !== world.id
    ) {
      needsRepair = true;
    }

    return {
      resolvedDashboardView,
      resolvedPhase,
      world,
      character,
      needsRepair,
    };
  }, [dashboardView, phase, selectedWorld, selectedCharacter]);

  const showChatShell =
    showDashboard &&
    navigationResolution.resolvedDashboardView === "chat" &&
    navigationResolution.resolvedPhase === "chat" &&
    Boolean(navigationResolution.world) &&
    Boolean(navigationResolution.character);

  useEffect(() => {
    if (!isMounted || !navigationResolution.needsRepair) {
      return;
    }

    const { resolvedDashboardView, resolvedPhase, world, character } =
      navigationResolution;

    skipNavigationPersistRef.current = true;

    if (resolvedDashboardView !== dashboardView) {
      setDashboardView(resolvedDashboardView);
    }
    if (resolvedPhase !== phase) {
      setPhase(resolvedPhase as AppPhase);
    }

    if (resolvedDashboardView === "lobby") {
      if (selectedWorldId !== null) {
        setSelectedWorldId(null);
      }
      if (selectedCharacterId !== null) {
        setSelectedCharacterId(null);
      }
      clearChatSessionState();
    } else if (resolvedDashboardView === "characters") {
      if (dashboardView === "chat" || !character) {
        if (selectedCharacterId !== null) {
          setSelectedCharacterId(null);
        }
        clearChatSessionState();
      }
    }

    if (character && world && character.worldId !== world.id) {
      setSelectedWorldId(character.worldId);
    }
  }, [
    isMounted,
    navigationResolution,
    dashboardView,
    phase,
    selectedWorldId,
    selectedCharacterId,
    clearChatSessionState,
  ]);

  const countdown = useMemo(() => {
    if (!lockState) {
      return { hours: "12", minutes: "00", seconds: "00", expired: false };
    }
    return formatCountdownParts(lockState.lockedUntil, countdownNow);
  }, [lockState, countdownNow]);

  const applyVelvetDeepLink = useCallback((rawUrl: string): void => {
    const link = parseVelvetDeepLink(rawUrl);
    if (link.tab !== "character" || phase !== "chat") {
      return;
    }

    if (link.worldId !== null) {
      setSelectedWorldId(link.worldId);
    }
    if (link.characterId !== null) {
      setSelectedCharacterId(link.characterId);
    }

    setCurrentTab("character");
    setDashboardView("chat");
    setPhase("chat");
  }, [phase]);

  useEffect(() => {
    if (launchStage !== "dashboard" || phase !== "chat" || !session) {
      return;
    }

    applyVelvetDeepLink(window.location.href);

    return attachPushNavigationListener((url) => {
      applyVelvetDeepLink(url);
    });
  }, [applyVelvetDeepLink, launchStage, phase, session]);

  useEffect(() => {
    if (launchStage !== "dashboard" || !session || !userId) {
      return;
    }

    void registerPhantomPush({
      userId,
      worldId: selectedWorldId ?? undefined,
      characterId: selectedCharacterId ?? undefined,
    });
  }, [launchStage, selectedWorldId, selectedCharacterId, session, userId]);

  useEffect(() => {
    if (!lockState) {
      return;
    }

    const interval = window.setInterval(() => {
      setCountdownNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [lockState]);

  useEffect(() => {
    if (lockState && countdown.expired) {
      setLockState(null);
    }
  }, [lockState, countdown.expired]);

  const applyLock = useCallback((lockedUntil: string, teaser?: string): void => {
    setLockState({
      lockedUntil,
      teaser: teaser ?? CLIFFHANGER_TEASER,
    });
  }, []);

  const clearNarrativeOptions = useCallback((): void => {
    setSuggestions([]);
    setShowSuggestions(false);
    setPlotCardPhase("normal");
  }, []);

  const revealNarrativeOptions = useCallback((options: string[]): void => {
    if (options.length === 0) {
      return;
    }
    setSuggestions(options);
    setShowSuggestions(true);
  }, []);

  useEffect(() => {
    if (
      launchStage !== "dashboard" ||
      !userId ||
      phase !== "chat" ||
      selectedWorldId === null ||
      selectedCharacterId === null
    ) {
      return;
    }

    let cancelled = false;
    let typingTimer: number | undefined;

    const runGreetingInit = async (): Promise<void> => {
      setIsInitializingGreeting(true);
      setShowTypingIndicator(false);
      setShowSuggestions(false);
      setSuggestions([]);
      setMessages([]);
      setErrorMessage(null);

      const lastSeenAt = readLastSeenAt(
        selectedWorldId,
        selectedCharacterId,
        activeStoryId,
      );
      const dialogueBehavior = readDialogueBehavior(
        selectedWorldId,
        selectedCharacterId,
        activeStoryId,
      );

      try {
        const result = await initializeChatSession({
          userId,
          worldId: selectedWorldId,
          characterId: selectedCharacterId,
          storyId: activeStoryId,
          questLineId: activeQuestLineIdRef.current ?? undefined,
          lastSeenAt,
          dialogueBehavior: dialogueBehavior as any,
          behaviorSystemPrompt: behaviorSystemPromptRef.current,
        });

        if (cancelled) {
          return;
        }

        setConversationId(result.conversationId);
        if (result.relationshipVector) {
          setTrust(result.relationshipVector.trust);
        }

        const assistantMessages = result.messages.filter(
          (message) => message.role === "assistant",
        );

        // Story-path Cold Open / Quest mission — single high-impact assistant beat.
        if (
          (result.coldOpen || result.questMission) &&
          assistantMessages.length >= 1
        ) {
          const coldOpenMsg = mapStoredMessage(assistantMessages[0]);
          setMessages([]);
          setIsInitializingGreeting(false);
          setShowTypingIndicator(true);
          setPlotCardPhase("story-hybrid");
          clearNarrativeOptions();

          typingTimer = window.setTimeout(() => {
            if (cancelled) {
              return;
            }
            setMessages([coldOpenMsg]);
            setShowTypingIndicator(false);
          }, GREETING_TYPING_DELAY_MS);
          if (result.questMission) {
            setQuestStatus(result.questStatus ?? "PENDING");
            setQuestSessionLoaded(true);
            cliffhangerArmedRef.current = false;
            setNarrativeBeatsSinceUnlock(0);
            narrativeBeatsRef.current = 0;

            void (async () => {
              try {
                const poolMission = await fetchNextPoolMission({
                  worldId: selectedWorldId,
                  afterSequence: 0,
                });
                setMissionSequenceOrder(poolMission.sequenceOrder);
                missionSequenceOrderRef.current = poolMission.sequenceOrder;
                setActiveHardwareMission(mapPoolMissionToHardware(poolMission));
              } catch {
                const starter = getHardwareMissionByIndex(0);
                setHardwareMissionIndex(0);
                hardwareMissionIndexRef.current = 0;
                setMissionSequenceOrder(1);
                missionSequenceOrderRef.current = 1;
                setActiveHardwareMission(starter);
              }
            })();
          }
          writeLastSeenAt(selectedWorldId, selectedCharacterId, activeStoryId);
          return;
        }

        if (result.greeting && assistantMessages.length === 2) {
          const pendingSuggestions = result.suggestions ?? [];
          const secondMsg = mapStoredMessage(assistantMessages[1]);
          const hasPlotCards =
            Array.isArray(secondMsg.plot_cards) && secondMsg.plot_cards.length > 0;

          setMessages([mapStoredMessage(assistantMessages[0])]);
          setIsInitializingGreeting(false);
          setShowTypingIndicator(true);

          typingTimer = window.setTimeout(() => {
            if (cancelled) {
              return;
            }
            setMessages((previous) => [...previous, secondMsg]);
            setShowTypingIndicator(false);
            if (hasPlotCards) {
              setSuggestions(pendingSuggestions);
              setShowSuggestions(false);
              setPlotCardPhase("cards-visible");
            } else {
              revealNarrativeOptions(pendingSuggestions);
            }
          }, GREETING_TYPING_DELAY_MS);
          writeLastSeenAt(selectedWorldId, selectedCharacterId, activeStoryId);
          return;
        }

        if (result.returnPulse && result.messages.length > 0) {
          const priorMessages = result.messages.slice(0, -1).map(mapStoredMessage);
          const pulseMessage = mapStoredMessage(result.messages.at(-1)!);

          setMessages(priorMessages);
          setIsInitializingGreeting(false);
          setShowTypingIndicator(true);

          typingTimer = window.setTimeout(() => {
            if (cancelled) {
              return;
            }
            setMessages((previous) => [...previous, pulseMessage]);
            setShowTypingIndicator(false);
          }, GREETING_TYPING_DELAY_MS);
          writeLastSeenAt(selectedWorldId, selectedCharacterId, activeStoryId);
          return;
        }

        setMessages(result.messages.map(mapStoredMessage));
        setIsInitializingGreeting(false);
        clearNarrativeOptions();
        writeLastSeenAt(selectedWorldId, selectedCharacterId, activeStoryId);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ChatLockedError) {
          applyLock(error.lockedUntil);
        } else {
          const message =
            error instanceof Error ? error.message : "Failed to open chat.";
          setErrorMessage(message);
        }
        setIsInitializingGreeting(false);
        setShowTypingIndicator(false);
        clearNarrativeOptions();
      }
    };

    void runGreetingInit();

    return () => {
      cancelled = true;
      if (typingTimer !== undefined) {
        window.clearTimeout(typingTimer);
      }
    };
  }, [applyLock, launchStage, clearNarrativeOptions, phase, revealNarrativeOptions, selectedCharacterId, selectedWorldId, activeStoryId, userId]);

  const handleQuestComplete = useCallback(
    async (verification: string): Promise<void> => {
      const trimmed = verification.trim();
      if (
        !trimmed ||
        !userId ||
        isSubmittingQuest ||
        selectedWorldId === null ||
        selectedCharacterId === null
      ) {
        return;
      }

      setIsSubmittingQuest(true);
      setQuestCompleteError(null);

      track("continue_clicked", {
        source: "quest_complete",
        characterId: selectedCharacterId,
        worldId: selectedWorldId,
        storyId: activeStoryId,
      });

      try {
        const result = await submitQuestCompletion({
          userId,
          verification: trimmed,
          worldId: selectedWorldId,
          characterId: selectedCharacterId,
          storyId: activeStoryId,
        });

        setQuestStatus(result.questStatus);
        setIsChapterLocked(false);
        setTrust(result.relationshipVector.trust);
        setAffinityBoostNonce((previous) => previous + 1);
        setQuestProgressRefreshNonce((previous) => previous + 1);
        setConversationId(result.conversationId);

        track("quest_mission_completed", {
          characterId: selectedCharacterId,
          worldId: selectedWorldId,
          xpAwarded: result.xpAwarded,
          missionIndex: result.missionIndex,
        });

        const userMessage: ChatMessage = {
          id: createMessageId(),
          role: "user",
          content: trimmed,
        };
        const assistantMessage: ChatMessage = {
          id: String(result.assistantMessageId),
          role: "assistant",
          content: result.narrativeBlock,
        };

        setShowTypingIndicator(true);
        window.setTimeout(() => {
          setMessages((previous) => [...previous, userMessage, assistantMessage]);
          setShowTypingIndicator(false);
          track("first_message_loaded", {
            source: "quest_narrative",
            conversationId: result.conversationId,
            characterId: selectedCharacterId,
            worldId: selectedWorldId,
          });
        }, GREETING_TYPING_DELAY_MS);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Quest verification failed.";
        setQuestCompleteError(message);
      } finally {
        setIsSubmittingQuest(false);
      }
    },
    [
      activeStoryId,
      isSubmittingQuest,
      selectedCharacterId,
      selectedWorldId,
      userId,
    ],
  );

  const activeMissionLineId =
    activeQuestLineId ?? parseQuestLineStoryId(activeStoryId);
  const activeMissionDefinition = activeMissionLineId
    ? getQuestLineDefinition(activeMissionLineId)
    : null;

  const resolvedHardwareMission =
    activeHardwareMission ??
    (questStatus === "PENDING"
      ? getHardwareMissionByIndex(hardwareMissionIndex)
      : null);

  const activeMissionId =
    resolvedHardwareMission?.id ?? activeMissionDefinition?.questLineId ?? null;
  const activeMissionText =
    resolvedHardwareMission?.missionText ??
    activeMissionDefinition?.missionBlock ??
    null;
  const activeMissionSensorKind: HardwareSensorKind =
    resolvedHardwareMission?.sensorKind ?? "camera_environment";
  const activeMissionSensorLabel =
    resolvedHardwareMission?.sensorLabel ?? null;

  useEffect(() => {
    cliffhangerThresholdRef.current = cliffhangerThreshold;
  }, [cliffhangerThreshold]);

  useEffect(() => {
    narrativeBeatsRef.current = narrativeBeatsSinceUnlock;
  }, [narrativeBeatsSinceUnlock]);

  useEffect(() => {
    hardwareMissionIndexRef.current = hardwareMissionIndex;
  }, [hardwareMissionIndex]);

  useEffect(() => {
    missionSequenceOrderRef.current = missionSequenceOrder;
  }, [missionSequenceOrder]);

  useEffect(() => {
    setIsChapterLocked(questStatus === "PENDING");
  }, [questStatus]);

  const mapPoolMissionToHardware = useCallback(
    (pool: {
      id: string;
      missionText: string;
      sensorType: string;
      sequenceOrder: number;
    }): HardwareMission => {
      const sensorLabel =
        pool.sensorType === "LIGHT_SENSOR"
          ? "Light Sensor — Environmental Dark Mode"
          : pool.sensorType === "GYROSCOPE"
            ? "Gyroscope — Focus Mode"
            : "Camera Vision — Hardware Proof";

      return {
        id: pool.id,
        title: `Mission ${pool.sequenceOrder}`,
        sensorKind:
          pool.sensorType === "LIGHT_SENSOR"
            ? "light_night"
            : pool.sensorType === "GYROSCOPE"
              ? "gyro_focus"
              : "camera_environment",
        sensorLabel,
        missionText: pool.missionText,
        validationOpener: DEFAULT_VALIDATION_OPENER,
      };
    },
    [],
  );

  const streamStoryNodeMessages = useCallback(
    async (lines: string[]): Promise<void> => {
      setShowTypingIndicator(true);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        await new Promise<void>((resolve) => {
          window.setTimeout(() => {
            setMessages((previous) => [
              ...previous,
              {
                id: createMessageId(),
                role: "assistant",
                content: line,
              },
            ]);
            resolve();
          }, index === 0 ? GREETING_TYPING_DELAY_MS : 520);
        });
      }
      setShowTypingIndicator(false);
    },
    [],
  );

  const triggerHardwareCliffhanger = useCallback(async (): Promise<void> => {
    if (questStatusRef.current === "PENDING" || cliffhangerInFlightRef.current) {
      return;
    }
    cliffhangerInFlightRef.current = true;

    try {
      let nextMission: HardwareMission;
      let nextSequence = missionSequenceOrderRef.current;

      try {
        const poolMission = await fetchNextPoolMission({
          worldId: selectedWorldId,
          worldType: selectedWorldId
            ? getWorldById(selectedWorldId)?.name
            : undefined,
          afterSequence: missionSequenceOrderRef.current,
        });
        nextSequence = poolMission.sequenceOrder;
        nextMission = mapPoolMissionToHardware(poolMission);
      } catch (error) {
        console.warn(
          "[velvet/content-engine] pool fetch failed, using local fallback:",
          error,
        );
        const nextIndex = getNextHardwareMissionIndex(
          hardwareMissionIndexRef.current,
        );
        nextMission = getHardwareMissionByIndex(nextIndex);
        setHardwareMissionIndex(nextIndex);
        hardwareMissionIndexRef.current = nextIndex;
        nextSequence = nextIndex + 1;
      }

      setMissionSequenceOrder(nextSequence);
      missionSequenceOrderRef.current = nextSequence;
      setActiveHardwareMission(nextMission);
      setQuestStatus("PENDING");
      setIsChapterLocked(true);
      setNarrativeBeatsSinceUnlock(0);
      narrativeBeatsRef.current = 0;
      cliffhangerArmedRef.current = false;

      const freezeTeaser: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: `[ HARDWARE LOCK // ${nextMission.sensorLabel} ]\n${nextMission.missionText}`,
      };
      setMessages((previous) => [...previous, freezeTeaser]);
      clearNarrativeOptions();
    } finally {
      cliffhangerInFlightRef.current = false;
    }
  }, [
    clearNarrativeOptions,
    mapPoolMissionToHardware,
    selectedWorldId,
  ]);

  const handleMissionVerified = useCallback(
    async (payload: MissionGateSuccessPayload): Promise<void> => {
      const mission =
        activeHardwareMission ??
        getHardwareMissionByIndex(hardwareMissionIndexRef.current);

      setHardwareAffinityScore(payload.affinityScore);
      setHardwareStatusTag(payload.statusTag);
      setHardwareArcProgress(payload.arcProgress);
      setQuestStatus("COMPLETED");
      setIsChapterLocked(false);
      setActiveHardwareMission(null);
      setAffinityBoostNonce((previous) => previous + 1);
      setQuestProgressRefreshNonce((previous) => previous + 1);
      setIsGeneratingStoryNode(true);
      setShowTypingIndicator(true);

      const nextThreshold = rollCliffhangerThreshold();
      setCliffhangerThreshold(nextThreshold);
      cliffhangerThresholdRef.current = nextThreshold;
      setNarrativeBeatsSinceUnlock(0);
      narrativeBeatsRef.current = 0;
      cliffhangerArmedRef.current = false;

      const mappedTrust = Math.max(
        -1,
        Math.min(1, payload.affinityScore / 50 - 1),
      );
      setTrust(mappedTrust);

      const worldName =
        selectedWorldId != null
          ? getWorldById(selectedWorldId)?.name
          : "Horror Mystery";
      const characterName =
        selectedCharacterId != null
          ? getCharacterById(selectedCharacterId)?.name
          : "The Watcher";

      let storyLines: string[] = [];
      let shouldDeployNextMission = true;
      try {
        if (!userId) {
          throw new Error("Missing user for story node generation.");
        }
        const node = await generateStoryNode({
          userId,
          missionText: mission.missionText,
          watcherFeedback: payload.feedback,
          characterName: characterName ?? "The Watcher",
          worldType: worldName ?? "Horror Mystery",
          arcId: "arc_1",
          sequenceOrder: missionSequenceOrderRef.current || undefined,
          arcProgress: payload.arcProgress,
          affinityScore: payload.affinityScore,
          statusTag: payload.statusTag,
        });
        storyLines = node.messages;
        // Chapter 3 ends the first-session arc — hold MissionGate until tomorrow sync.
        if (node.nextMissionSequence === null && node.source === "seed") {
          shouldDeployNextMission = false;
        }
      } catch (error) {
        console.warn("[velvet/content-engine] story node failed:", error);
        storyLines = [
          payload.feedback,
          mission.validationOpener || DEFAULT_VALIDATION_OPENER,
          "Channel restored. Proof accepted. The next story node begins now.",
          "Stay sharp — something on the other side of the glass just shifted.",
          "Do not look away. The next lock is already listening.",
        ];
      } finally {
        setIsGeneratingStoryNode(false);
      }

      await streamStoryNodeMessages(storyLines);

      setQuestStatus("UNLOCKED");
      cliffhangerArmedRef.current = shouldDeployNextMission;
      if (shouldDeployNextMission) {
        window.setTimeout(() => {
          void triggerHardwareCliffhanger();
        }, 900);
      }

      track("first_message_loaded", {
        source: "quest_narrative",
        characterId: selectedCharacterId ?? undefined,
        worldId: selectedWorldId ?? undefined,
      });

      if (selectedCharacterId != null && selectedWorldId != null) {
        track("quest_mission_completed", {
          characterId: selectedCharacterId,
          worldId: selectedWorldId,
          xpAwarded: 10,
          missionIndex: missionSequenceOrderRef.current || 1,
        });
      }
    },
    [
      activeHardwareMission,
      selectedCharacterId,
      selectedWorldId,
      streamStoryNodeMessages,
      triggerHardwareCliffhanger,
      userId,
    ],
  );

  useEffect(() => {
    if (
      launchStage !== "dashboard" ||
      !userId ||
      phase !== "chat" ||
      selectedWorldId === null ||
      selectedCharacterId === null
    ) {
      return;
    }

    const stampSession = (): void => {
      writeLastSeenAt(selectedWorldId, selectedCharacterId, activeStoryId);
    };

    const handleVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        stampSession();
      }
    };

    window.addEventListener("beforeunload", stampSession);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stampSession();
      window.removeEventListener("beforeunload", stampSession);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [launchStage, phase, selectedWorldId, selectedCharacterId, activeStoryId, userId]);

  const sendChatMessage = useCallback(
    async (
      messageText: string,
      options?: { isOptionSelection?: boolean },
    ): Promise<void> => {
      const trimmed = messageText.trim();
      if (
        !trimmed ||
        !userIdRef.current ||
        isStreaming ||
        isInitializingGreeting ||
        showTypingIndicator ||
        plotCardPhaseRef.current === "cards-visible" ||
        lockState !== null ||
        questStatusRef.current === "PENDING" ||
        selectedWorldId === null ||
        selectedCharacterId === null
      ) {
        return;
      }

      const wasFreePlay = plotCardPhaseRef.current === "free-play";
      const wasStoryHybrid = plotCardPhaseRef.current === "story-hybrid";

      if (wasStoryHybrid || wasFreePlay) {
        setSuggestions([]);
        setShowSuggestions(false);
        if (wasFreePlay) {
          setPlotCardPhase("free-play");
        } else {
          setPlotCardPhase("normal");
        }
      } else {
        clearNarrativeOptions();
      }
      setErrorMessage(null);
      setInputValue("");

      const reactionNote = pendingReactionNoteRef.current;
      pendingReactionNoteRef.current = null;

      const userMessage: ChatMessage = {
        id: createMessageId(),
        role: "user",
        content: trimmed,
      };

      const assistantMessageId = createMessageId();
      streamingMessageIdRef.current = assistantMessageId;

      setMessages((previous) => [
        ...previous,
        userMessage,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          streaming: true,
        },
      ]);

      setIsStreaming(true);

      // Prepend the reaction metadata note to the message payload when present.
      // The backend passes this through the LLM context so Groq's next reply
      // acknowledges the player's emotional signal without a visible UI label.
      const messageWithReaction = reactionNote
        ? `${reactionNote}\n\n${trimmed}`
        : trimmed;

      try {
        await streamChatCompletion(
          {
            userId: userIdRef.current,
            worldId: selectedWorldId,
            characterId: selectedCharacterId,
            message: messageWithReaction,
            storyId: activeStoryIdRef.current,
            behaviorSystemPrompt: behaviorSystemPromptRef.current,
            isOptionSelection: options?.isOptionSelection,
          },
          {
            onMeta: (event) => {
              setConversationId(event.conversationId);
              setTrust(event.relationshipVector.trust);
              if (event.cliffhanger && event.lockedUntil) {
                applyLock(event.lockedUntil);
                clearNarrativeOptions();
              }
            },
            onToken: (token) => {
              setMessages((previous) =>
                previous.map((message) =>
                  message.id === assistantMessageId
                    ? {
                        ...message,
                        content: message.content + token,
                      }
                    : message,
                ),
              );
            },
            onDone: (fullContent) => {
              setMessages((previous) =>
                previous.map((message) =>
                  message.id === assistantMessageId
                    ? {
                        ...message,
                        content: fullContent,
                        streaming: false,
                      }
                    : message,
                ),
              );

              const status = questStatusRef.current;
              if (
                cliffhangerArmedRef.current &&
                (status === "UNLOCKED" || status === "COMPLETED" || status === "NONE")
              ) {
                const nextBeats = narrativeBeatsRef.current + 1;
                narrativeBeatsRef.current = nextBeats;
                setNarrativeBeatsSinceUnlock(nextBeats);
                if (nextBeats >= cliffhangerThresholdRef.current) {
                  window.setTimeout(() => {
                    void triggerHardwareCliffhanger();
                  }, 420);
                }
              }
            },
            onOptions: (optionSuggestions) => {
              if (
                plotCardPhaseRef.current === "free-play" ||
                activeStoryIdRef.current === "vanilla"
              ) {
                return;
              }
              revealNarrativeOptions([...optionSuggestions]);
              if (plotCardPhaseRef.current === "story-hybrid") {
                setPlotCardPhase("story-hybrid");
                setShowSuggestions(true);
              }
            },
            onError: (message) => {
              setErrorMessage(message);
              setMessages((previous) =>
                previous.filter((message) => message.id !== assistantMessageId),
              );
            },
          },
        );
      } catch (error) {
        if (error instanceof ChatLockedError) {
          applyLock(error.lockedUntil);
          setMessages((previous) =>
            previous.filter((message) => message.id !== assistantMessageId),
          );
        } else {
          const message =
            error instanceof Error ? error.message : "Something went wrong.";
          setErrorMessage(message);
          setMessages((previous) =>
            previous.filter((message) => message.id !== assistantMessageId),
          );
        }
      } finally {
        streamingMessageIdRef.current = null;
        setIsStreaming(false);
      }
    },
    [
      applyLock,
      clearNarrativeOptions,
      isInitializingGreeting,
      isStreaming,
      lockState,
      revealNarrativeOptions,
      selectedCharacterId,
      selectedWorldId,
      showTypingIndicator,
      triggerHardwareCliffhanger,
    ],
  );

  const handleSendMessage = useCallback((): void => {
    void sendChatMessage(inputValue);
  }, [inputValue, sendChatMessage]);

  const handleOptionSelect = useCallback(
    (text: string): void => {
      if (selectedWorldId !== null && selectedCharacterId !== null) {
        const choiceIndex = suggestions.findIndex(
          (option) => option.trim() === text.trim(),
        ) as 0 | 1 | -1;
        if (choiceIndex === 0 || choiceIndex === 1) {
          recordDialogueChoice(
            selectedWorldId,
            selectedCharacterId,
            activeStoryIdRef.current,
            text,
            choiceIndex,
          );
        }
      }
      clearNarrativeOptions();
      void sendChatMessage(text, { isOptionSelection: true });
    },
    [clearNarrativeOptions, sendChatMessage, selectedCharacterId, selectedWorldId, suggestions],
  );

  const handleDirectorContinue = useCallback((): void => {
    if (suggestions.length > 0) {
      clearNarrativeOptions();
      void sendChatMessage(suggestions[0]);
      return;
    }
    void sendChatMessage("Keep going — I'm listening.");
  }, [clearNarrativeOptions, sendChatMessage, suggestions]);

  const handleInputChange = useCallback(
    (value: string): void => {
      if (value.trim().length > 0 && suggestions.length > 0) {
        clearNarrativeOptions();
      }
      setInputValue(value);
    },
    [clearNarrativeOptions, suggestions.length],
  );

  const handleUnlockIntent = useCallback(async (): Promise<void> => {
    if (selectedWorldId === null || isUnlocking || !userId) {
      return;
    }

    setIsUnlocking(true);
    setErrorMessage(null);

    try {
      const result = await recordUnlockIntent({ userId, worldId: selectedWorldId });
      setConversationId(result.conversationId);
      setLockState(null);
      setPremiumModalMessage(result.message);
      setShowPremiumModal(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unlock request failed.";
      setErrorMessage(message);
    } finally {
      setIsUnlocking(false);
    }
  }, [isUnlocking, selectedWorldId, userId]);

  const handleSelectLobbyWorld = useCallback((worldId: number): void => {
    track("world_selected", { worldId });
    setSelectedWorldId(worldId);
  }, []);

  const handleContinueFromLobby = useCallback((): void => {
    if (selectedWorldId === null) {
      return;
    }

    const world = getWorldById(selectedWorldId);
    if (world?.questLineId) {
      setActiveQuestLineId(world.questLineId);
      writeActiveQuestLineId(world.questLineId);
      track("quest_line_selected", {
        questLineId: world.questLineId,
        worldId: selectedWorldId,
      });
    } else {
      setActiveQuestLineId(null);
      writeActiveQuestLineId(null);
    }

    setSelectedCharacterId(null);
    setDashboardView("characters");
    instantDashboardMountRef.current = false;
  }, [selectedWorldId]);

  const isRecruitingQuestmasterRef = useRef(false);
  const [isRecruitingQuestmaster, setIsRecruitingQuestmaster] = useState(false);
  const [recruitError, setRecruitError] = useState<string | null>(null);

  const handleSelectLobbyCharacter = useCallback(
    async (characterId: number, worldId: number): Promise<void> => {
      if (isRecruitingQuestmasterRef.current) {
        console.warn("[velvet/recruit] ignored click — recruitment already in flight");
        return;
      }

      let resolvedUserId = userId;
      if (!resolvedUserId) {
        try {
          const { data } = await getSupabaseBrowser().auth.getSession();
          resolvedUserId = data.session?.user?.id ?? null;
        } catch (error) {
          console.warn("[velvet/recruit] session lookup failed:", error);
        }
      }

      if (!resolvedUserId) {
        const message =
          "Session missing — sign in again before choosing a questmaster.";
        console.error("[velvet/recruit]", message, { characterId, worldId });
        setRecruitError(message);
        setErrorMessage(message);
        if (typeof window !== "undefined") {
          window.alert(message);
        }
        return;
      }

      isRecruitingQuestmasterRef.current = true;
      setIsRecruitingQuestmaster(true);
      setRecruitError(null);
      setErrorMessage(null);

      try {
        console.info("[velvet/recruit] starting", {
          userId: resolvedUserId,
          characterId,
          worldId,
        });
        const questLineId = activeQuestLineIdRef.current;

        const recruitment = await recruitQuestmaster({
          userId: resolvedUserId,
          worldId,
          characterId,
          questLineId,
        });

        if (recruitment.degraded) {
          console.warn(
            "[velvet/recruit] degraded success:",
            recruitment.warnings ?? [],
          );
        }

        track("character_selected", { characterId });
        track("questmaster_recruited", {
          characterId: recruitment.mentorCharacterId,
          worldId: recruitment.worldId,
          questLineId: recruitment.questLineId ?? "none",
          sessionState: recruitment.sessionState,
        });

        clearChatSessionState();
        setRecruitError(null);
        setErrorMessage(null);

        if (recruitment.questLineId) {
          setActiveQuestLineId(recruitment.questLineId);
          writeActiveQuestLineId(recruitment.questLineId);
          setPlotCardPhase("story-hybrid");
          track("quest_line_onboarding_started", {
            questLineId: recruitment.questLineId,
            characterId,
            worldId,
          });
        } else {
          setPlotCardPhase("normal");
        }

        setActiveStoryId(recruitment.storyId);
        setActiveStoryTitle(null);
        setConversationId(
          recruitment.conversationId > 0 ? recruitment.conversationId : null,
        );
        setSelectedCharacterId(recruitment.mentorCharacterId || characterId);
        setSelectedWorldId(recruitment.worldId || worldId);
        setIsChapterLocked(false);
        setQuestStatus("UNLOCKED");
        setDashboardView("chat");
        setPhase("chat");
        setCurrentTab("character");
        instantDashboardMountRef.current = false;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to recruit questmaster.";
        console.error("[velvet/recruit] failed:", message, error);
        setRecruitError(message);
        setErrorMessage(message);
        if (typeof window !== "undefined") {
          window.alert(`Questmaster sync failed: ${message}`);
        }
      } finally {
        isRecruitingQuestmasterRef.current = false;
        setIsRecruitingQuestmaster(false);
      }
    },
    [clearChatSessionState, userId],
  );

  const handleBackToGenres = useCallback((): void => {
    clearChatSessionState();
    setDashboardView("lobby");
    setSelectedWorldId(null);
    setSelectedCharacterId(null);
    setPhase("dashboard");
    instantDashboardMountRef.current = false;
  }, [clearChatSessionState]);

  const handleBackToCharacters = useCallback((): void => {
    clearChatSessionState();
    setDashboardView("characters");
    setSelectedCharacterId(null);
    setPhase("dashboard");
    instantDashboardMountRef.current = false;
  }, [clearChatSessionState]);

  const handleDashboardStorySwitch = useCallback(
    (storyId: string): void => {
      setActiveStoryId(storyId);
      setActiveStoryTitle(
        getStoryById(selectedCharacterId ?? 0, storyId)?.title ?? null,
      );
    },
    [selectedCharacterId],
  );

  const handleEnterNarrative = useCallback((): void => {
    if (selectedWorldId === null || selectedCharacterId === null) {
      return;
    }
    setDashboardView("chat");
    setPhase("chat");
    setCurrentTab("character");
    instantDashboardMountRef.current = false;
  }, [selectedCharacterId, selectedWorldId]);

  const handleSignOut = useCallback(async (): Promise<void> => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, SIGN_OUT_TRANSITION_MS);
    });

    await signOut();

    clearPersistedNavigationState();
    navigationHydratedRef.current = false;
    skipNavigationPersistRef.current = true;
    setPhase("splash");
    setSelectedWorldId(null);
    setSelectedCharacterId(null);
    setMessages([]);
    setLockState(null);
    setErrorMessage(null);
    setInputValue("");
    setIsInitializingGreeting(false);
    setShowTypingIndicator(false);
    setSuggestions([]);
    setShowSuggestions(false);
    setTrust(0);
    setShowPremiumModal(false);
    setActiveStoryId("default");
    setActiveStoryTitle(null);
    setActiveQuestLineId(null);
    writeActiveQuestLineId(null);
    setPlotCardPhase("normal");
    setIsRerollingPlotCards(false);
    setCurrentTab("character");
    setConversationId(null);
    setDashboardView("lobby");
    instantDashboardMountRef.current = false;
    setLaunchStage("login-gate");
    setIsSigningOut(false);
  }, [isSigningOut, signOut]);

  const handleSelectCharacter = useCallback((characterId: number): void => {
    clearChatSessionState();
    setSelectedCharacterId(characterId);
    setPlotCardPhase("cards-visible");
    setPhase("chat");
    setCurrentTab("character");
  }, [clearChatSessionState]);

  const handlePlotCardReroll = useCallback(async (): Promise<void> => {
    if (
      isRerollingPlotCards ||
      selectedWorldId === null ||
      selectedCharacterId === null ||
      !userId
    ) {
      return;
    }

    const deckMessage = messages.find(
      (message) => Array.isArray(message.plot_cards) && message.plot_cards.length > 0,
    );
    const excludeCardIds = deckMessage?.plot_cards?.map((card) => card.card_id);

    setIsRerollingPlotCards(true);
    setErrorMessage(null);

    try {
      const freshCards = await rerollPlotCards({
        userId,
        worldId: selectedWorldId,
        characterId: selectedCharacterId,
        excludeCardIds,
        dialogueBehavior: readDialogueBehavior(
          selectedWorldId,
          selectedCharacterId,
          activeStoryIdRef.current,
        ) as any,
      });

      setMessages((previous) =>
        previous.map((message) =>
          message.plot_cards ? { ...message, plot_cards: freshCards } : message,
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to re-roll timelines.";
      setErrorMessage(message);
    } finally {
      setIsRerollingPlotCards(false);
    }
  }, [isRerollingPlotCards, messages, selectedCharacterId, selectedWorldId, userId]);

  const handlePlotCardSelect = useCallback((card: PlotCard): void => {
    setActiveStoryId(card.card_id);
    setActiveStoryTitle(card.title);
    setIsRerollingPlotCards(false);
    // Remove the deck from the message thread
    setMessages((previous) =>
      previous.map((message) =>
        message.plot_cards ? { ...message, plot_cards: undefined } : message,
      ),
    );
    // Queue the story context for Groq on the next send
    pendingReactionNoteRef.current = `[System Metadata: Player just chose the "${card.title}" story timeline (${card.theme} theme). "${card.teaser}" — Immediately acknowledge this choice naturally in character and advance the story aggressively in this direction without breaking immersion or explaining the mechanic.]`;
    // Switch to 3-way hybrid layout — A/B options + inline write-your-own
    setShowSuggestions(true);
    setPlotCardPhase("story-hybrid");
  }, []);

  const handlePlotCardSkip = useCallback((): void => {
    setMessages((previous) =>
      previous.map((message) =>
        message.plot_cards ? { ...message, plot_cards: undefined } : message,
      ),
    );
    setActiveStoryTitle(null);
    setActiveStoryId("vanilla");
    setSuggestions([]);
    setShowSuggestions(false);
    setPlotCardPhase("free-play");
    setIsRerollingPlotCards(false);
  }, []);

  const handleSwitchStory = useCallback((storyId: string): void => {
    // Re-opening the already-active arc simply routes back to the Chat Window
    // and must never wipe the live conversation.
    if (storyId === activeStoryIdRef.current) {
      setCurrentTab("character");
      setPhase("chat");
      return;
    }
    clearChatSessionState();
    setActiveStoryId(storyId);
    setActiveStoryTitle(getStoryById(selectedCharacterId ?? 0, storyId)?.title ?? null);
    setCurrentTab("character");
    setPhase("chat");
  }, [clearChatSessionState, selectedCharacterId]);

  const handleReactBoost = useCallback((): void => {
    // +10 trust boost (clamped to 1.0)
    setTrust((previous) => Math.min(1, previous + 0.1));
    // Queue metadata for injection into the next outbound message payload
    pendingReactionNoteRef.current =
      "[System Metadata: User just reacted with intense visual passion and excitement to your last dialogue. Acknowledge their non-verbal emotional signal naturally in your next reply — flirt back, tease, or show you noticed — without breaking character or explaining the mechanic.]";
  }, []);

  const handleExploreWorld = useCallback((worldId: number): void => {
    track("world_selected", { worldId });
    clearChatSessionState();
    setSelectedWorldId(worldId);
    setSelectedCharacterId(null);
    setDashboardView("characters");
    setPhase("dashboard");
    setCurrentTab("character");
  }, [clearChatSessionState]);

  const handleThemeToggle = useCallback((origin: ThemeToggleOrigin): void => {
    const nextTheme: AppTheme = appTheme === "dark" ? "light" : "dark";
    setThemeRipple({ ...origin, targetTheme: nextTheme });
    window.setTimeout(() => {
      setAppTheme(nextTheme);
    }, 80);
    window.setTimeout(() => {
      setThemeRipple(null);
    }, 920);
  }, [appTheme]);

  const handleBackToWorlds = useCallback((): void => {
    clearChatSessionState();
    setDashboardView("lobby");
    setPhase("dashboard");
    setSelectedWorldId(null);
    setSelectedCharacterId(null);
  }, [clearChatSessionState]);

  const handleStoryModeSelect = useCallback(
    (storyId: string, _instruction: string): void => {
      // Selecting a story path must hard-boot a Cold Open conversation —
      // wipe the current thread and re-enter chat so /api/chat/init injects
      // the pre-written opening scene as assistant[0].
      if (storyId === activeStoryIdRef.current && messages.length > 0) {
        setCurrentTab("character");
        setPhase("chat");
        return;
      }
      clearChatSessionState();
      setActiveStoryId(storyId);
      setActiveStoryTitle(
        getStoryById(selectedCharacterId ?? 0, storyId)?.title ?? null,
      );
      setPlotCardPhase("story-hybrid");
      setCurrentTab("character");
      setPhase("chat");
    },
    [clearChatSessionState, messages.length, selectedCharacterId],
  );

  const handleReactionModifier = useCallback((instruction: string): void => {
    // Locks the chosen emotional modifier onto the next outbound message using
    // the existing hidden reaction-note channel — no send function is altered.
    pendingReactionNoteRef.current = instruction;
  }, []);

  if (!isMounted) {
    return (
      <main className="fixed inset-0 w-full h-[100dvh] bg-black flex flex-col justify-between p-4 overflow-hidden touch-none overscroll-none">
        <div className="pointer-events-none absolute inset-0 z-0 bg-black opacity-90" aria-hidden="true" />
      </main>
    );
  }

  const showAppBottomNav =
    (showDashboard && navigationResolution.resolvedDashboardView !== "chat") ||
    showChatShell;
  const bottomNavCharacterName =
    navigationResolution.character?.name.split(" ")[0] ?? "World";

  return (
    <main
      className={`fixed inset-0 w-full h-[100dvh] bg-black flex flex-col overflow-hidden overscroll-none ${
        showChatShell ? "touch-auto p-0" : "touch-none justify-between p-4"
      } ${appTheme === "light" ? "velvet-theme-light" : "velvet-theme-dark"}`}
    >
      {showLaunchSplash && <CinematicLaunchSplash isExiting={isSplashExiting} />}

      {showLoginGate && (
        <ExecutiveBentoLoginGate
          isAuthenticating={isAuthenticating}
          authError={authError}
          onGoogleSignIn={() => {
            void signInWithGoogle();
          }}
        />
      )}

      {showDashboard && navigationResolution.resolvedDashboardView !== "chat" && (
        <div
          className={`relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden ${
            isSigningOut ? "auth-app-exit pointer-events-none" : ""
          }`}
        >
          <div
            className={`h-full min-h-0 flex-1 overflow-hidden ${
              navigationResolution.resolvedDashboardView === "lobby" ||
              navigationResolution.resolvedDashboardView === "characters"
                ? ""
                : `${VIEWPORT_SCROLL_CHANNEL_CLASS} px-4`
            }`}
            style={
              navigationResolution.resolvedDashboardView === "lobby" ||
              navigationResolution.resolvedDashboardView === "characters"
                ? undefined
                : VIEWPORT_SCROLL_TOUCH_STYLE
            }
          >
            <ExecutiveNarrativeDashboard
              dashboardView={navigationResolution.resolvedDashboardView}
              selectedCharacter={navigationResolution.character}
              selectedWorld={navigationResolution.world}
              selectedWorldId={selectedWorldId}
              messages={messages}
              lockState={lockState}
              activeStoryId={activeStoryId}
              userId={userId}
              trust={trust}
              instantMount={instantDashboardMountRef.current}
              isRecruitingQuestmaster={isRecruitingQuestmaster}
              recruitError={recruitError}
              onSelectLobbyWorld={handleSelectLobbyWorld}
              onContinueFromLobby={handleContinueFromLobby}
              onSelectLobbyCharacter={handleSelectLobbyCharacter}
              onBackToGenres={handleBackToGenres}
              onBackToCharacters={handleBackToCharacters}
              onSwitchStory={handleDashboardStorySwitch}
              onEnterNarrative={handleEnterNarrative}
            />
          </div>
        </div>
      )}

      {showChatShell && navigationResolution.world && navigationResolution.character && (
        <div
          className={`relative flex h-full min-h-0 w-full flex-1 touch-pan-y flex-col ${
            isSigningOut ? "auth-app-exit pointer-events-none" : ""
          }`}
        >
      {themeRipple && (
        <div
          className={`theme-ripple-mask ${
            themeRipple.targetTheme === "light"
              ? "theme-ripple-mask-to-light"
              : "theme-ripple-mask-to-dark"
          }`}
          style={
            {
              "--ripple-x": `${themeRipple.x}px`,
              "--ripple-y": `${themeRipple.y}px`,
            } as CSSProperties
          }
          aria-hidden="true"
        />
      )}
      {showPremiumModal && (
        <PremiumUnlockModal
          message={premiumModalMessage}
          onClose={() => setShowPremiumModal(false)}
        />
      )}

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {navigationResolution.resolvedPhase === "chat" && (
        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <SpatialTabViewport>
            <SpatialTabCharacterLayer currentTab={currentTab}>
              <ChatScreen
                world={navigationResolution.world!}
                character={navigationResolution.character!}
                messages={messages}
                inputValue={inputValue}
                isStreaming={isStreaming}
                isInitializingGreeting={isInitializingGreeting}
                showTypingIndicator={showTypingIndicator || isGeneratingStoryNode}
                narrativeOptions={suggestions}
                showNarrativeOptions={showSuggestions}
                trust={trust}
                lockState={lockState}
                countdown={countdown}
                errorMessage={errorMessage}
                onInputChange={handleInputChange}
                onSend={handleSendMessage}
                onOptionSelect={handleOptionSelect}
                onDirectorContinue={handleDirectorContinue}
                onUnlockClick={() => {
                  void handleUnlockIntent();
                }}
                isUnlocking={isUnlocking}
                hasBottomNav
                onReactBoost={handleReactBoost}
                onPlotCardSelect={handlePlotCardSelect}
                onPlotCardSkip={handlePlotCardSkip}
                onPlotCardReroll={() => {
                  void handlePlotCardReroll();
                }}
                isRerollingPlotCards={isRerollingPlotCards}
                activeStoryTitle={activeStoryTitle}
                activeStoryId={activeStoryId}
                plotCardPhase={plotCardPhase}
                onDismissWriteOwn={clearNarrativeOptions}
                onStoryModeSelect={handleStoryModeSelect}
                onReactionModifier={handleReactionModifier}
                storyPaths={characterStoryPaths}
                questStatus={questStatus}
                questSessionLoaded={questSessionLoaded}
                isSubmittingQuest={isSubmittingQuest}
                questCompleteError={questCompleteError}
                onQuestComplete={handleQuestComplete}
                affinityBoostNonce={affinityBoostNonce}
                userId={userId}
                missionId={activeMissionId}
                missionText={activeMissionText}
                missionSensorKind={activeMissionSensorKind}
                missionSensorLabel={activeMissionSensorLabel}
                isChapterLocked={isChapterLocked}
                hardwareAffinityScore={hardwareAffinityScore}
                hardwareStatusTag={hardwareStatusTag}
                onMissionVerified={handleMissionVerified}
              />
            </SpatialTabCharacterLayer>
            <SpatialTabSurfaceLayer tabId="world" currentTab={currentTab}>
              <WorldExplorerTab
                activeWorldId={navigationResolution.world!.id}
                theme={appTheme}
                onExploreWorld={handleExploreWorld}
              />
            </SpatialTabSurfaceLayer>
            <SpatialTabSurfaceLayer tabId="memories" currentTab={currentTab}>
              <MemoriesVaultTab
                character={navigationResolution.character!}
                trust={trust}
                messages={messages}
                conversationId={conversationId}
                worldId={selectedWorldId ?? 0}
                activeStoryId={activeStoryId}
                userId={userId}
                isTabActive={currentTab === "memories"}
                progressRefreshNonce={questProgressRefreshNonce}
                hardwareAffinityScore={hardwareAffinityScore}
                hardwareStatusTag={hardwareStatusTag}
                hardwareArcProgress={hardwareArcProgress}
              />
            </SpatialTabSurfaceLayer>
            <SpatialTabSurfaceLayer tabId="stories" currentTab={currentTab}>
              <StoriesTimelineTab
                character={navigationResolution.character!}
                messages={messages}
                lockState={lockState}
                activeStoryId={activeStoryId}
                userId={userId}
                worldId={selectedWorldId ?? 0}
                trust={trust}
                isTabActive={currentTab === "stories"}
                progressRefreshNonce={questProgressRefreshNonce}
                hardwareArcProgress={hardwareArcProgress}
                onSwitchStory={handleSwitchStory}
              />
            </SpatialTabSurfaceLayer>
            <SpatialTabSurfaceLayer tabId="you" currentTab={currentTab}>
              <YouProfileTab
                theme={appTheme}
                email={userEmail}
                onSignOut={() => {
                  void handleSignOut();
                }}
                onThemeToggle={handleThemeToggle}
              />
            </SpatialTabSurfaceLayer>
          </SpatialTabViewport>
        </div>
      )}
      </div>
        </div>
      )}

      {showAppBottomNav && (
        <BottomNavBar
          currentTab={currentTab}
          characterFirstName={bottomNavCharacterName}
          theme={appTheme}
          onTabChange={setCurrentTab}
        />
      )}
    </main>
  );
}
