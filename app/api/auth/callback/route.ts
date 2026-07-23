/**
 * GET /api/auth/callback
 *
 * Supabase OAuth lands here after Google/Apple consent.
 * - PKCE `?code=` → hand off to the client `/auth/callback` page which
 *   exchanges the code into the browser localStorage session (Velvet auth model).
 * - Errors → redirect home with `auth_error`.
 * - Hash fragments (#access_token=…) never reach the server; the root page
 *   client fallback handles those.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildRedirect(
  requestUrl: URL,
  pathname: string,
  extra?: Record<string, string>,
): NextResponse {
  const target = new URL(pathname, requestUrl.origin);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      target.searchParams.set(key, value);
    }
  }
  return NextResponse.redirect(target);
}

export async function GET(request: Request): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const authError =
    requestUrl.searchParams.get("error_description") ??
    requestUrl.searchParams.get("error");

  if (authError) {
    return buildRedirect(requestUrl, "/", {
      auth_error: authError,
    });
  }

  if (code) {
    // Prefer forwarding the PKCE code to the client callback so the existing
    // localStorage-backed Supabase browser client can own the session.
    // Also attempt a server-side exchange when public env is present (defense in depth).
    const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.warn(
            "[velvet/auth/callback] server code exchange warning:",
            error.message,
          );
        }
      } catch (error) {
        console.warn("[velvet/auth/callback] server exchange failed:", error);
      }
    }

    const clientCallback = new URL("/auth/callback", requestUrl.origin);
    // Preserve original query (code, state, type, …) for the client exchanger.
    requestUrl.searchParams.forEach((value, key) => {
      clientCallback.searchParams.set(key, value);
    });
    return NextResponse.redirect(clientCallback);
  }

  // No code — send users to the client callback / home; hash tokens are client-only.
  return buildRedirect(requestUrl, "/auth/callback");
}
