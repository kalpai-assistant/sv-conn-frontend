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
import fs from "node:fs";
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

/**
 * Overwrites the shared `_redirects` with a marketing-only one, and emits a
 * `404.html`.
 *
 * THE BUG THIS FIXES
 * `public/_redirects` ends in `/*  /index.html  200`. Cloudflare serves a
 * real file when one exists, so that rule only fires for paths with no
 * matching file — which includes an asset that is briefly unreachable during
 * a deploy. The response for a missing /assets/*.js was therefore:
 *
 *   HTTP 200 · text/html · Cache-Control: public, max-age=31536000
 *
 * A *successful* HTML response, cached for a year, under a JavaScript URL.
 * Browsers refuse to execute HTML as a module, so the page renders blank —
 * and because the answer is a cacheable 200 rather than an error, it sticks.
 * That is what took eazyserv.com down on 2026-08-17; the only way out was
 * renaming the asset. Verified still reproducible before this change:
 * `curl -I https://eazyserv.com/assets/definitely-missing-12345.js` returned
 * exactly the response above, already `cf-cache-status: HIT`.
 *
 * A 404 status cannot fix this from `_redirects` — Cloudflare Pages supports
 * only 200 rewrites and 301/302/303/307/308 redirects there, so the
 * catch-all has to go instead. Removing it means an unmatched path falls
 * through to `404.html`, which Pages serves with a real 404.
 *
 * WHY THIS IS GENERATED RATHER THAN EDITED IN public/
 * `public/` is copied into all three builds, and the app genuinely needs the
 * catch-all — app.eazyserv.com has client-side routes (/bookings, /profile,
 * /tracking/:id) that must resolve on a hard refresh. Narrowing the shared
 * file would take the app down. This writes over the copy in dist-marketing
 * only, in closeBundle, after the publicDir copy has happened. Same reasoning
 * as robots.txt and sitemap.xml above.
 *
 * SIDE BENEFIT
 * Unknown marketing URLs currently render NotFoundPage under a **200**, a
 * soft-404 that the SEO notes flag as unfixable without narrowing
 * `_redirects`. They now get the same branded page under a real 404.
 */
function routingFiles(): Plugin {
  return {
    name: "marketing-routing-files",
    apply: "build",
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist-marketing");

      fs.writeFileSync(
        path.join(outDir, "_redirects"),
        [
          "# GENERATED by vite.marketing.config.ts — overwrites the copy from",
          "# public/, which carries a `/* /index.html 200` catch-all that the",
          "# app needs and marketing must not have. Editing this file has no",
          "# effect; change routingFiles() instead.",
          "#",
          "# Intentionally empty of rules. The catch-all made a missing asset",
          "# return a cacheable 200 text/html, which is what blanked the site",
          "# on 2026-08-17. Routes are real files (see below) and everything",
          "# unmatched falls through to 404.html.",
          "",
        ].join("\n"),
      );

      // The build script renames index.marketing.html -> index.html *after*
      // vite exits, so at this point the pre-rename name is the one on disk.
      const shell = ["index.marketing.html", "index.html"]
        .map((f) => path.join(outDir, f))
        .find((f) => fs.existsSync(f));

      if (!shell) throw new Error("routingFiles: no built HTML shell to copy");

      // A REAL FILE per route, rather than a _redirects rewrite.
      //
      // The first attempt used `/download  /index.html  200`. That produced a
      // 308 to `/`, because Cloudflare Pages canonicalises `/index.html` to
      // `/` — and it applies that to the rewrite *target*, so the rule
      // redirected instead of rewriting and /download broke. Writing
      // download/index.html sidesteps rewrite semantics completely: Pages
      // serves a directory index directly, which is what static site
      // generators have always done.
      //
      // "/" is skipped — index.html already sits at the root.
      for (const route of ROUTES.filter((r) => r !== "/")) {
        const dir = path.join(outDir, route.replace(/^\//, ""));
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(shell, path.join(dir, "index.html"));
      }

      // Pages walks up the tree for the nearest 404.html, so this one answers
      // for every unmatched path. A copy of the shell, so the SPA still boots
      // and renders NotFoundPage — same view as before, honest status code.
      fs.copyFileSync(shell, path.join(outDir, "404.html"));
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths(),
    seoFiles(),
    devRouteFallback(),
    routingFiles(),
  ],
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
