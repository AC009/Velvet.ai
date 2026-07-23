/// <reference lib="webworker" />
/**
 * Custom service-worker extensions for Velvet.ai PWA.
 * Merged into the Workbox-generated sw.js by @ducanh2912/next-pwa.
 * Preserves Phantom Push notification handlers.
 */

declare const self: ServiceWorkerGlobalScope;

interface VelvetPushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

function parsePushPayload(event: PushEvent): VelvetPushPayload {
  if (!event.data) {
    return {
      title: "Velvet.ai",
      body: "Someone is waiting for you. Open the chat.",
      url: "/?tab=character",
      tag: "velvet-phantom-pulse",
    };
  }

  try {
    const parsed = event.data.json() as Record<string, unknown>;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "Velvet.ai",
      body:
        typeof parsed.body === "string"
          ? parsed.body
          : "Someone is waiting for you. Open the chat.",
      url: typeof parsed.url === "string" ? parsed.url : "/?tab=character",
      tag:
        typeof parsed.tag === "string" ? parsed.tag : "velvet-phantom-pulse",
    };
  } catch {
    const text = event.data.text();
    return {
      title: "Velvet.ai",
      body: text || "Someone is waiting for you. Open the chat.",
      url: "/?tab=character",
      tag: "velvet-phantom-pulse",
    };
  }
}

self.addEventListener("push", (event: PushEvent) => {
  const payload = parsePushPayload(event);
  const notificationOptions: NotificationOptions = {
    body: payload.body,
    tag: payload.tag,
    data: { url: payload.url },
    requireInteraction: true,
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data as { url?: string } | undefined)?.url ||
    "/?tab=character";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            void client.focus();
            client.postMessage({
              type: "VELVET_NAVIGATE",
              url: targetUrl,
            });
            return undefined;
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});

export {};
