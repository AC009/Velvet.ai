import {
  createClient,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/supabase/normalize-url";

declare global {
  interface Window {
    __VELVET_PUBLIC_ENV__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    };
  }
}

let browserClient: SupabaseClient | null = null;

const SUPABASE_AUTH_STORAGE_PREFIX = "sb-";
const SUPABASE_AUTH_STORAGE_SUFFIX = "-auth-token";

interface StoredAuthPayload {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: User;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStoredAuthPayload(raw: string): StoredAuthPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }
    return parsed as StoredAuthPayload;
  } catch {
    return null;
  }
}

function findPersistedAuthStorageKey(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  for (const key of Object.keys(window.localStorage)) {
    if (
      key.startsWith(SUPABASE_AUTH_STORAGE_PREFIX) &&
      key.endsWith(SUPABASE_AUTH_STORAGE_SUFFIX) &&
      window.localStorage.getItem(key)
    ) {
      return key;
    }
  }

  return null;
}

function isUsableStoredAuthPayload(
  payload: StoredAuthPayload,
): payload is StoredAuthPayload & {
  access_token: string;
  refresh_token: string;
  user: User;
} {
  return Boolean(
    payload.access_token &&
      payload.refresh_token &&
      payload.user &&
      typeof payload.user.id === "string",
  );
}

function toSessionFromStoredPayload(
  payload: StoredAuthPayload & {
    access_token: string;
    refresh_token: string;
    user: User;
  },
): Session {
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in ?? 3600,
    expires_at: payload.expires_at,
    token_type: "bearer",
    user: payload.user,
  };
}

function readMetaContent(name: string): string {
  if (typeof document === "undefined") {
    return "";
  }

  const element = document.querySelector(`meta[name="${name}"]`);
  return element?.getAttribute("content")?.trim() ?? "";
}

function readGlobalSupabaseCredentials(): {
  supabaseUrl: string;
  supabaseAnonKey: string;
} {
  const runtimeEnv =
    typeof window !== "undefined" ? window.__VELVET_PUBLIC_ENV__ : undefined;

  return {
    supabaseUrl: normalizeSupabaseUrl(
      runtimeEnv?.supabaseUrl?.trim() ||
        readMetaContent("velvet:supabase-url") ||
        "",
    ),
    supabaseAnonKey:
      runtimeEnv?.supabaseAnonKey?.trim() ||
      readMetaContent("velvet:supabase-anon-key") ||
      "",
  };
}

function resolveSupabaseBrowserCredentials(): {
  supabaseUrl: string;
  supabaseAnonKey: string;
} {
  let supabaseUrl = normalizeSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  );
  let supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "Supabase environment tokens are missing from process.env, verifying global fallbacks...",
    );

    const fallback = readGlobalSupabaseCredentials();
    if (!supabaseUrl && fallback.supabaseUrl) {
      supabaseUrl = fallback.supabaseUrl;
    }
    if (!supabaseAnonKey && fallback.supabaseAnonKey) {
      supabaseAnonKey = fallback.supabaseAnonKey;
    }
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "[velvet/supabase] Supabase credentials are still unavailable after global fallback checks.",
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

/** Synchronous probe — true when Supabase auth token exists in localStorage. */
export function peekPersistedAuthMarker(): boolean {
  return findPersistedAuthStorageKey() !== null;
}

/** Synchronous session hydrate from localStorage for flicker-free first paint. */
export function readPersistedSessionSync(): Session | null {
  const storageKey = findPersistedAuthStorageKey();
  if (!storageKey || typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  const payload = parseStoredAuthPayload(raw);
  if (!payload || !isUsableStoredAuthPayload(payload)) {
    return null;
  }

  return toSessionFromStoredPayload(payload);
}

export function getSupabaseBrowser(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  const { supabaseUrl, supabaseAnonKey } = resolveSupabaseBrowserCredentials();

  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage:
        typeof window !== "undefined" ? window.localStorage : undefined,
    },
  });

  return browserClient;
}

/**
 * OAuth redirect target — must match an allowlisted URL in Supabase Auth settings.
 * Uses the live browser origin so preview / production hosts never drift.
 */
export function getOAuthRedirectUrl(): string {
  const configuredSite = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api/auth/callback`;
  }

  if (configuredSite) {
    const origin = configuredSite.startsWith("http")
      ? configuredSite
      : `https://${configuredSite}`;
    return `${origin}/api/auth/callback`;
  }

  // Fallback for SSR / build-time callers — keep in sync with live Vercel project.
  return "https://velvet-ai-gold.vercel.app/api/auth/callback";
}

