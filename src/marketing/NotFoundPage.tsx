/**
 * Not-found view for the marketing site.
 *
 * Before this, every unknown URL rendered the full homepage: Cloudflare's
 * SPA fallback rewrites `/*` to index.html with a 200, and main.tsx
 * treated anything that wasn't /download as the home route. So
 * eazyserv.com/anything looked like a real page to a crawler and could be
 * indexed as a duplicate of the homepage.
 *
 * A static host can't return a genuine 404 status here — the shared
 * public/_redirects rule belongs to the app build too, and narrowing it
 * would break the app's client-side routes. The `noindex` applied in
 * seo.ts is what actually keeps these URLs out of the index; the status
 * code matters far less.
 *
 * Kept deliberately plain: no header, no footer, no imagery. Someone who
 * lands here wants out, and the one job is a clear route back.
 */
import { ArrowLeft } from "lucide-react";

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">404</p>

      <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.02em] text-foreground md:text-4xl">
        We couldn't find that page
      </h1>

      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base">
        The link may be out of date, or the address might have a typo in it.
      </p>

      <a
        href="/"
        className="group mt-8 inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back to home
      </a>
    </main>
  );
}
