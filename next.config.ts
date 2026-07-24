import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

/**
 * Workbox / @ducanh2912/next-pwa on Next 15 emits a broken production sw.js
 * (`_async_to_generator is not defined`). Service worker generation is OFF.
 * Phantom Push uses the hand-written `public/sw.js` via push-register.ts.
 */
const withPWA = withPWAInit({
  dest: "public",
  disable: true,
  register: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withPWA(nextConfig);
