/**
 * Blog index at /blog — chronological list of all posts.
 *
 * Minimal on purpose: a header, a list of post cards. No categories, no
 * tags, no author pages. Grows a section at a time as actual editorial
 * patterns emerge rather than scaffolding ten surfaces that stay empty.
 */
import { POSTS } from "./registry";
import { BlogLayout } from "./BlogLayout";

export function BlogIndex() {
  return (
    <BlogLayout>
      <section className="mx-auto max-w-3xl px-6 py-14 md:py-20">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          The EazyServ blog
        </p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.02em] text-foreground md:text-5xl">
          Notes from building a home-services marketplace, in public.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
          Our thinking as we figure out how to make booking a trusted professional feel as simple as
          ordering food. Honest updates, mistakes, and the occasional win.
        </p>

        <ul className="mt-14 space-y-6">
          {POSTS.map((post) => (
            <li key={post.slug}>
              <a
                href={`/blog/${post.slug}`}
                className="group block rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_40px_-12px_color-mix(in_oklab,var(--primary)_18%,transparent)] md:p-7"
              >
                <p className="text-xs text-muted-foreground">
                  <time dateTime={post.date}>{post.dateLabel}</time>
                  <span className="mx-2 text-border">·</span>
                  <span>{post.readMinutes} min read</span>
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-foreground transition-colors group-hover:text-primary md:text-3xl">
                  {post.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                  {post.subtitle}
                </p>
                <p className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Read the post →
                </p>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </BlogLayout>
  );
}
