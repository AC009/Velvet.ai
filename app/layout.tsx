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
  title: {
    default: "Velvet.ai // Real-Life RPG",
    template: "%s · Velvet.ai",
  },
  description:
    "Hardware-verified AI companion for daily discipline and growth.",
  applicationName: "Velvet.ai",
  appleWebApp: {
    capable: true,
    title: "Velvet.ai",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#a855f7" },
    { media: "(prefers-color-scheme: light)", color: "#a855f7" },
  ],
  colorScheme: "dark",
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
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Velvet.ai" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
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
      <body className="w-full h-full min-h-screen overflow-hidden overscroll-y-none select-none touch-manipulation bg-black">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
