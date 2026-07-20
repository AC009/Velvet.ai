"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

function parseHashParams(hash: string): URLSearchParams {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(normalized);
}

function resolveOtpType(rawType: string | null): EmailOtpType {
  if (rawType === "magiclink" || rawType === "signup" || rawType === "invite") {
    return "email";
  }
  return (rawType as EmailOtpType) ?? "email";
}

export default function AuthCallbackPage(): ReactNode {
  const router = useRouter();

  useEffect(() => {
    const completeAuthCallback = async (): Promise<void> => {
      const params = new URLSearchParams(window.location.search);
      const hashParams = parseHashParams(window.location.hash);
      const authError =
        params.get("error_description") ??
        params.get("error") ??
        hashParams.get("error_description") ??
        hashParams.get("error");

      if (authError) {
        router.replace(`/?auth_error=${encodeURIComponent(authError)}`);
        return;
      }

      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const otpType = resolveOtpType(params.get("type"));
      const accessToken =
        hashParams.get("access_token") ?? params.get("access_token");
      const refreshToken =
        hashParams.get("refresh_token") ?? params.get("refresh_token");

      try {
        const supabase = getSupabaseBrowser();

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            router.replace(`/?auth_error=${encodeURIComponent(error.message)}`);
            return;
          }
          router.replace("/");
          return;
        }

        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          if (error) {
            router.replace(`/?auth_error=${encodeURIComponent(error.message)}`);
            return;
          }
          router.replace("/");
          return;
        }

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            router.replace(`/?auth_error=${encodeURIComponent(error.message)}`);
            return;
          }
          router.replace("/");
          return;
        }

        router.replace("/?auth_error=missing_auth_params");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Auth callback failed.";
        router.replace(`/?auth_error=${encodeURIComponent(message)}`);
      }
    };

    void completeAuthCallback();
  }, [router]);

  return (
    <main className="flex h-[100dvh] items-center justify-center bg-black">
      <p className="auth-scan-pulse font-mono text-[11px] uppercase tracking-[0.18em] text-[#D4AF37]">
        [ AUTHENTICATING SECURE VECTOR... ]
      </p>
    </main>
  );
}
