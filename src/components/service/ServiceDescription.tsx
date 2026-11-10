/**
 * A service's description, as markdown (SVC-430). Admins write it in the admin
 * console's Write / Preview, and both apps render the same subset: paragraphs,
 * bullet and numbered lists, bold, italic and line breaks. Nothing else, and no
 * raw HTML.
 *
 * Two layers keep it to that subset:
 * 1. `remarkSubset` switches every other construct off in the parser, so `# x`,
 *    `> x`, `[a](b)`, `<b>` and `&amp;` stay as the characters typed, exactly as
 *    the admin's preview (admin/src/lib/markdown.ts) shows them.
 * 2. `allowedElements` + `unwrapDisallowed` drop any other element that slipped
 *    through, keeping its text. There is no rehype-raw, so HTML never renders.
 *
 * ServiceDescription.test.tsx runs one corpus through this and the admin's parser
 * and compares the HTML.
 *
 * A newline inside a paragraph shows as a line break (white-space: pre-line),
 * because an admin pressing Enter means one.
 */
import { Children, isValidElement, type JSX, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

/** micromark construct names: everything outside the subset. */
const DISABLED_CONSTRUCTS = [
  "autolink",
  "blockQuote",
  "characterReference",
  "codeFenced",
  "codeIndented",
  "codeText",
  "definition",
  "headingAtx",
  "htmlFlow",
  "htmlText",
  "labelStartImage",
  "labelStartLink",
  "setextUnderline",
  "thematicBreak",
];

export const ALLOWED_ELEMENTS = ["p", "ul", "ol", "li", "strong", "em", "br"];

/**
 * A remark plugin with no dependency: it hands micromark a `disable` extension,
 * the parser's own switch for turning constructs off.
 */
function remarkSubset(this: unknown) {
  const data = (this as { data: () => Record<string, unknown> }).data();
  const extensions = (data.micromarkExtensions ??= []) as unknown[];
  extensions.push({ disable: { null: DISABLED_CONSTRUCTS } });
}

/** A <p>, <ul> or <ol>: react-markdown hands them over as our components below. */
const isBlock = (child: ReactNode) =>
  isValidElement(child) && (child.type === P || child.type === Ul || child.type === Ol);

/**
 * react-markdown puts a "\n" text between block elements and after each <br>.
 * Under pre-line those would show as extra blank lines, so they go: a newline
 * after a <br>, and a newline-only text at an item's edge or beside a block.
 * A newline between two inline pieces ("**a**\n**b**") is a real line break and
 * stays. The admin preview never emits the separators at all.
 */
function tidy(children: ReactNode): ReactNode[] {
  const list = Children.toArray(children);
  const out: ReactNode[] = [];
  list.forEach((child, index) => {
    if (typeof child !== "string") {
      out.push(child);
      return;
    }
    const previous = list[index - 1];
    let text =
      isValidElement(previous) && previous.type === "br" ? child.replace(/^\n/, "") : child;
    if (/^\n+$/.test(text)) {
      const next = list[index + 1];
      const atEdge = index === 0 || index === list.length - 1;
      const besideBlock = isBlock(previous) || isBlock(next);
      if (atEdge || besideBlock) text = "";
    }
    if (text) out.push(text);
  });
  return out;
}

type Props<T extends keyof JSX.IntrinsicElements> = JSX.IntrinsicElements[T] & {
  node?: unknown;
};

function P({ node: _node, children, ...props }: Props<"p">) {
  return (
    <p className="whitespace-pre-line" {...props}>
      {tidy(children)}
    </p>
  );
}
function Ul({ node: _node, ...props }: Props<"ul">) {
  return <ul className="list-disc space-y-1 pl-5" {...props} />;
}
function Ol({ node: _node, ...props }: Props<"ol">) {
  return <ol className="list-decimal space-y-1 pl-5" {...props} />;
}
function Li({ node: _node, children, ...props }: Props<"li">) {
  return (
    <li className="whitespace-pre-line" {...props}>
      {tidy(children)}
    </li>
  );
}

const COMPONENTS: Components = { p: P, ul: Ul, ol: Ol, li: Li };

/** CRLF from a Windows paste reads like LF, as in the admin's preview. */
export const normaliseDescription = (text: string) => text.replace(/\r\n?/g, "\n");

export function ServiceDescription({ text, className }: { text: string; className?: string }) {
  if (text.trim() === "") return null;
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkSubset]}
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        components={COMPONENTS}
      >
        {normaliseDescription(text)}
      </ReactMarkdown>
    </div>
  );
}
