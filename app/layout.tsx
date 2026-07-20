import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import { PostHogProvider } from "./posthog-provider";
import "./globals.css";

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
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${dmSans.variable} w-full h-full min-h-screen overflow-hidden overscroll-y-none select-none bg-black`}
    >
      <body className="w-full h-full min-h-screen overflow-hidden overscroll-y-none select-none bg-black">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
