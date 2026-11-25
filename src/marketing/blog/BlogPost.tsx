/**
 * Single-post view at /blog/<slug>.
 *
 * Wraps the post's React component in BlogLayout + a prose container.
 * The `.prose-marketing` class below is defined inline (not in
 * src/styles.css) so this file owns its own typography rules — adding
 * `@tailwindcss/typography` would be a package.json touch (shared
 * primitive) for the sake of a surface with ~1 post.
 *
 * Post components should render semantic HTML (<h2>, <p>, <ul>, <ol>,
 * <blockquote>, <pre>, <a>) — all styled by the rules below.
 */
import { Suspense, type ComponentType } from "react";
import { ArrowRight } from "lucide-react";

import { BlogLayout } from "./BlogLayout";
import type { PostMeta } from "./registry";

export function BlogPost({ meta, Component }: { meta: PostMeta; Component: ComponentType }) {
  return (
    <BlogLayout>
      <article className="mx-auto max-w-3xl px-6 py-14 md:py-20">
        <header className="mb-10 border-b border-border/60 pb-10">
          <p className="text-xs text-muted-foreground">
            <time dateTime={meta.date}>{meta.dateLabel}</time>
            <span className="mx-2 text-border">·</span>
            <span>{meta.readMinutes} min read</span>
            <span className="mx-2 text-border">·</span>
            <span>{meta.author}</span>
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.025em] text-foreground md:text-5xl">
            {meta.title}
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
            {meta.subtitle}
          </p>
        </header>

        <div className="prose-marketing">
          <Suspense fallback={<PostLoadingSkeleton />}>
            <Component />
          </Suspense>
        </div>

        <aside className="mt-14 rounded-2xl border border-primary/20 bg-primary/5 p-7 text-center">
          <h2 className="text-lg font-semibold text-foreground md:text-xl">
            Ready to try EazyServ?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            We're live across select localities in Pune and adding more each week.
          </p>
          <a
            href="/download"
            className="focus-inset group mt-5 inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30 hover:brightness-110"
          >
            Download for Android
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </aside>
      </article>

      {/*
        Typography rules for post bodies. Scoped to .prose-marketing so
        they only apply to the post content, not the header/footer above.
        Measurements match the home page's section rhythm (text-base /
        leading-relaxed / mt-6 spacing).
      */}
      <style>{`
        .prose-marketing {
          font-size: 1.0625rem;
          line-height: 1.75;
          color: var(--foreground);
        }
        .prose-marketing > :first-child { margin-top: 0; }
        .prose-marketing h2 {
          margin-top: 2.5rem;
          margin-bottom: 1rem;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--foreground);
        }
        .prose-marketing h3 {
          margin-top: 2rem;
          margin-bottom: 0.75rem;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--foreground);
        }
        .prose-marketing p {
          margin-top: 1.25rem;
          margin-bottom: 0;
          color: var(--muted-foreground);
        }
        .prose-marketing p strong,
        .prose-marketing li strong { color: var(--foreground); font-weight: 600; }
        .prose-marketing a {
          color: var(--primary);
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 3px;
          transition: filter 0.15s;
        }
        .prose-marketing a:hover { filter: brightness(1.15); }
        .prose-marketing ul,
        .prose-marketing ol { margin-top: 1.25rem; padding-left: 1.5rem; }
        .prose-marketing ul { list-style: disc; }
        .prose-marketing ol { list-style: decimal; }
        .prose-marketing li {
          margin-top: 0.5rem;
          color: var(--muted-foreground);
        }
        .prose-marketing li::marker { color: var(--primary); }
        .prose-marketing blockquote {
          margin-top: 1.5rem;
          padding-left: 1.25rem;
          border-left: 3px solid color-mix(in oklab, var(--primary) 50%, transparent);
          color: var(--foreground);
          font-style: italic;
        }
        .prose-marketing hr {
          margin-top: 2.5rem;
          margin-bottom: 2.5rem;
          border-color: var(--border);
        }
      `}</style>
    </BlogLayout>
  );
}

function PostLoadingSkeleton() {
  return (
    <div className="min-h-[40vh] text-sm text-muted-foreground" aria-live="polite">
      Loading post…
    </div>
  );
}
