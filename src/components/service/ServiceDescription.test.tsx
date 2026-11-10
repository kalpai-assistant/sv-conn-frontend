/**
 * SVC-430: the consumer's description renderer, and proof that it matches the
 * admin console's preview.
 *
 * The admin app can't carry react-markdown, so its preview is a hand-written
 * parser (admin/src/lib/markdown.ts). That file imports nothing, so it's loaded
 * here by relative path: no admin tsconfig paths, no admin node_modules. Its
 * blocks are turned into elements by a tiny mapper below, the same mapping as
 * admin/src/lib/markdown-view.tsx (which admin's own tests cover), and both
 * outputs are compared as HTML with the class attributes left out.
 */
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServiceDescription } from "./ServiceDescription";
import { parseMarkdown, type MdBlock, type MdInline } from "../../../admin/src/lib/markdown";

function adminInline(nodes: MdInline[]): ReactNode[] {
  return nodes.map((node, key) => {
    if (typeof node === "string") return node;
    if (node.type === "br") return createElement("br", { key });
    return createElement(node.type, { key }, ...adminInline(node.children));
  });
}

function adminBlock(node: MdBlock, key: number, inTightItem = false): ReactNode {
  if (node.type === "p") {
    return createElement(inTightItem ? Fragment : "p", { key }, ...adminInline(node.children));
  }
  const items = node.items.map((blocks, index) =>
    createElement("li", { key: index }, ...blocks.map((b, i) => adminBlock(b, i, node.tight))),
  );
  const props = node.type === "ol" && node.start !== 1 ? { key, start: node.start } : { key };
  return createElement(node.type, props, ...items);
}

/**
 * HTML without classes, and without the "\n" react-markdown leaves where it
 * doesn't render: between a list's items and between top-level blocks. Inside a
 * <p> or <li> (white-space: pre-line) every "\n" is compared, and the DOM test
 * below checks none of react-markdown's separators survive there.
 */
function normalise(html: string): string {
  return html
    .replace(/ class="[^"]*"/g, "")
    .replace(/(<(?:ul|ol)(?: [^>]*)?>|<\/li>)\n+/g, "$1")
    .replace(/\n+(?=<li[ >]|<\/(?:ul|ol)>)/g, "")
    .replace(/(<\/(?:p|ul|ol)>)\n+(?=<(?:p|ul|ol)[ >])/g, "$1");
}

/** A newline-only text at a <p>/<li> edge or beside a block, or a newline after a <br>. */
function strayNewlines(container: HTMLElement): string[] {
  const found: string[] = [];
  container.querySelectorAll("p, li").forEach((element) => {
    const nodes = Array.from(element.childNodes);
    nodes.forEach((node, index) => {
      if (node.nodeType !== Node.TEXT_NODE) return;
      const text = node.textContent ?? "";
      const previous = nodes[index - 1];
      const next = nodes[index + 1];
      const isBlock = (n?: ChildNode) => !!n && /^(P|UL|OL)$/.test(n.nodeName);
      if (previous?.nodeName === "BR" && text.startsWith("\n"))
        found.push(`after br in ${element.nodeName}`);
      if (/^\n+$/.test(text) && (!previous || !next || isBlock(previous) || isBlock(next)))
        found.push(`separator in ${element.nodeName}`);
    });
  });
  return found;
}

function consumerHtml(text: string): string {
  const html = renderToStaticMarkup(<ServiceDescription text={text} />);
  return normalise(html.replace(/^<div>/, "").replace(/<\/div>$/, ""));
}

function adminHtml(text: string): string {
  const blocks = parseMarkdown(text);
  return normalise(renderToStaticMarkup(<>{blocks.map((b, i) => adminBlock(b, i))}</>));
}

const nested = (depth: number) =>
  Array.from({ length: depth }, (_, level) => `${"  ".repeat(level)}- level ${level + 1}`).join(
    "\n",
  );

// The emoji are astral, so this is 2000 code points but more UTF-16 units.
const LONG_EMOJI = `${"🧹 **Deep clean** 🧽\n".repeat(80)}${"😀".repeat(480)}`;

