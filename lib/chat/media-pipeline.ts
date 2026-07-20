import {
  generateLiveImage,
  generateLiveVoice,
  requireElevenLabsApiKey,
  requireFalApiKey,
  resolveCharacterVoiceId,
} from "@/lib/chat/media-engine";
import { resolveMediaType } from "@/lib/chat/media-types";
import type { MediaType, MessageMediaPayload } from "@/lib/types/database";

export type TurnMediaKind = "voice" | "image";

/**
 * Turn schedule (production):
 * - Turn 2, 4, 8… (even, not divisible by 3) → ElevenLabs voice note
 * - Turn 3, 6, 9… (multiples of 3) → Fal.ai cinematic image + text
 */
export function getAssistantTurnMediaKind(
  assistantTurnNumber: number,
): TurnMediaKind | null {
  if (assistantTurnNumber <= 1) {
    return null;
  }

  if (assistantTurnNumber % 3 === 0) {
    return "image";
  }

  if (assistantTurnNumber % 2 === 0) {
    return "voice";
  }

  return null;
}

export interface GenerateTurnMediaParams {
  assistantTurnNumber: number;
  characterId: number;
  characterName: string;
  messageText: string;
}

/**
 * Live ElevenLabs / Fal.ai generation only — no mock assets.
 * Throws MediaGenerationError when keys are missing or APIs fail.
 */
export async function generateAssistantTurnMedia(
  params: GenerateTurnMediaParams,
): Promise<MessageMediaPayload | undefined> {
  const kind = getAssistantTurnMediaKind(params.assistantTurnNumber);
  if (!kind) {
    return undefined;
  }

  const trimmedText = params.messageText.trim();
  if (trimmedText.length === 0) {
    throw new Error(
      "Cannot attach media: assistant message text is empty after Groq completion.",
    );
  }

  if (kind === "voice") {
    requireElevenLabsApiKey();
    const voiceId = resolveCharacterVoiceId(params.characterId);
    const audio_url = await generateLiveVoice(trimmedText, voiceId);
    return {
      audio_url,
      media_type: "audio" satisfies MediaType,
    };
  }

  requireFalApiKey();
  const image_url = await generateLiveImage(trimmedText, params.characterName);
  return {
    image_url,
    media_type: "mixed" satisfies MediaType,
  };
}

export function attachMediaType(
  content: string,
  media?: MessageMediaPayload,
): MessageMediaPayload | undefined {
  if (!media) {
    return undefined;
  }

  return {
    ...media,
    media_type: media.media_type ?? resolveMediaType(content, media),
  };
}
