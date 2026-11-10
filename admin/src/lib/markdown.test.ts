/**
 * The description parser on its own (SVC-430). The consumer app's
 * ServiceDescription.test.tsx also runs a corpus through this file and
 * react-markdown and compares them; admin CI doesn't run that test, so the
 * subset's rules are pinned here too.
 */
import { describe, expect, it } from "vitest";
import { codePointLength, parseMarkdown, type MdBlock, type MdInline } from "./markdown";

const p = (...children: MdInline[]): MdBlock => ({ type: "p", children });
const strong = (...children: MdInline[]): MdInline => ({ type: "strong", children });
const em = (...children: MdInline[]): MdInline => ({ type: "em", children });
const br: MdInline = { type: "br" };
const ul = (items: MdBlock[][], tight = true): MdBlock => ({ type: "ul", tight, items });
const ol = (items: MdBlock[][], start = 1, tight = true): MdBlock => ({
  type: "ol",
  tight,
  start,
  items,
});

describe("parseMarkdown: blocks", () => {
  it("is empty for empty or blank input", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("  \n\t\n ")).toEqual([]);
  });

  it("splits paragraphs on a blank line and keeps a single newline", () => {
    expect(parseMarkdown("one\ntwo\n\nthree")).toEqual([p("one\ntwo"), p("three")]);
  });

  it("trims each line's leading spaces and a single trailing one", () => {
    expect(parseMarkdown("   a \n   b  ")).toEqual([p("a\nb")]);
    // Two or more trailing spaces before a newline are a hard break (CommonMark).
    expect(parseMarkdown("a   \nb")).toEqual([p("a", br, "b")]);
  });

  it("reads CRLF and a lone CR as LF", () => {
    expect(parseMarkdown("a\r\nb\r\n\r\nc\rd")).toEqual([p("a\nb"), p("c\nd")]);
  });

  it("parses bullet lists with -, * and +", () => {
    expect(parseMarkdown("- a\n- b")).toEqual([ul([[p("a")], [p("b")]])]);
    expect(parseMarkdown("* a\n+ b")).toEqual([ul([[p("a")]]), ul([[p("b")]])]);
  });

  it("parses numbered lists with . or ) and keeps the start number", () => {
    expect(parseMarkdown("1. a\n2. b")).toEqual([ol([[p("a")], [p("b")]])]);
    expect(parseMarkdown("3) a\n4) b")).toEqual([ol([[p("a")], [p("b")]], 3)]);
    expect(parseMarkdown("1. a\n1) b")).toEqual([ol([[p("a")]]), ol([[p("b")]])]);
  });

  it("nests a list indented to the item's text", () => {
    expect(parseMarkdown("- a\n  - b\n    - c\n- d")).toEqual([
      ul([[p("a"), ul([[p("b"), ul([[p("c")]])]])], [p("d")]]),
    ]);
  });

  it("nests nine levels deep, with no cap", () => {
    const text = Array.from({ length: 9 }, (_, i) => `${"  ".repeat(i)}- ${i + 1}`).join("\n");
    let depth = 0;
    let blocks = parseMarkdown(text);
    while (blocks.length > 0) {
      const list = blocks.find((b) => b.type === "ul");
      if (!list || list.type !== "ul") break;
      depth++;
      blocks = list.items[0];
    }
    expect(depth).toBe(9);
  });

  it("marks a list loose when a blank line separates items or an item's blocks", () => {
    expect(parseMarkdown("- a\n\n- b")).toEqual([ul([[p("a")], [p("b")]], false)]);
    expect(parseMarkdown("- a\n\n  more\n- b")).toEqual([
      ul([[p("a"), p("more")], [p("b")]], false),
    ]);
  });

  it("continues an item with an unindented line straight after its text", () => {
    expect(parseMarkdown("- a\nstill a")).toEqual([ul([[p("a\nstill a")]])]);
  });

  it("lets a bullet, or a 1., cut a paragraph short, but not another number", () => {
    expect(parseMarkdown("Includes:\n- a")).toEqual([p("Includes:"), ul([[p("a")]])]);
    expect(parseMarkdown("Steps\n1. a")).toEqual([p("Steps"), ol([[p("a")]])]);
    expect(parseMarkdown("Total\n2. not a list")).toEqual([p("Total\n2. not a list")]);
  });

  it("ends an empty first item at a blank line", () => {
    expect(parseMarkdown("-\n\n  foo")).toEqual([ul([[]]), p("foo")]);
  });

  it("leaves every other construct as text", () => {
    for (const text of ["# Heading", "> quote", "`code`", "[a](https://x.com)", "---", "&amp;"]) {
      expect(parseMarkdown(text)).toEqual([p(text)]);
    }
    expect(parseMarkdown("    indented")).toEqual([p("indented")]);
  });
});

describe("parseMarkdown: inline", () => {
  it("reads ** and __ as bold, * and _ as italic", () => {
    expect(parseMarkdown("**a** __b__ *c* _d_")).toEqual([
      p(strong("a"), " ", strong("b"), " ", em("c"), " ", em("d")),
    ]);
  });

  it("nests emphasis", () => {
    expect(parseMarkdown("***x***")).toEqual([p(em(strong("x")))]);
    expect(parseMarkdown("**bold *it* bold**")).toEqual([p(strong("bold ", em("it"), " bold"))]);
    expect(parseMarkdown("*foo**bar**baz*")).toEqual([p(em("foo", strong("bar"), "baz"))]);
  });

  it("leaves an unmatched delimiter as text", () => {
    expect(parseMarkdown("**not closed")).toEqual([p("**not closed")]);
    expect(parseMarkdown("***x**")).toEqual([p("*", strong("x"))]);
    expect(parseMarkdown("a * b * c")).toEqual([p("a * b * c")]);
  });

  it("never treats _ inside a word as emphasis", () => {
    expect(parseMarkdown("snake_case_word")).toEqual([p("snake_case_word")]);
    expect(parseMarkdown("2*3*4")).toEqual([p("2", em("3"), "4")]);
  });

  it("makes a hard break from two trailing spaces or a trailing backslash", () => {
    expect(parseMarkdown("a  \nb")).toEqual([p("a", br, "b")]);
    expect(parseMarkdown("a\\\nb")).toEqual([p("a", br, "b")]);
    expect(parseMarkdown("end\\")).toEqual([p("end\\")]);
  });

  it("makes an escaped symbol literal", () => {
    expect(parseMarkdown("\\*a\\* \\\\")).toEqual([p("*a* \\")]);
  });

  it("keeps a script tag as plain text", () => {
    expect(parseMarkdown("<script>alert(1)</script>")).toEqual([p("<script>alert(1)</script>")]);
  });
});

describe("codePointLength", () => {
  it("counts an emoji as one, as Python's len does", () => {
    expect("😀".length).toBe(2);
    expect(codePointLength("😀")).toBe(1);
    expect(codePointLength("a😀b")).toBe(3);
    expect(codePointLength("")).toBe(0);
  });
});
