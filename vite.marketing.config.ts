// Marketing build (eazyserv.com apex).
//
// Same source tree as the app build, with two build-time differences:
//
//   1. `VITE_BUILD_TARGET=marketing` — makes __root.tsx render a stripped
//      shell (no AuthProvider, no FCM, no version-check gate) and swaps
//      the `/` route from the app home to the marketing landing.
//   2. Output goes to `dist-marketing/` instead of `dist/`, so both builds
//      can sit side-by-side in CI without stomping each other.
//
// PWA plugin is intentionally NOT registered here — marketing doesn't need
// service-worker caching, and the app build's SW at eazyserv.com would
// hijack navigations we want to stay lightweight. Sentry source-map
// upload also skipped (marketing bundle is trivial, not worth the CI
// cost).
//
// Deploy: `.github/workflows/deploy-marketing.yml` builds this + pushes
// dist-marketing/ to the Cloudflare Pages `eazyserv-marketing` project
// via wrangler.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    // Substitute IS_MARKETING at build time so Vite can potentially
    // tree-shake the app-only branch (see caveats in __root.tsx).
    define: {
      "import.meta.env.VITE_BUILD_TARGET": JSON.stringify("marketing"),
    },
    build: {
      outDir: "dist-marketing",
      sourcemap: false,
    },
  },
});
