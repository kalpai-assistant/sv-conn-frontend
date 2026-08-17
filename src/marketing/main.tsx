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
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { MarketingHome } from "./MarketingHome";
import { DownloadPage } from "./DownloadPage";
import { NotFoundPage } from "./NotFoundPage";
import { applyRouteMeta, NOT_FOUND_META, ROUTE_META } from "./seo";

import "../styles.css";
// Must come after styles.css — it redefines the brand tokens for this build
// only, so the marketing site is blue while the app stays purple. Reversing
// these two imports silently leaves the page purple.
import "./marketing-theme.css";

function App() {
  // No client router; pathname is enough for a handful of static routes.
  // If we grow past 3-4 pages, swap this for a lightweight router.
  const path = typeof window === "undefined" ? "/" : window.location.pathname;

  // Unknown paths previously fell through to the homepage, so
  // eazyserv.com/anything rendered the full marketing page under a 200.
  // Google indexes those as duplicates of the homepage. They now get a
  // real not-found view carrying `noindex`.
  const isDownload = path === "/download" || path === "/download/";
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
  const meta = isDownload ? ROUTE_META["/download"] : isHome ? ROUTE_META["/"] : NOT_FOUND_META;

  // Applied during render rather than in an effect so the tags are set
  // before a crawler's snapshot is taken. Writing to document.head is a
  // side effect on an object outside React's tree, so StrictMode's double
  // render is harmless — it simply sets the same values twice.
  applyRouteMeta(meta);

  if (isDownload) return <DownloadPage />;
  if (isHome) return <MarketingHome />;
  return <NotFoundPage />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
