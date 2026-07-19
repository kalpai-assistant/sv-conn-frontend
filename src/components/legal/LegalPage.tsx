/**
 * Shared shell for /privacy, /terms, /refund (SVC-37).
 *
 * The three routes each import their .md file as raw text and hand it to
 * this component; content stays authoritative in Markdown, JSX stays a
 * one-line renderer. Business/legal edits touch the .md, no code review.
 *
 * Rendering uses `react-markdown` + `remark-gfm` (tables, task lists,
 * strikethrough). No `rehype-raw` — we deliberately don't allow HTML in
 * the MD source, so a stray tag can't sneak into a legal page.
 *
 * Element styling is done via a `components` map (not `@tailwindcss/typography`)
 * to avoid taking on a plugin dependency just for these three pages.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const mdComponents: Components = {
  h1: (props) => (
    <h1 className="mt-0 mb-6 text-2xl font-semibold text-foreground" {...props} />
  ),
  h2: (props) => (
    <h2 className="mt-8 mb-3 text-xl font-semibold text-foreground" {...props} />
  ),
  h3: (props) => (
    <h3 className="mt-6 mb-2 text-base font-semibold text-foreground" {...props} />
  ),
  p: (props) => <p className="my-3 text-[15px] leading-relaxed text-foreground" {...props} />,
  ul: (props) => (
    <ul className="my-3 list-disc space-y-1 pl-6 text-[15px] text-foreground" {...props} />
  ),
  ol: (props) => (
    <ol className="my-3 list-decimal space-y-1 pl-6 text-[15px] text-foreground" {...props} />
  ),
  li: (props) => <li className="leading-relaxed" {...props} />,
  a: (props) => (
    <a
      className="text-primary hover:underline"
      target={props.href?.startsWith("http") ? "_blank" : undefined}
      rel={props.href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    />
  ),
  strong: (props) => <strong className="font-semibold text-foreground" {...props} />,
  hr: () => <hr className="my-6 border-border" />,
  table: (props) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props) => (
    <th className="border-b border-border px-3 py-2 text-left font-semibold" {...props} />
  ),
  td: (props) => <td className="border-b border-border px-3 py-2" {...props} />,
};

export function LegalPage({
  markdown,
  lastUpdated,
}: {
  markdown: string;
  lastUpdated: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">Last updated: {lastUpdated}</p>

      <article>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {markdown}
        </ReactMarkdown>
      </article>

      <hr className="my-8 border-border" />
      <p className="text-xs text-muted-foreground">
        See also:{" "}
        <Link to="/privacy" className="text-primary hover:underline">
          Privacy
        </Link>
        {" · "}
        <Link to="/terms" className="text-primary hover:underline">
          Terms
        </Link>
        {" · "}
        <Link to="/refund" className="text-primary hover:underline">
          Refund
        </Link>
      </p>
    </div>
  );
}
