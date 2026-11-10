/**
 * Renders lib/markdown.ts's blocks as React elements (SVC-430). Text goes in as
 * text children, so React escapes it: `<script>` typed in a description shows as
 * those characters. Nothing here uses dangerouslySetInnerHTML.
 *
 * Elements and nesting match what react-markdown gives the consumer app for the
 * same text: a tight list item holds its text directly, a loose one wraps it in
 * <p>, and a numbered list that doesn't start at 1 carries `start`. The classes
 * mirror the consumer's ServiceDescription, so the preview reads like the app.
 */
import { Fragment, type ReactNode } from "react";
import { parseMarkdown, type MdBlock, type MdInline } from "./markdown";

const CLASSES = {
  p: "whitespace-pre-line",
  ul: "list-disc space-y-1 pl-5",
  ol: "list-decimal space-y-1 pl-5",
  li: "whitespace-pre-line",
} as const;

function inline(nodes: MdInline[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (typeof node === "string") return node;
    if (node.type === "br") return <br key={index} />;
    const children = inline(node.children);
    return node.type === "strong" ? (
      <strong key={index}>{children}</strong>
    ) : (
      <em key={index}>{children}</em>
    );
  });
}

function block(node: MdBlock, key: number, inTightItem = false): ReactNode {
  if (node.type === "p") {
    return inTightItem ? (
      <Fragment key={key}>{inline(node.children)}</Fragment>
    ) : (
      <p key={key} className={CLASSES.p}>
        {inline(node.children)}
      </p>
    );
  }
  const items = node.items.map((blocks, index) => (
    <li key={index} className={CLASSES.li}>
      {blocks.map((child, childIndex) => block(child, childIndex, node.tight))}
    </li>
  ));
  if (node.type === "ul") {
    return (
      <ul key={key} className={CLASSES.ul}>
        {items}
      </ul>
    );
  }
  return (
    <ol key={key} className={CLASSES.ol} start={node.start === 1 ? undefined : node.start}>
      {items}
    </ol>
  );
}

/** The rendered description, or null when there's nothing to show. */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source);
  if (blocks.length === 0) return null;
  return <div className={className}>{blocks.map((node, index) => block(node, index))}</div>;
}
