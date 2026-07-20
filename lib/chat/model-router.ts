import { getRetentionPhase, type RetentionPhase } from "@/lib/chat/narrative-intelligence";
import {
  FOUNDATION_MODEL,
  SLM_MODEL,
  TOGETHER_SLM_MODEL,
} from "@/lib/chat/constants";
import type { RelationshipVector } from "@/lib/types/database";

export type InferenceTier = "slm" | "foundation";
export type InferenceProvider = "groq" | "together";

export interface InferenceRoute {
  tier: InferenceTier;
  provider: InferenceProvider;
  model: string;
}

export interface RoutingContext {
  userMessage: string;
  messageCount: number;
  relationshipVector: RelationshipVector;
  isOptionSelection?: boolean;
}

const BINARY_OPTION_PATTERN =
  /^(option\s*[ab12]|yes|no|maybe|continue|stay|leave|agree|refuse)\b/i;

function isBinaryChoiceDialog(userMessage: string): boolean {
  const trimmed = userMessage.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (trimmed.length <= 96) {
    return true;
  }
  if (BINARY_OPTION_PATTERN.test(trimmed)) {
    return true;
  }
  if (!trimmed.includes("?") && trimmed.split(/\s+/).length <= 14) {
    return true;
  }
  return false;
}

function isHighAffinityPlotTwist(ctx: RoutingContext): boolean {
  const phase = getRetentionPhase(ctx.messageCount);
  if (phase === "climax" || phase === "approaching") {
    return true;
  }

  const { affinity, tension, trust } = ctx.relationshipVector;
  return affinity >= 72 && tension >= 55 && trust >= 45;
}

export function resolveInferenceRoute(ctx: RoutingContext): InferenceRoute {
  const togetherKey = process.env.TOGETHER_API_KEY?.trim();
  const useTogetherSlm = Boolean(togetherKey);

  if (isHighAffinityPlotTwist(ctx)) {
    return {
      tier: "foundation",
      provider: "groq",
      model: FOUNDATION_MODEL,
    };
  }

  const isLowTierTurn =
    ctx.isOptionSelection ||
    isBinaryChoiceDialog(ctx.userMessage) ||
    ctx.messageCount <= 12;

  if (isLowTierTurn) {
    if (useTogetherSlm) {
      return {
        tier: "slm",
        provider: "together",
        model: TOGETHER_SLM_MODEL,
      };
    }
    return {
      tier: "slm",
      provider: "groq",
      model: SLM_MODEL,
    };
  }

  return {
    tier: "foundation",
    provider: "groq",
    model: FOUNDATION_MODEL,
  };
}

export function getRetentionPhaseForCount(messageCount: number): RetentionPhase {
  return getRetentionPhase(messageCount);
}
