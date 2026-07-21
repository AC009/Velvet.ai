import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import { normalizeSupabaseUrl } from "@/lib/supabase/normalize-url";
import { PostHogProvider } from "./posthog-provider";
import "./globals.css";

function readRuntimePublicSupabaseEnv(): {
  supabaseUrl: string;
  supabaseAnonKey: string;
} {
  return {
    supabaseUrl: normalizeSupabaseUrl(
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
        process.env.SUPABASE_URL?.trim() ||
        "",
    ),
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "",
  };
}

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Velvet.ai",
  description: "Where relationships remember.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const runtimePublicEnv = readRuntimePublicSupabaseEnv();

  return (
    <html
      lang="en"
      className={`${playfair.variable} ${dmSans.variable} w-full h-full min-h-screen overflow-hidden overscroll-y-none select-none bg-black`}
    >
      <head>
        {runtimePublicEnv.supabaseUrl ? (
          <meta
            name="velvet:supabase-url"
            content={runtimePublicEnv.supabaseUrl}
          />
        ) : null}
        {runtimePublicEnv.supabaseAnonKey ? (
          <meta
            name="velvet:supabase-anon-key"
            content={runtimePublicEnv.supabaseAnonKey}
          />
        ) : null}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__VELVET_PUBLIC_ENV__=${JSON.stringify(runtimePublicEnv)};`,
          }}
        />
      </head>
      <body className="w-full h-full min-h-screen overflow-hidden overscroll-y-none select-none bg-black">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
