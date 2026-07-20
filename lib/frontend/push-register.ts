import { getPublicEnv } from "@/lib/env";
import { parseVelvetDeepLink } from "@/lib/push/deep-link";
import type { PushSubscriptionPayload } from "@/lib/push/types";

export type { PushSubscriptionPayload } from "@/lib/push/types";
export { parseVelvetDeepLink };

export interface PushRegistrationResult {
  status: "granted" | "denied" | "unsupported" | "skipped" | "error";
  endpoint?: string;
  message?: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  return window.btoa(binary);
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerPhantomPush(params: {
  userId: string;
  worldId?: number;
  characterId?: number;
}): Promise<PushRegistrationResult> {
  if (!isPushSupported()) {
    return { status: "unsupported", message: "Web Push is not supported." };
  }

  const { vapidPublicKey } = getPublicEnv();
  if (!vapidPublicKey) {
    return {
      status: "skipped",
      message: "VAPID public key not configured.",
    };
  }

  try {
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;

    if (permission !== "granted") {
      return { status: "denied", message: "Notification permission denied." };
    }

    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as any,
      });
    }

    const p256dhKey = subscription.getKey("p256dh");
    const authKey = subscription.getKey("auth");

    if (!p256dhKey || !authKey) {
      return { status: "error", message: "Push subscription keys missing." };
    }

    const payload: PushSubscriptionPayload = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: arrayBufferToBase64(p256dhKey),
        auth: arrayBufferToBase64(authKey),
      },
    };

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: params.userId,
        subscription: payload,
        worldId: params.worldId,
        characterId: params.characterId,
      }),
    });

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      return {
        status: "error",
        message: errorPayload?.error ?? `Subscribe failed (${response.status}).`,
      };
    }

    return {
      status: "granted",
      endpoint: subscription.endpoint,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Push registration failed.";
    return { status: "error", message };
  }
}

export function attachPushNavigationListener(
  onNavigate: (url: string) => void,
): () => void {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) {
    return () => undefined;
  }

  const handler = (event: MessageEvent): void => {
    const data = event.data as { type?: string; url?: string } | null;
    if (data?.type === "VELVET_NAVIGATE" && typeof data.url === "string") {
      onNavigate(data.url);
    }
  };

  navigator.serviceWorker.addEventListener("message", handler);
  return () => {
    navigator.serviceWorker.removeEventListener("message", handler);
  };
}
