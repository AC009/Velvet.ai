"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  getOAuthRedirectUrl,
  getSupabaseBrowser,
  peekPersistedAuthMarker,
  readPersistedSessionSync,
} from "@/lib/supabase/browser";

function readMagicLinkEmailFromEnv(): string | null {
  const email = process.env.NEXT_PUBLIC_MAGIC_LINK_EMAIL?.trim();
  return email && email.length > 0 ? email : null;
}

export interface VelvetAuthState {
  session: Session | null;
  user: User | null;
  isAuthLoading: boolean;
  hadCachedSessionOnMount: boolean;
  isAuthenticating: boolean;
  magicLinkSent: boolean;
  magicLinkEmail: string | null;
  authError: string | null;
  signInWithMagicLink: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
}

async function provisionAppUser(user: User): Promise<void> {
  try {
    await fetch("/api/auth/provision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        email: user.email ?? undefined,
      }),
    });
  } catch (error) {
    console.warn("[velvet/auth] user provision failed:", error);
  }
}

function readOptimisticAuthSnapshot(): {
  hadCachedSession: boolean;
  session: Session | null;
} {
  if (typeof window === "undefined") {
    return { hadCachedSession: false, session: null };
  }

  const hadCachedSession = peekPersistedAuthMarker();
  const session = hadCachedSession ? readPersistedSessionSync() : null;

  return { hadCachedSession, session };
}

export function useVelvetAuth(): VelvetAuthState {
  const magicLinkEmail = readMagicLinkEmailFromEnv();
  const optimisticSnapshotRef = useRef(readOptimisticAuthSnapshot());

  const [session, setSession] = useState<Session | null>(
    () => optimisticSnapshotRef.current.session,
  );
  const [user, setUser] = useState<User | null>(
    () => optimisticSnapshotRef.current.session?.user ?? null,
  );
  const [isAuthLoading, setIsAuthLoading] = useState(
    () => !optimisticSnapshotRef.current.hadCachedSession,
  );
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let mounted = true;

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const authErrorParam = params.get("auth_error");
      if (authErrorParam) {
        setAuthError(decodeURIComponent(authErrorParam));
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    const bootstrap = async (): Promise<void> => {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) {
        return;
      }

      if (error) {
        setAuthError(error.message);
        setSession(null);
        setUser(null);
        setIsAuthLoading(false);
        return;
      }

      setSession(data.session);
      setUser(data.session?.user ?? null);

      if (data.session?.user) {
        void provisionAppUser(data.session.user);
      }

      setIsAuthLoading(false);
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) {
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (event === "SIGNED_IN" && nextSession?.user) {
        setIsAuthenticating(false);
        setMagicLinkSent(false);
        setAuthError(null);
        await provisionAppUser(nextSession.user);
      }

      if (event === "SIGNED_OUT") {
        setIsAuthenticating(false);
        setMagicLinkSent(false);
      }

      if (event === "TOKEN_REFRESHED" && nextSession?.user) {
        setAuthError(null);
      }

      setIsAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithMagicLink = useCallback(async (): Promise<void> => {
    setAuthError(null);
    setMagicLinkSent(false);
    setIsAuthenticating(true);

    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase.auth.signInAnonymously();

      if (error) {
        setIsAuthenticating(false);
        setAuthError(error.message);
        return;
      }

      if (data.session?.user) {
        setSession(data.session);
        setUser(data.session.user);
        setIsAuthLoading(false);
        void provisionAppUser(data.session.user);
      }
    } catch (error) {
      setIsAuthenticating(false);
      setAuthError(
        error instanceof Error ? error.message : "Anonymous sign-in failed.",
      );
    }
  }, []);

  const signInWithOAuth = useCallback(async (provider: "google" | "apple") => {
    setAuthError(null);
    setMagicLinkSent(false);
    setIsAuthenticating(true);

    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getOAuthRedirectUrl(),
        },
      });

      if (error) {
        setIsAuthenticating(false);
        setAuthError(error.message);
      }
    } catch (error) {
      setIsAuthenticating(false);
      const message =
        error instanceof Error ? error.message : "OAuth sign-in failed.";
      setAuthError(message);
    }
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    await signInWithOAuth("google");
  }, [signInWithOAuth]);

  const signInWithApple = useCallback(async (): Promise<void> => {
    await signInWithOAuth("apple");
  }, [signInWithOAuth]);

  const signOut = useCallback(async (): Promise<void> => {
    const supabase = getSupabaseBrowser();
    setAuthError(null);
    setMagicLinkSent(false);

    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      setAuthError(error.message);
      return;
    }

    setSession(null);
    setUser(null);
    setIsAuthLoading(false);
  }, []);

  return {
    session,
    user,
    isAuthLoading,
    hadCachedSessionOnMount: optimisticSnapshotRef.current.hadCachedSession,
    isAuthenticating,
    magicLinkSent,
    magicLinkEmail,
    authError,
    signInWithMagicLink,
    signInWithGoogle,
    signInWithApple,
    signOut,
  };
}
