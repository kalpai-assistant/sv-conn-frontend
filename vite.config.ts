// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Only enable Sentry source-map upload when the three env vars needed for it
// are present. Locally + on Cloudflare preview builds those won't be set,
// and the plugin becomes a no-op. In CI we set them so production builds
// upload symbolicated source maps — unminified stack traces in Sentry are
// the difference between "TypeError at t.a" and a readable frame.
const sentryPlugins =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? [
        sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          // Must match `Sentry.init({ release })` on the client — otherwise
          // uploaded maps aren't associated with the events that need them.
          // Falls back to git-sha auto-detect if unset.
          release: {
            name: process.env.VITE_SENTRY_RELEASE,
          },
          sourcemaps: { assets: "./dist/**" },
        }),
      ]
    : [];

export default defineConfig({
  plugins: [
    ...sentryPlugins,
    VitePWA({
      registerType: "autoUpdate",
      // Include all assets generated in public/
      includeAssets: ["icons/*.png", "apple-touch-icon.png", "offline.html"],
      manifest: {
        name: "Eazyserv",
        short_name: "SvcConnect",
        description: "Book trusted home services — cleaning, plumbing, electrical, salon & more.",
        theme_color: "#7C3AED",
        background_color: "#7C3AED",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        id: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            form_factor: "narrow",
          },
        ],
      },
      workbox: {
        // Network-first for API calls — always fresh data when online
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Cache-first for Google Fonts
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Serve custom offline page when navigation fails
        navigateFallback: "/offline.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        // Enable PWA in dev mode so we can test manifest/SW locally
        enabled: false,
      },
    }),
  ],
  vite: {
    server: {
      host: true, // Exposes the server on the local network (for testing on phone)
      proxy: {
        "/api": {
          // Overridable so we can point local dev at the deployed backend
          // (e.g. VITE_API_PROXY_TARGET=https://api.eazyserv.com npm run dev)
          // when we need to reproduce a prod issue without wiring localhost
          // into the backend CORS allowlist. Defaults to the docker-compose
          // Postgres+API pair for normal offline dev.
          target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000",
          changeOrigin: true,
          secure: true,
        },
      },
    },
    // Emit source maps so the Sentry plugin can upload symbolicated versions.
    // Files land alongside the JS chunks under dist/ and the plugin ships
    // them to Sentry (see sentryPlugins above).
    build: {
      sourcemap: true,
    },
  },
});
