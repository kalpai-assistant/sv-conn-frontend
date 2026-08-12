/**
 * Per-route metadata for the marketing SPA.
 *
 * Every route is served from the same index.marketing.html, so without
 * this every URL shares the homepage's <title>, description and canonical.
 * That is why /download was indistinguishable from / to a crawler:
 * identical title, identical canonical, so Google sees one page duplicated
 * rather than two pages.
 *
 * Google renders JavaScript before indexing, so setting these on mount
 * works. It is still second-best — the tags are absent from the initial
 * HTML, which costs nothing with Google but matters for crawlers that do
 * not execute JS (most social scrapers, some AI crawlers). If the site
 * grows past a few pages, pre-rendering one HTML file per route is the
 * proper fix; this keeps the zero-backend static build in the meantime.
 */

const SITE = "https://eazyserv.com";

export type RouteMeta = {
  title: string;
  description: string;
  /** Path only. Combined with SITE to form the absolute canonical. */
  canonicalPath: string;
  /** Keep the page out of the index — used for the not-found view. */
  noindex?: boolean;
};

export const ROUTE_META: Record<string, RouteMeta> = {
  "/": {
    title: "EazyServ — Home Services at Your Doorstep in Pune",
    description:
      "Book verified professionals for cleaning, plumbing, electrical, and salon services in Pune. Transparent pricing, doorstep OTP verification.",
    canonicalPath: "/",
  },
  "/download": {
    title: "Download the EazyServ App — Android & iPhone | Pune",
    description:
      "Get the EazyServ app to book home services in Pune. Direct Android download, plus an install guide for iPhone.",
    canonicalPath: "/download",
  },
};

export const NOT_FOUND_META: RouteMeta = {
  title: "Page not found — EazyServ",
  description: "That page doesn't exist. Head back to the EazyServ home page.",
  canonicalPath: "/",
  noindex: true,
};

/** Create the tag if it's missing, then set it. */
function setMeta(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

export function applyRouteMeta(meta: RouteMeta) {
  document.title = meta.title;

  setMeta(
    'meta[name="description"]',
    () => Object.assign(document.createElement("meta"), { name: "description" }),
    "content",
    meta.description,
  );

  setMeta(
    'link[rel="canonical"]',
    () => Object.assign(document.createElement("link"), { rel: "canonical" }),
    "href",
    SITE + meta.canonicalPath,
  );

  // og:title/og:description matter for link previews, which are a real
  // channel here — WhatsApp shares of /download should not read as the
  // homepage.
  setMeta(
    'meta[property="og:title"]',
    () => {
      const el = document.createElement("meta");
      el.setAttribute("property", "og:title");
      return el;
    },
    "content",
    meta.title,
  );
  setMeta(
    'meta[property="og:url"]',
    () => {
      const el = document.createElement("meta");
      el.setAttribute("property", "og:url");
      return el;
    },
    "content",
    SITE + meta.canonicalPath,
  );

  // A static host cannot return a real 404 status for an unknown path —
  // Cloudflare's SPA fallback rewrites everything to index.html with a
  // 200. `noindex` is what actually keeps junk URLs out of the index; the
  // status code is cosmetic by comparison. Removed again on real routes so
  // it cannot leak between client-side navigations.
  const robots = document.head.querySelector('meta[name="robots"]');
  if (meta.noindex) {
    setMeta(
      'meta[name="robots"]',
      () => Object.assign(document.createElement("meta"), { name: "robots" }),
      "content",
      "noindex, follow",
    );
  } else if (robots) {
    robots.remove();
  }
}
