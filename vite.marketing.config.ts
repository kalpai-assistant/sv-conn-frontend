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
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

// Canonical origin for the marketing site. Search engines need absolute
// URLs in sitemaps and canonicals — relative paths are ignored.
const SITE = "https://eazyserv.com";

// Every URL the marketing SPA actually serves. `main.tsx` routes on
// pathname, so this list and that switch must stay in step; a sitemap
// entry with no page behind it is a crawl error.
const ROUTES = ["/", "/download"];

/**
 * Emits robots.txt and sitemap.xml into the marketing bundle.
 *
 * These are generated here rather than committed to `public/` because
 * public/ is shared with the app build — verified in production, where
 * app.eazyserv.com serves the same og-banner.jpg as eazyserv.com. A
 * robots.txt dropped in public/ would therefore appear on BOTH hosts with
 * identical contents, and robots.txt cannot express per-host rules. The
 * app subdomain is an authenticated PWA that should not be indexed at all,
 * so sharing one file would mean either indexing the app or de-indexing
 * marketing.
 *
 * Generating instead of hand-writing also keeps the sitemap honest: it is
 * built from ROUTES above, so a route added without a sitemap entry is a
 * one-line change rather than something nobody remembers.
 */
function seoFiles(): Plugin {
  return {
    name: "marketing-seo-files",
    apply: "build",
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10);

      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: [
          "# Marketing site (eazyserv.com). The app subdomain has its own.",
          "User-agent: *",
          "Allow: /",
          "",
          `Sitemap: ${SITE}/sitemap.xml`,
          "",
        ].join("\n"),
      });

      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source:
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          ROUTES.map(
            (route) =>
              "  <url>\n" +
              `    <loc>${SITE}${route}</loc>\n` +
              `    <lastmod>${today}</lastmod>\n` +
              "  </url>\n",
          ).join("") +
          "</urlset>\n",
      });
    },
  };
}

/**
 * Makes the dev server serve the routes in ROUTES, which it otherwise 404s.
 *
 * This build's entry is `index.marketing.html`, not `index.html`. Vite's SPA
 * history fallback only ever rewrites to `/index.html`, and this repo has no
 * such file — the npm script renames it inside dist-marketing *after* the
 * build, which is why /download works under `vite preview` (4173) and 404s
 * under `vite dev` (5173). The 404 comes from the server, so no React code
 * runs and you get the browser's own error page rather than NotFoundPage.
 *
 * Rewriting only req.url means the browser's address bar is untouched, so
 * window.location.pathname is still "/download" when main.tsx routes on it.
 *
 * apply: "serve" — dev only. Production is served by Cloudflare Pages using
 * public/_redirects, which is unaffected by this.
 *
 * Only the known routes are rewritten, not everything, so a genuinely
 * missing asset still 404s as it should. The trade is that NotFoundPage
 * cannot be reached in dev; use the preview build to check that view.
 */
function devRouteFallback(): Plugin {
  return {
    name: "marketing-dev-route-fallback",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pathname = (req.url ?? "").split("?")[0].replace(/\/$/, "") || "/";
        if (ROUTES.includes(pathname)) req.url = "/index.marketing.html";
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths(), seoFiles(), devRouteFallback()],
  build: {
    outDir: "dist-marketing",
    emptyOutDir: true,
    // Custom entry — index.marketing.html rather than the default
    // index.html so the app build (which uses TanStack Start's default
    // entry) isn't confused. We rename to index.html in the npm script
    // so wrangler serves it at `/`.
    rollupOptions: {
      input: path.resolve(__dirname, "index.marketing.html"),

      // CACHE-BUST TOKEN — bump this if a bad asset response ever gets stuck
      // again. It is the only lever that reaches a browser which has already
      // cached a broken response, because a CDN purge cannot.
      //
      // On 2026-08-18 the apex served index.html under
      // /assets/index.marketing-CMBsGWXB.js. Browsers that cached it kept
      // rendering blank while others were fine, and the deployment itself was
      // verified correct — origin returned valid JS over HTTP/1.1 and HTTP/2,
      // cache-busted and not, on both hostnames. Changing the filename is what
      // moves every client onto a URL nothing has ever cached.
      //
      // Marketing only; the app build has its own config and its own assets.
      output: {
        entryFileNames: "assets/[name]-c2-[hash].js",
        chunkFileNames: "assets/[name]-c2-[hash].js",
        assetFileNames: "assets/[name]-c2-[hash][extname]",
      },
    },
  },
});
