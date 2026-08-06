/**
 * Marketing SPA entry — separate from the app.
 *
 * Not TanStack Start, not TanStack Router. A plain Vite + React entry
 * that renders the marketing landing page and nothing else. This exists
 * because the app's SSR pipeline (TanStack Start → Nitro) requires a
 * server runtime that Cloudflare Pages Direct Upload can't host without
 * complex Workers wiring, and marketing content is static enough not to
 * need any of that.
 *
 * Legal pages (/privacy, /terms, /refund) are LINKED to app.eazyserv.com
 * where they already live — mirroring them here would duplicate content
 * and drift.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { MarketingHome } from "./MarketingHome";

import "../styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MarketingHome />
  </StrictMode>,
);
