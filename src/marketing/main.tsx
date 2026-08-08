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

import "../styles.css";
// Must come after styles.css — it redefines the brand tokens for this build
// only, so the marketing site is blue while the app stays purple. Reversing
// these two imports silently leaves the page purple.
import "./marketing-theme.css";

function App() {
  // No client router; pathname is enough for two static routes. If we
  // grow past 3-4 pages, swap this for a lightweight router.
  const path = typeof window === "undefined" ? "/" : window.location.pathname;
  if (path === "/download" || path.startsWith("/download/")) return <DownloadPage />;
  return <MarketingHome />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
