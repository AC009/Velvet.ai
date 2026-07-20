import webpush from "web-push";
import { getServerEnv, isPushConfigured } from "@/lib/env";
import type { PhantomPushPacket, PushSubscriptionPayload } from "@/lib/push/types";

let vapidConfigured = false;

function ensureVapidConfigured(): void {
  if (vapidConfigured) {
    return;
  }
  const env = getServerEnv();
  if (!isPushConfigured(env)) {
    throw new Error(
      "Web Push is not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.",
    );
  }
  webpush.setVapidDetails(
    env.vapidSubject,
    env.vapidPublicKey!,
    env.vapidPrivateKey!,
  );
  vapidConfigured = true;
}

export async function sendPhantomPush(
  subscription: PushSubscriptionPayload,
  packet: PhantomPushPacket,
): Promise<void> {
  ensureVapidConfigured();

  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    },
    JSON.stringify(packet),
    {
      TTL: 3600,
      urgency: "high",
    },
  );
}

export function isWebPushReady(): boolean {
  return isPushConfigured();
}
