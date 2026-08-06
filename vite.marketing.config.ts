// Marketing SPA build (eazyserv.com apex + www).
//
// Deliberately NOT TanStack Start. The app build uses TanStack Start +
// Nitro for SSR to Cloudflare Workers, which needs a runtime — and CF
// Pages Direct Upload can't cheaply host that runtime. Marketing is
// static (hero, service tiles, trust bar, footer, no data, no auth),
// so a plain Vite + React SPA outputs an index.html that wrangler can
// upload as a static site with zero Workers configuration.
//
// Entry: index.marketing.html → src/marketing/main.tsx → MarketingHome.
// The app's routes/__root.tsx and routes/index.tsx conditional on
// IS_MARKETING is now dead in this build (that build never ships this
// entry) but kept for the app build's tree-shake benefit.
//
// Deployed by .github/workflows/deploy-marketing.yml via wrangler.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: "dist-marketing",
    emptyOutDir: true,
    // Custom entry — index.marketing.html rather than the default
    // index.html so the app build (which uses TanStack Start's default
    // entry) isn't confused. We rename to index.html in the npm script
    // so wrangler serves it at `/`.
    rollupOptions: {
      input: path.resolve(__dirname, "index.marketing.html"),
    },
  },
});
