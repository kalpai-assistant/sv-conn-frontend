/**
 * Shared chrome for both /blog (index) and /blog/<slug> (single post).
 *
 * Pulls the home page's header styling in verbatim so the two surfaces
 * feel like one brand. The BlogLayout owns only the shell — section
 * content comes from children.
 */
import { ArrowLeft } from "lucide-react";

export function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[32rem]">
        <div className="absolute left-1/2 top-[-8rem] h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      </div>

      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            eazyserv.com
          </a>
          <a
            href="/download"
            className="focus-inset inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:shadow-md hover:brightness-110"
          >
            Download
          </a>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto max-w-3xl px-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} EazyServ Technologies India Private Limited
        </div>
      </footer>
    </div>
  );
}
