/**
 * Centralized environment access — safe for Vercel build (no throws at import time).
 */

import { normalizeSupabaseUrl } from "@/lib/supabase/normalize-url";

export interface PublicEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  vapidPublicKey: string;
}

export interface ServerEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseAnonKey: string;
  groqApiKey: string | null;
  geminiApiKey: string | null;
  togetherApiKey: string | null;
  vapidPublicKey: string | null;
  vapidPrivateKey: string | null;
  vapidSubject: string;
  cronSecret: string | null;
}

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function getPublicEnv(): PublicEnv {
  return {
    supabaseUrl: normalizeSupabaseUrl(read("NEXT_PUBLIC_SUPABASE_URL")),
    supabaseAnonKey: read("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? "",
    vapidPublicKey:
      read("NEXT_PUBLIC_VAPID_PUBLIC_KEY") ?? read("VAPID_PUBLIC_KEY") ?? "",
  };
}

export function getServerEnv(): ServerEnv {
  const supabaseUrl = normalizeSupabaseUrl(
    read("SUPABASE_URL") ?? read("NEXT_PUBLIC_SUPABASE_URL"),
  );
  return {
    supabaseUrl,
    supabaseServiceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    supabaseAnonKey:
      read("SUPABASE_ANON_KEY") ?? read("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? "",
    groqApiKey: read("GROQ_API_KEY") ?? null,
    geminiApiKey: read("GEMINI_API_KEY") ?? null,
    togetherApiKey: read("TOGETHER_API_KEY") ?? null,
    vapidPublicKey:
      read("VAPID_PUBLIC_KEY") ?? read("NEXT_PUBLIC_VAPID_PUBLIC_KEY") ?? null,
    vapidPrivateKey: read("VAPID_PRIVATE_KEY") ?? null,
    vapidSubject: read("VAPID_SUBJECT") ?? "mailto:phantom@velvet.ai",
    cronSecret: read("CRON_SECRET") ?? null,
  };
}

export function requireServerEnv(keys: Array<keyof ServerEnv>): ServerEnv {
  const env = getServerEnv();
  for (const key of keys) {
    const value = env[key];
    if (value === null || value === undefined || value === "") {
      throw new Error(`Missing required environment variable for: ${key}`);
    }
  }
  return env;
}

export function isPushConfigured(env: ServerEnv = getServerEnv()): boolean {
  return Boolean(
    env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject,
  );
}

export function isSupabaseConfigured(env: ServerEnv = getServerEnv()): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export function isGroqConfigured(env: ServerEnv = getServerEnv()): boolean {
  return Boolean(env.groqApiKey);
}

export function isGeminiConfigured(env: ServerEnv = getServerEnv()): boolean {
  return Boolean(env.geminiApiKey);
}
