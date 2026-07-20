export type UserTier = "free" | "premium" | "enterprise";

export interface User {
  id: string;
  email: string;
  tier: UserTier;
}

export interface World {
  id: number;
  name: string;
  description: string;
  genre: string;
  created_at: string;
}

export interface Character {
  id: number;
  world_id: number;
  name: string;
  avatar_url: string | null;
  system_prompt: string;
  personality: string;
  created_at: string;
}

export interface Conversation {
  id: number;
  user_id: string;
  world_id: number;
  character_id?: number | null;
  story_id?: string;
  locked_until: string | null;
  payment_intent_clicks: number;
  created_at: string;
  updated_at: string;
  last_phantom_pulse_at?: string | null;
  last_proactive_ping_at?: string | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  character_id: number | null;
  content: string;
  audio_url?: string | null;
  image_url?: string | null;
  created_at: string;
}

export type MediaType = "text" | "audio" | "image" | "mixed";

export interface MessageMediaPayload {
  audio_url?: string;
  image_url?: string;
  media_type?: MediaType;
}

export interface GlobalNarrativeMessage {
  id: number;
  conversation_id: number;
  character_id: number | null;
  content: string;
  audio_url?: string | null;
  image_url?: string | null;
  created_at: string;
  character_name: string | null;
  user_id: string;
}

export interface RelationshipVector {
  trust: number;
  tension: number;
  intimacy: number;
  hostility: number;
  affinity: number;
}

/** Hidden avatar affect tracker (0–100). Internal — not shown as UI meters. */
export interface EmotionalStateSnapshot {
  anger: number;
  lust: number;
  pride: number;
  trauma: number;
  affection: number;
  dominant: "anger" | "lust" | "pride" | "trauma" | "affection";
  twistActive: boolean;
}

export interface NarrativeContextEntry {
  role: "user" | "assistant";
  speaker: string;
  content: string;
  timestamp: string;
}

export interface ChatRequestBody {
  userId: string;
  worldId: number;
  characterId: number;
  message: string;
  storyId?: string;
  behaviorSystemPrompt?: string;
  isOptionSelection?: boolean;
}

export interface ChatInitRequestBody {
  userId: string;
  worldId: number;
  characterId: number;
  storyId?: string;
  questLineId?: string;
  lastSeenAt?: string;
  behaviorSystemPrompt?: string;
  dialogueBehavior?: {
    lastChoiceIndex: 0 | 1 | null;
    lastChoiceText: string | null;
    stance: "cold" | "warm" | "neutral" | "defiant" | "flirtatious";
    consecutiveColdChoices: number;
  };
}

export interface PlotCardPayload {
  card_id: string;
  title: string;
  teaser: string;
  theme: string;
}

export interface ChatInitMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  characterId: number | null;
  audio_url?: string;
  image_url?: string;
  media_type?: MediaType;
  plot_cards?: PlotCardPayload[];
}

export interface ChatInitResponse {
  conversationId: number;
  greeting: boolean;
  /** True when the first assistant message is a pre-written story cold open. */
  coldOpen?: boolean;
  /** True when the first assistant message is a real-life quest mission block. */
  questMission?: boolean;
  questLineId?: string;
  /** Set to PENDING when a quest mission block locks chat input. */
  questStatus?: "PENDING" | "COMPLETED" | "UNLOCKED" | "NONE";
  messages: ChatInitMessage[];
  suggestions: string[];
  relationshipVector?: RelationshipVector;
  returnPulse?: boolean;
}

export interface SseMetaEvent {
  type: "meta";
  conversationId: number;
  messageCount: number;
  cliffhanger: boolean;
  lockedUntil: string | null;
  relationshipVector: RelationshipVector;
  emotionalState?: EmotionalStateSnapshot;
}

export interface SseTokenEvent {
  type: "token";
  content: string;
}

export interface SseDoneEvent {
  type: "done";
  fullContent: string;
  audio_url?: string;
  image_url?: string;
  media_type?: MediaType;
}

export interface SseOptionsEvent {
  type: "options";
  suggestions: [string, string];
}

export interface SseErrorEvent {
  type: "error";
  message: string;
}

export type SseEvent =
  | SseMetaEvent
  | SseTokenEvent
  | SseDoneEvent
  | SseOptionsEvent
  | SseErrorEvent;

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmStreamChunk {
  content: string;
  done: boolean;
}

export type LlmProvider = "groq" | "together";
