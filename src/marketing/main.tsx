/**
 * Marketing SPA entry — separate from the app.
 *
 * Not TanStack Start, not TanStack Router. Plain Vite + React with a
 * bare-bones "router" that picks a component by pathname on mount.
 * `_redirects` (SPA fallback) makes /download and any other URL resolve
 * to this same index.html; we then switch on pathname to decide what
 * to render.
 *
 * Two pages here today: `/` (marketing home) and `/download` (mirrors
 * the app's /download so the CTA doesn't cross domains). Legal pages
 * (/privacy, /terms, /refund) still link out to app.eazyserv.com — the
 * source of truth lives there because reviewers hit those URLs directly.
 */
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";

import { MarketingHome } from "./MarketingHome";
import { NotFoundPage } from "./NotFoundPage";
import { applyRouteMeta, NOT_FOUND_META, ROUTE_META } from "./seo";
import { getPostBySlug } from "./blog/registry";

import "../styles.css";
// Must come after styles.css — it redefines the brand tokens for this build
// only, so the marketing site is blue while the app stays purple. Reversing
// these two imports silently leaves the page purple.
import "./marketing-theme.css";

// /download carries qrcode.react + a second icon set the home page does not
// touch; ~15 KB gzip that homepage visitors (the majority) shouldn't pay for.
// Lazy-loaded so the main chunk only includes what the landing route needs.
// The Suspense fallback is the same FOUC shell declared inline in
// index.marketing.html — React swaps it on mount, zero visible flash.
const DownloadPage = lazy(() =>
  import("./DownloadPage").then((m) => ({ default: m.DownloadPage })),
);

// Blog surfaces lazy-split for the same reason as /download — home page
// doesn't pay for the blog index or any post body. Posts themselves are
// lazy-loaded a second time inside BlogPost via the registry.
const BlogIndex = lazy(() => import("./blog/BlogIndex").then((m) => ({ default: m.BlogIndex })));
const BlogPost = lazy(() => import("./blog/BlogPost").then((m) => ({ default: m.BlogPost })));

// Mirrors the FOUC shell in index.marketing.html so a slow /download
// chunk fetch shows the same brand background as the initial paint, not
// a white flash. Uses CSS custom properties directly (no hardcoded
// oklch) because by the time this renders the real stylesheet is
// already live — var() resolves to whatever src/styles.css +
// marketing-theme.css currently define, no drift possible.
function DownloadFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--background)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--muted-foreground)",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: 14,
      }}
    >
      Loading…
    </div>
  );
}

function App() {
  // No client router; pathname is enough for a handful of static routes.
  // If we grow past 3-4 pages, swap this for a lightweight router.
  const path = typeof window === "undefined" ? "/" : window.location.pathname;

  // Unknown paths previously fell through to the homepage, so
  // eazyserv.com/anything rendered the full marketing page under a 200.
  // Google indexes those as duplicates of the homepage. They now get a
  // real not-found view carrying `noindex`.
  const isDownload = path === "/download" || path === "/download/";
  const isBlogIndex = path === "/blog" || path === "/blog/";
  // Blog post slug extraction: any path matching `/blog/<slug>` (with or
  // without a trailing slash, no further segments). Trailing `.html` is
  // allowed because vite.marketing.config.ts emits `<slug>.html` per route
  // and Pages serves it under that URL even when the canonical is slashless.
  const blogSlugMatch = path.match(/^\/blog\/([^/]+?)(?:\.html)?\/?$/);
  const blogSlug = blogSlugMatch && blogSlugMatch[1] !== "" ? blogSlugMatch[1] : null;
  const blogPost = blogSlug && blogSlug !== "index" ? getPostBySlug(blogSlug) : undefined;

  // "/index.marketing.html" is how the home page is reached on the dev
  // server: this build's entry is index.marketing.html, and the npm script
  // only renames it to index.html after `vite build`. Vite serves it under
  // its real name, so dev has no "/" to land on.
  //
  // Without these two, `npm run dev` shows the 404 page on every load while
  // production works fine — which is exactly what happened when the
  // not-found route was introduced.
  const isHome =
    path === "/" || path === "" || path === "/index.html" || path === "/index.marketing.html";

  // Meta tags per route. Blog posts synthesize their meta from the post
  // registry; blog index uses a static ROUTE_META entry.
  let meta;
  if (isDownload) meta = ROUTE_META["/download"];
  else if (isBlogIndex) meta = ROUTE_META["/blog"];
  else if (blogPost)
    meta = {
      title: `${blogPost.title} · EazyServ`,
      description: blogPost.description,
      canonicalPath: `/blog/${blogPost.slug}`,
    };
  else if (isHome) meta = ROUTE_META["/"];
  else meta = NOT_FOUND_META;

  // Applied during render rather than in an effect so the tags are set
  // before a crawler's snapshot is taken. Writing to document.head is a
  // side effect on an object outside React's tree, so StrictMode's double
  // render is harmless — it simply sets the same values twice.
  applyRouteMeta(meta);

  if (isDownload)
    return (
      <Suspense fallback={<DownloadFallback />}>
        <DownloadPage />
      </Suspense>
    );
  if (blogPost)
    return (
      <Suspense fallback={<DownloadFallback />}>
        <BlogPost meta={blogPost} Component={blogPost.Component} />
      </Suspense>
    );
  if (isBlogIndex)
    return (
      <Suspense fallback={<DownloadFallback />}>
        <BlogIndex />
      </Suspense>
    );
  if (isHome) return <MarketingHome />;
  return <NotFoundPage />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
