/**
 * Velvet.ai — Production multimodal generation (ElevenLabs TTS + Fal.ai Flux Schnell)
 *
 * Required in `.env.local` (project root, server-only):
 *
 *   ELEVEN_LABS_API_KEY=sk_...
 *   FAL_KEY=...
 *
 * No smoke-test fallbacks. Missing keys or API failures throw MediaGenerationError.
 */

import { MediaGenerationError } from "@/lib/chat/media-errors";

const ELEVENLABS_TTS_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const FAL_FLUX_SCHNELL_ENDPOINT = "https://fal.run/fal-ai/flux/schnell";

const CINEMATIC_SIGNATURE_PROMPT =
  "Dark anime novel style, cyberpunk mood, handsome anime male, high details, luxury neon penthouse background, 8k, photorealistic shading, cinematic lighting, masterpiece --ar 3:4";

/** Fixed ElevenLabs voice IDs mapped to Velvet character catalog IDs */
export const CHARACTER_VOICE_IDS: Record<number, string> = {
  1: "ErXwobaYiN019PkySvjV", // Lucien Vale
  2: "VR6AeaYv65gLEJi00b1R", // Kael Veyr
  3: "EXAVITQu4vr4xnSDxMaL", // Ayame Noctis
  4: "pNInz6obpgDQGcFmaJgB", // Dante Ward
  5: "VR6AeaYv65gLEJi00b1R", // Vittorio
  6: "EXAVITQu4vr4xnSDxMaL", // Serafina
  7: "pNInz6obpgDQGcFmaJgB", // Dr. Ashford
  8: "ErXwobaYiN019PkySvjV", // The Watcher
  9: "EXAVITQu4vr4xnSDxMaL", // Zoe
  10: "pNInz6obpgDQGcFmaJgB", // Liam
};

const DEFAULT_VOICE_ID = "ErXwobaYiN019PkySvjV";
const MAX_TTS_CHARACTERS = 480;

export function getElevenLabsApiKey(): string | undefined {
  return process.env.ELEVEN_LABS_API_KEY?.trim() || undefined;
}

export function getFalApiKey(): string | undefined {
  return process.env.FAL_KEY?.trim() || undefined;
}

export function requireElevenLabsApiKey(): string {
  const apiKey = getElevenLabsApiKey();
  if (!apiKey) {
    throw new MediaGenerationError(
      "ELEVEN_LABS_API_KEY is not configured. Add it to .env.local and restart the dev server.",
      "config",
    );
  }
  return apiKey;
}

export function requireFalApiKey(): string {
  const apiKey = getFalApiKey();
  if (!apiKey) {
    throw new MediaGenerationError(
      "FAL_KEY is not configured. Add it to .env.local and restart the dev server.",
      "config",
    );
  }
  return apiKey;
}

export function resolveCharacterVoiceId(characterId: number): string {
  return CHARACTER_VOICE_IDS[characterId] ?? DEFAULT_VOICE_ID;
}

function sanitizeTtsText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_TTS_CHARACTERS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_TTS_CHARACTERS - 1)}…`;
}

function arrayBufferToMp3DataUrl(buffer: ArrayBuffer): string {
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:audio/mp3;base64,${base64}`;
}

function buildFluxPrompt(promptContext: string, characterName: string): string {
  const excerpt = promptContext.replace(/\s+/g, " ").trim().slice(0, 220);
  const scene =
    excerpt.length > 0
      ? excerpt
      : `${characterName} in a tense narrative moment`;
  return `${characterName}, ${scene}. ${CINEMATIC_SIGNATURE_PROMPT}`;
}

interface FalFluxImage {
  url?: string;
}

interface FalFluxResponse {
  images?: FalFluxImage[];
  image?: FalFluxImage;
  data?: {
    images?: FalFluxImage[];
  };
}

function extractFalImageUrl(payload: FalFluxResponse): string | null {
  const candidates = [
    payload.images?.[0]?.url,
    payload.image?.url,
    payload.data?.images?.[0]?.url,
  ];

  for (const url of candidates) {
    if (typeof url === "string" && url.startsWith("http")) {
      return url;
    }
  }

  return null;
}

/**
 * ElevenLabs live TTS → Base64 MP3 data URL. Throws on missing key or API failure.
 */
export async function generateLiveVoice(
  text: string,
  voiceId: string,
): Promise<string> {
  const apiKey = requireElevenLabsApiKey();
  const sanitized = sanitizeTtsText(text);

  if (sanitized.length === 0) {
    throw new MediaGenerationError(
      "Cannot synthesize voice: Groq returned empty text for this turn.",
      "elevenlabs",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${ELEVENLABS_TTS_BASE}/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: sanitized,
        model_id: "eleven_flash_2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });
  } catch (error) {
    throw new MediaGenerationError(
      `ElevenLabs network request failed: ${error instanceof Error ? error.message : "unknown error"}`,
      "elevenlabs",
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new MediaGenerationError(
      `ElevenLabs TTS HTTP ${response.status}: ${errorBody.slice(0, 320)}`,
      "elevenlabs",
    );
  }

  const audioBuffer = await response.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    throw new MediaGenerationError(
      "ElevenLabs returned an empty audio buffer.",
      "elevenlabs",
    );
  }

  return arrayBufferToMp3DataUrl(audioBuffer);
}

/**
 * Fal.ai Flux Schnell live image generation. Throws on missing key or API failure.
 */
export async function generateLiveImage(
  promptContext: string,
  characterName: string,
): Promise<string> {
  const apiKey = requireFalApiKey();

  let response: Response;
  try {
    response = await fetch(FAL_FLUX_SCHNELL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: buildFluxPrompt(promptContext, characterName),
        image_size: "portrait_4_3",
        num_inference_steps: 4,
        enable_safety_checker: true,
      }),
    });
  } catch (error) {
    throw new MediaGenerationError(
      `Fal.ai network request failed: ${error instanceof Error ? error.message : "unknown error"}`,
      "fal",
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new MediaGenerationError(
      `Fal.ai Flux Schnell HTTP ${response.status}: ${errorBody.slice(0, 320)}`,
      "fal",
    );
  }

  const payload = (await response.json()) as FalFluxResponse;
  const imageUrl = extractFalImageUrl(payload);

  if (!imageUrl) {
    throw new MediaGenerationError(
      "Fal.ai response did not include a valid image URL.",
      "fal",
    );
  }

  return imageUrl;
}
