import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

/**
 * Workbox / @ducanh2912/next-pwa on Next 15 emits a production sw.js that
 * references Babel helper `_async_to_generator` without bundling it, which
 * crashes the client router cache (`Uncaught ReferenceError` in sw.js).
 *
 * PWA/Workbox generation is DISABLED. Phantom Push continues via the
 * hand-written `public/sw.js` registered in `lib/frontend/push-register.ts`.
 * Re-enable only with ENABLE_PWA=true after validating a clean SW build.
 */
const pwaDisabled = process.env.ENABLE_PWA !== "true";

const withPWA = withPWAInit({
  dest: "public",
  disable: pwaDisabled,
  register: !pwaDisabled,
  buildExcludes: [/middleware-manifest\.json$/, /app-build-manifest\.json$/],
  // Only merge the custom worker when Workbox generation is explicitly enabled.
  ...(pwaDisabled ? {} : { customWorkerSrc: "worker" }),
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "velvet-google-fonts",
          expiration: {
            maxEntries: 16,
            maxAgeSeconds: 60 * 60 * 24 * 365,
          },
        },
      },
      {
        urlPattern: /\.(?:js|css|woff2?|ttf|otf)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "velvet-static-assets",
          expiration: {
            maxEntries: 96,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          },
        },
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|avif)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "velvet-image-assets",
          expiration: {
            maxEntries: 96,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          },
        },
      },
      {
        urlPattern: ({ request }) => request.mode === "navigate",
        handler: "NetworkFirst",
        options: {
          cacheName: "velvet-html-shell",
          networkTimeoutSeconds: 3,
          expiration: {
            maxEntries: 16,
            maxAgeSeconds: 60 * 60 * 24,
          },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withPWA(nextConfig);
