/**
 * Google Gemini server client — Vision / multimodal analysis (free-tier flash models).
 */
import {
  GoogleGenerativeAI,
  type GenerativeModel,
  type ResponseSchema,
  SchemaType,
} from "@google/generative-ai";
import { getServerEnv } from "@/lib/env";

/** Prefer 2.0 flash; fall back to 1.5 flash if the primary model is unavailable. */
export const GEMINI_VISION_PRIMARY_MODEL = "gemini-2.0-flash";
export const GEMINI_VISION_FALLBACK_MODEL = "gemini-1.5-flash";

let generativeAi: GoogleGenerativeAI | null = null;

export function getGeminiApiKey(): string {
  const { geminiApiKey } = getServerEnv();
  if (!geminiApiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Add it to .env.local for Vision mission verification.",
    );
  }
  return geminiApiKey;
}

export function getGeminiClient(): GoogleGenerativeAI {
  if (generativeAi) {
    return generativeAi;
  }
  generativeAi = new GoogleGenerativeAI(getGeminiApiKey());
  return generativeAi;
}

export const MISSION_VERIFICATION_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    approved: {
      type: SchemaType.BOOLEAN,
      description:
        "True only when the photo shows clear, authentic real-world proof of the mission action.",
    },
    feedback: {
      type: SchemaType.STRING,
      description:
        "Maximum of 2 sentences in English only, in character as The Watcher.",
    },
  },
  required: ["approved", "feedback"],
};

export function getGeminiVisionModel(
  modelName: string = GEMINI_VISION_PRIMARY_MODEL,
): GenerativeModel {
  return getGeminiClient().getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: MISSION_VERIFICATION_RESPONSE_SCHEMA,
    },
  });
}

export function isGeminiConfigured(): boolean {
  return Boolean(getServerEnv().geminiApiKey);
}