const CORPUS: Record<string, string> = {
  plain: "A plain sentence.",
  "a newline in a paragraph": "First line\nsecond line",
  "two paragraphs": "Para one\n\nPara two",
  "leading and trailing spaces on lines": "  indented start\n   continued   \nend  ",
  "dash bullets": "- a\n- b\n- c",
  "star and plus bullets": "* a\n* b\n\n+ c",
  "a change of bullet starts a new list": "- a\n+ b\n* c",
  "numbered with dots": "1. one\n2. two\n3. three",
  "numbered with ) and a start of 3": "3) three\n4) four",
  "numbered with a start of 0": "0. zero\n1. one",
  "a loose list": "- a\n- b\n\n- c",
  "a loose item": "- a\n\n  more about a\n- b",
  "nested lists": "- a\n  - b\n    - c\n  - d\n- e",
  "a bullet list inside a numbered one": "1. a\n   - b\n   - c\n2. d",
  "nine levels": nested(9),
  "lazy continuation": "- a\nstill a\n- b",
  "lazy continuation of a nested item": "- a\n  - b\nstill b",
  "a bullet interrupts a paragraph": "Includes:\n- a\n- b",
  "a numbered item other than 1 doesn't": "Total\n2. not a list",
  "a 1. interrupts": "Steps\n1. first",
  "an empty item": "-\n  foo\n- bar",
  "an empty item then a blank": "-\n\n  foo",
  "list then paragraph": "- a\n- b\n\nAfter the list.",
  bold: "**bold** and __bold__",
  italic: "*italic* and _italic_",
  "bold and italic together": "***both*** and ___both___",
  "nested emphasis": "**bold *nested* bold** and *a **b** c*",
  "unclosed bold": "**not closed",
  "unclosed italic": "*a and b",
  "spaced stars": "a * b * c",
  "underscores inside a word": "snake_case_word and __init__",
  "stars inside a word": "2*3*4 and un*frigging*believable",
  "lone delimiters": "**\n\n*\n\n_",
  "rule of three": "*foo**bar**baz*",
  "emphasis across a newline": "*one\ntwo*",
  "a script tag": "<script>alert(1)</script>",
  "inline html": "a <b>bold</b> <i>x</i> b",
  "an html block": "<div>\nhello\n</div>",
  "a heading": "# Heading\n## Smaller",
  "a hash mid-line": "Call #1 today",
  "a block quote": "> quoted",
  "inline code": "use `code` here",
  "a code fence": "```\ncode\n```",
  "an indented line": "    four spaces in",
  "a link": "[link](https://example.com)",
  "an image": "![alt](x.png)",
  "an autolink": "<https://example.com>",
  "a reference definition": "[a]: https://example.com\n\n[a]",
  "character references": "&amp; &copy; &#35;",
  "a thematic break": "---\n\n***",
  "a setext underline": "Title\n=====",
  "a hard break with spaces": "line  \nbreak",
  "a hard break with a backslash": "line\\\nbreak",
  "a backslash at the very end": "end\\",
  escapes: "\\*not italic\\* and \\_not\\_ and \\# and \\\\",
  CRLF: "- a\r\n- b\r\n\r\nPara\r\nline two",
  "a lone CR": "one\rtwo",
  "a tab before a nested marker": "- a\n\t- b",
  "2000 code points with emoji": LONG_EMOJI,
  realistic:
    "What's included:\n- Basin fitting\n- Leak test, *if* needed\n\n**Not included:** pipes and taps.\n\n1. We arrive\n2. We fit it\n3. You check it",
};

describe("ServiceDescription matches the admin preview", () => {
  it("the long emoji case really is 2000 code points", () => {
    expect(Array.from(LONG_EMOJI).length).toBe(2000);
    expect(LONG_EMOJI.length).toBeGreaterThan(2000);
  });

  for (const [name, text] of Object.entries(CORPUS)) {
    it(name, () => {
      expect(adminHtml(text)).toBe(consumerHtml(text));
    });
  }

  it("leaves no stray newline inside a paragraph or item, where pre-line would show it", () => {
    for (const text of Object.values(CORPUS)) {
      const { container, unmount } = render(<ServiceDescription text={text} />);
      expect(strayNewlines(container), text).toEqual([]);
      unmount();
    }
  });

  it("keeps a newline between two inline pieces, which is a real line break", () => {
    const { container } = render(<ServiceDescription text={"**a**\n**b**\n\n- *c*\n  *d*"} />);
    expect(container.querySelector("p")!.textContent).toBe("a\nb");
    expect(container.querySelector("li")!.textContent).toBe("c\nd");
  });
});

describe("ServiceDescription", () => {
  it("renders nothing for an empty or blank description", () => {
    expect(renderToStaticMarkup(<ServiceDescription text="" />)).toBe("");
    expect(renderToStaticMarkup(<ServiceDescription text={"  \n\t\n"} />)).toBe("");
  });

  it("renders lists, bold and italic as elements", () => {
    const { container } = render(<ServiceDescription text={"**Bold** *it*\n\n- a\n- b\n\n1. c"} />);
    expect(container.querySelector("strong")?.textContent).toBe("Bold");
    expect(container.querySelector("em")?.textContent).toBe("it");
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")).toHaveLength(1);
  });

  it("shows a script tag as text and creates no element from it", () => {
    const { container } = render(<ServiceDescription text={"<script>alert(1)</script>"} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toBe("<script>alert(1)</script>");
  });

  it("makes no link, heading, image or code element", () => {
    const { container } = render(
      <ServiceDescription text={"# h\n\n[a](https://x.com) ![i](x.png) `c` <https://y.com>"} />,
    );
    expect(container.querySelector("a, h1, img, code, pre, blockquote, hr")).toBeNull();
    expect(container.textContent).toContain("# h");
    expect(container.textContent).toContain("[a](https://x.com)");
  });

  it("shows a newline inside a paragraph as a line break", () => {
    const { container } = render(<ServiceDescription text={"one\ntwo"} />);
    const p = container.querySelector("p")!;
    expect(p.className).toContain("whitespace-pre-line");
    expect(p.textContent).toBe("one\ntwo");
  });
});
