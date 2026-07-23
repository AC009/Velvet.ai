/**
 * POST /api/generate-story-node
 * Dynamic Game Master — seeded Watcher chapters first, Groq fallback for other worlds.
 */
import { FOUNDATION_MODEL, GROQ_API_URL } from "@/lib/chat/constants";
import {
  getWatcherChapterMessages,
  resolveWatcherChapterNode,
  type WatcherChapterNode,
} from "@/lib/content/watcher-horror-chapters";
import { isGroqConfigured, isSupabaseConfigured } from "@/lib/env";
import { isValidUuid, jsonError } from "@/lib/chat/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface GenerateStoryNodeBody {
  userId: string;
  missionText: string;
  watcherFeedback?: string;
  characterName?: string;
  worldType?: string;
  arcId?: string;
  sequenceOrder?: number;
  arcProgress?: number;
  affinityScore?: number;
  statusTag?: string;
}

interface StoryNodePayload {
  messages: string[];
}

function parseBody(raw: unknown): GenerateStoryNodeBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.userId !== "string" || !isValidUuid(body.userId)) {
    throw new Error("userId must be a valid UUID string.");
  }

  if (typeof body.missionText !== "string" || !body.missionText.trim()) {
    throw new Error("missionText is required.");
  }

  return {
    userId: body.userId,
    missionText: body.missionText.trim(),
    watcherFeedback:
      typeof body.watcherFeedback === "string"
        ? body.watcherFeedback.trim()
        : undefined,
    characterName:
      typeof body.characterName === "string" && body.characterName.trim()
        ? body.characterName.trim()
        : "The Watcher",
    worldType:
      typeof body.worldType === "string" && body.worldType.trim()
        ? body.worldType.trim()
        : "Horror Mystery",
    arcId:
      typeof body.arcId === "string" && body.arcId.trim()
        ? body.arcId.trim()
        : "arc_1",
    sequenceOrder:
      typeof body.sequenceOrder === "number" && Number.isFinite(body.sequenceOrder)
        ? body.sequenceOrder
        : undefined,
    arcProgress:
      typeof body.arcProgress === "number" ? body.arcProgress : undefined,
    affinityScore:
      typeof body.affinityScore === "number" ? body.affinityScore : undefined,
    statusTag:
      typeof body.statusTag === "string" ? body.statusTag : undefined,
  };
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function normalizeMessages(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("Story node payload must be a JSON object.");
  }

  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.messages)) {
    throw new Error("Story node payload missing messages array.");
  }

  const messages = record.messages
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (messages.length < 5) {
    throw new Error("Story node must contain at least 5 narrative messages.");
  }

  return messages.slice(0, 8);
}

function buildSystemPrompt(
  params: GenerateStoryNodeBody,
  seeded?: WatcherChapterNode | null,
): string {
  const persona = params.characterName ?? "The Watcher";
  const lines = [
    `You are ${persona} — cold, dominant, clinical, and atmospheric.`,
    "You speak in sparse English only. Never Czech. Never break character.",
    `World: ${params.worldType ?? "Horror Mystery"}.`,
    "The user just completed a REAL-LIFE hardware-verified mission and photographed proof.",
    "Your job: generate the next story node as a sequence of short SMS-style narrative messages.",
    "",
    "HARD RULES:",
    "1) Return STRICT JSON: { \"messages\": string[] } with 5 to 8 messages.",
    "2) Message[0] MUST explicitly validate the specific real-life task they photographed.",
    "3) Then seamlessly drive the dark RPG plot forward.",
    "4) The FINAL message MUST end on a massive unresolved cliffhanger.",
    "5) Each message: max 2 sentences, urgent secure-comms tone. No essays. No meta commentary.",
    "6) English only.",
  ];

  if (seeded) {
    lines.push(
      "",
      "CANONICAL SEED (follow closely — preserve entry validation and cliffhanger wording):",
      `Persona: ${seeded.personaDirection}`,
      `Entry validation: ${seeded.entryValidation}`,
      `Plot beats: ${seeded.plotBeats.join(" | ")}`,
      `Required cliffhanger ending: ${seeded.cliffhanger}`,
    );
  }

  return lines.join("\n");
}

