import {
  createClient,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

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

  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

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

export function getOAuthRedirectUrl(): string {
  if (process.env.NODE_ENV === "production") {
    return "https://velvet-ai1-7qsh.vercel.app/auth/callback";
  }

  if (typeof window === "undefined") {
    return "/auth/callback";
  }

  return `${window.location.origin}/auth/callback`;
}
