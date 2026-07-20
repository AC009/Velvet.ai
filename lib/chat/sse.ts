import type { SseEvent } from "@/lib/types/database";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export function createSseResponse(
  streamFactory: (
    enqueue: (event: SseEvent) => void,
    close: () => void,
  ) => Promise<void>,
): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const close = (): void => {
        if (closed) {
          return;
        }
        closed = true;
        controller.close();
      };

      const enqueue = (event: SseEvent): void => {
        if (closed) {
          return;
        }
        const payload = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      enqueue({ type: "token", content: "" });

      try {
        await streamFactory(enqueue, close);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Internal stream error";
        enqueue({ type: "error", message });
        close();
      }
    },
  });

  return new Response(body, { headers: SSE_HEADERS });
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

const SEEDED_DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";

export function isValidUuid(value: string): boolean {
  if (value === SEEDED_DEMO_USER_ID) {
    return true;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