function buildUserPrompt(params: GenerateStoryNodeBody): string {
  return [
    `Completed mission: ${params.missionText}`,
    params.sequenceOrder != null
      ? `Mission sequence order: ${params.sequenceOrder}`
      : "",
    params.watcherFeedback
      ? `Vision feedback from The Watcher: ${params.watcherFeedback}`
      : "",
    params.affinityScore != null
      ? `Affinity score: ${params.affinityScore}`
      : "",
    params.statusTag ? `Status tag: ${params.statusTag}` : "",
    params.arcProgress != null ? `Arc progress: ${params.arcProgress}%` : "",
    "Generate the next 5–8 narrative messages now as JSON.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateWithGroq(
  params: GenerateStoryNodeBody,
  seeded?: WatcherChapterNode | null,
): Promise<string[]> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const models = [FOUNDATION_MODEL, "llama3-70b-8192", "llama-3.3-70b-versatile"];
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: seeded ? 0.35 : 0.75,
          max_tokens: 900,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: buildSystemPrompt(params, seeded) },
            { role: "user", content: buildUserPrompt(params) },
          ],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Groq error (${response.status}) on ${model}: ${errorBody.slice(0, 400)}`,
        );
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error(`Empty Groq completion from ${model}.`);
      }

      const parsed = JSON.parse(stripMarkdownFences(content)) as unknown;
      return normalizeMessages(parsed);
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Groq generation failed.");
      console.warn("[generate-story-node]", lastError.message);
    }
  }

  throw lastError ?? new Error("Unable to generate story node.");
}

function fallbackStoryNode(params: GenerateStoryNodeBody): string[] {
  const missionHint = params.missionText.slice(0, 90);
  return [
    `I see the proof. You completed it — "${missionHint}…" Your discipline is noted.`,
    "Good. Most people flinch when The Watcher asks for flesh-and-room evidence.",
    "Hold still. The next layer of this arc does not care about your excuses.",
    "I have been tracking your lineage across quieter hours than you admit.",
    "Something on the other side of the glass just moved — and it recognized your name.",
    "Do not look away. The door behind you is no longer yours to open first.",
  ];
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (!isGroqConfigured() && !process.env.GROQ_API_KEY?.trim()) {
      console.warn("[generate-story-node] GROQ_API_KEY missing — using seed/fallback.");
    }
    if (!isSupabaseConfigured()) {
      console.warn("[generate-story-node] Supabase not fully configured.");
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonError("Request body must be valid JSON.", 400);
    }

    let body: GenerateStoryNodeBody;
    try {
      body = parseBody(raw);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid request body.";
      return jsonError(message, 400);
    }

    const seededChapter = resolveWatcherChapterNode({
      worldType: body.worldType,
      arcId: body.arcId,
      sequenceOrder: body.sequenceOrder,
      missionText: body.missionText,
    });

    // First-session Horror Mystery Arc 1: serve canonical chapter nodes verbatim.
    if (seededChapter) {
      const messages = getWatcherChapterMessages(seededChapter);
      return Response.json({
        success: true,
        messages,
        messageCount: messages.length,
        model: "seed:watcher-horror-arc1",
        source: "seed",
        chapterId: seededChapter.chapterId,
        sequenceOrder: seededChapter.sequenceOrder,
        nextMissionSequence: seededChapter.nextMissionSequence,
        nextMissionHint: seededChapter.nextMissionHint,
        entryValidation: seededChapter.entryValidation,
        cliffhanger: seededChapter.cliffhanger,
      });
    }

    let messages: string[];
    try {
      messages = await generateWithGroq(body, null);
    } catch (error) {
      console.error("[generate-story-node] Groq failed, using fallback:", error);
      messages = fallbackStoryNode(body);
    }

    const payload: StoryNodePayload = { messages };
    return Response.json({
      success: true,
      messages: payload.messages,
      messageCount: payload.messages.length,
      model: FOUNDATION_MODEL,
      source: "groq",
      nextMissionSequence: null,
      nextMissionHint: null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Story node generation failed.";
    console.error("[generate-story-node] request failed:", error);
    return jsonError(message, 500);
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
