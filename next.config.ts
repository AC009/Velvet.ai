import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  customWorkerSrc: "worker",
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
