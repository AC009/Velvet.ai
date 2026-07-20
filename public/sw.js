/* Velvet.ai — Phantom Push Service Worker (production) */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushPayload(event) {
  if (!event.data) {
    return {
      title: "Velvet.ai",
      body: "Someone is waiting for you. Open the chat.",
      url: "/?tab=character",
      tag: "velvet-phantom-pulse",
    };
  }

  try {
    const parsed = event.data.json();
    return {
      title: typeof parsed.title === "string" ? parsed.title : "Velvet.ai",
      body:
        typeof parsed.body === "string"
          ? parsed.body
          : "Someone is waiting for you. Open the chat.",
      url:
        typeof parsed.url === "string" ? parsed.url : "/?tab=character",
      tag:
        typeof parsed.tag === "string"
          ? parsed.tag
          : "velvet-phantom-pulse",
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

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);

  const notificationOptions = {
    body: payload.body,
    tag: payload.tag,
    data: { url: payload.url },
    requireInteraction: true,
    vibrate: [120, 60, 120],
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/?tab=character";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
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
