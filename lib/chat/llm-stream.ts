import type { InferenceRoute } from "@/lib/chat/model-router";
import { streamRoutedLlmCompletion } from "@/lib/chat/llm-provider";
import type { LlmMessage, LlmStreamChunk } from "@/lib/types/database";

export async function* streamLlmCompletion(
  messages: LlmMessage[],
  route: InferenceRoute,
): AsyncGenerator<LlmStreamChunk> {
  yield* streamRoutedLlmCompletion(messages, route);
}
