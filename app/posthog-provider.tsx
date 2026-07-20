"use client";

import { useEffect, type ReactNode } from "react";
import { initPostHog } from "@/lib/frontend/analytics";

export function PostHogProvider({ children }: { children: ReactNode }): ReactNode {
  useEffect(() => {
    initPostHog();
  }, []);

  return children;
}
