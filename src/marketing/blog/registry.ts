/**
 * Blog post registry (SVC-378 Phase 5).
 *
 * A manual map of slug → metadata + React component instead of an MDX
 * build pipeline. Rationale:
 *   - MDX would need @mdx-js/rollup (~40 KB raw) + vite plugin + a few
 *     deps. Each one is a package.json edit, which is a shared-primitive
 *     touch — Run 03 is actively iterating on package.json for Storybook,
 *     so adding deps now means a coordinated rebase.
 *   - Beta-stage posts are authored by the founders, not a content team.
 *     They can author a .tsx just as easily as .mdx, and the review gates
 *     (lint + prettier + tsc) get stricter not laxer.
 *   - Lazy-loaded via React.lazy per-post, so adding a post doesn't
 *     grow the blog-index chunk.
 *
 * Graduating to MDX later: swap this file's shape for a `import.meta.glob`
 * over `./posts/*.mdx`, add the plugin, no change to BlogIndex/BlogPost
 * components.
 */
import { lazy, type LazyExoticComponent, type ComponentType } from "react";

export type PostMeta = {
  slug: string;
  title: string;
  subtitle: string;
  date: string;
  dateLabel: string; // Precomputed so BlogIndex doesn't need Intl per row.
  author: string;
  readMinutes: number;
  description: string; // Opengraph + meta description.
};

type PostEntry = PostMeta & {
  // Lazy so one post failing to compile doesn't block the blog from
  // loading, and so first-load of /blog doesn't drag every post's text.
  Component: LazyExoticComponent<ComponentType>;
};

export const POSTS: readonly PostEntry[] = [
  {
    slug: "why-pune",
    title: "Why we started EazyServ in Pune",
    subtitle:
      "On trust, doorsteps, and why a city of 7 million still asks for a plumber's number on WhatsApp.",
    date: "2026-11-24",
    dateLabel: "24 November 2026",
    author: "Vipul Rao, founder",
    readMinutes: 4,
    description:
      "Home services in Pune today still run on word-of-mouth phone numbers and hope. EazyServ is our attempt to replace that with verified professionals, upfront pricing, and a doorstep OTP you control.",
    Component: lazy(() => import("./posts/why-pune")),
  },
];

export function getPostBySlug(slug: string): PostEntry | undefined {
  return POSTS.find((p) => p.slug === slug);
}
