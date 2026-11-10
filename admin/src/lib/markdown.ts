/**
 * The service-description markdown (SVC-430): paragraphs, bullet lists, numbered
 * lists, bold, italic and line breaks. Nothing else, and no raw HTML. The consumer
 * app renders the same text with react-markdown, with every other construct
 * switched off in the parser (src/components/service/ServiceDescription.tsx). This
 * file is the admin's Write / Preview, written by hand because the admin app
 * doesn't carry react-markdown.
 *
 * "The same" is a test, not a hope: src/components/service/ServiceDescription.test.tsx
 * in the consumer app runs one corpus through both and compares the HTML. That is
 * why this file imports nothing: the consumer's test loads it by relative path.
 *
 * The rules follow CommonMark for the constructs kept:
 * - A blank line ends a paragraph. A newline inside one stays a "\n" in the text,
 *   which both apps show as a line break (white-space: pre-line). Two trailing
 *   spaces or a trailing backslash give a <br>, as CommonMark does.
 * - A list item starts with -, + or * (bullets) or 1. / 1) (numbered; the first
 *   number is the list's start). A different marker starts a new list. Lines
 *   indented to the item's text belong to it, so lists nest. An unindented line
 *   straight after an item's text continues it (a lazy continuation). A blank
 *   line between items, or between two blocks of one item, makes the list loose:
 *   each item's text is then wrapped in a paragraph.
 * - * and _ emphasis use CommonMark's delimiter-run rules: _ never works inside a
 *   word, an unmatched delimiter stays literal, ** is bold and * is italic.
 * - A backslash before ASCII punctuation makes it literal.
 * - Everything else (#, >, `, [text](url), <tags>, &amp;, ---) is plain text.
 *
 * The output is data. Rendering it (lib/markdown-view.tsx) puts every string in
 * as a React text child, so nothing typed here can become an element.
 */

export type MdInline = string | { type: "br" } | { type: "strong" | "em"; children: MdInline[] };

export type MdBlock =
  | { type: "p"; children: MdInline[] }
  | { type: "ul"; tight: boolean; items: MdBlock[][] }
  | { type: "ol"; tight: boolean; start: number; items: MdBlock[][] };

/** The description as blocks. Empty or whitespace-only text is []. */
export function parseMarkdown(source: string): MdBlock[] {
  // CRLF from a Windows paste, and U+0000 as CommonMark replaces it.
  const text = source.replace(/\r\n?/g, "\n").replace(/\0/g, "�");
  if (text.trim() === "") return [];
  return parseBlocks(text.split("\n").map(expandLeadingTabs)).blocks;
}

// --- Blocks --------------------------------------------------------------------

function expandLeadingTabs(line: string): string {
  const lead = /^[ \t]*/.exec(line)![0];
  if (!lead.includes("\t")) return line;
  let width = 0;
  for (const char of lead) width = char === "\t" ? width + 4 - (width % 4) : width + 1;
  return " ".repeat(width) + line.slice(lead.length);
}

const isBlank = (line: string) => /^[ \t]*$/.test(line);
const indentOf = (line: string) => /^ */.exec(line)![0].length;

interface Marker {
  ordered: boolean;
  /** The bullet character, or the numbered list's delimiter (. or )). */
  char: string;
  start: number;
  /** Where the item's text starts: its continuation lines are indented to here. */
  contentIndent: number;
  /** The first line's text, after the marker. */
  rest: string;
}

const MARKER = /^( *)([-+*]|(\d{1,9})([.)]))( +|$)(.*)$/;

function listMarker(line: string): Marker | null {
  const match = MARKER.exec(line);
  if (!match) return null;
  const [, lead, marker, digits, delimiter, gap, rest] = match;
  const width = lead.length + marker.length;
  // Five or more spaces after the marker: the text starts one space in, as in
  // CommonMark; an empty first line also counts as one space.
  const contentIndent = rest === "" || gap.length > 4 ? width + 1 : width + gap.length;
  return {
    ordered: digits !== undefined,
    char: delimiter ?? marker,
    start: digits !== undefined ? Number(digits) : 1,
    contentIndent,
    rest: gap.length > 4 ? " ".repeat(gap.length - 1) + rest : rest,
  };
}

const sameList = (a: Marker, b: Marker) => a.ordered === b.ordered && a.char === b.char;

/** A list can cut a paragraph short only with text, and only a numbered one that starts at 1. */
const canInterrupt = (marker: Marker) =>
  marker.rest.trim() !== "" && (!marker.ordered || marker.start === 1);

/** `gaps`: a blank line sat between two of these blocks (it makes a parent item loose). */
function parseBlocks(lines: string[]): { blocks: MdBlock[]; gaps: boolean } {
  const blocks: MdBlock[] = [];
  let gaps = false;
  let blankBefore = false;
  let i = 0;
  while (i < lines.length) {
    if (isBlank(lines[i])) {
      blankBefore = true;
      i++;
      continue;
    }
    if (blankBefore && blocks.length > 0) gaps = true;
    blankBefore = false;

    const marker = listMarker(lines[i]);
    if (marker) {
      const list = parseList(lines, i, marker);
      blocks.push(list.block);
      i = list.next;
      continue;
    }

    const paragraph = [lines[i]];
    i++;
    while (i < lines.length && !isBlank(lines[i])) {
      const next = listMarker(lines[i]);
      if (next && canInterrupt(next)) break;
      paragraph.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", children: parseInline(paragraph) });
  }
  return { blocks, gaps };
}

/** Leaves `next` on any blank lines after the list, so the caller sees the gap. */
function parseList(lines: string[], from: number, first: Marker): { block: MdBlock; next: number } {
  const items: MdBlock[][] = [];
  let loose = false;
  let i = from;

  while (i < lines.length) {
    const marker = listMarker(lines[i]);
    if (!marker || !sameList(marker, first)) break;
    const content = [marker.rest];
    let lastWasText = marker.rest.trim() !== "";
    let blanks = 0;
    i++;
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) {
        // An item that starts empty ends at its first blank line.
        if (content.length === 1 && marker.rest.trim() === "") break;
        blanks++;
        i++;
        continue;
      }
      if (indentOf(line) >= marker.contentIndent) {
        for (; blanks > 0; blanks--) content.push("");
        content.push(line.slice(marker.contentIndent));
        lastWasText = true;
        i++;
        continue;
      }
      if (blanks === 0 && lastWasText && !listMarker(line)) {
        content.push(line); // lazy continuation
        i++;
        continue;
      }
      break;
    }
    i -= blanks; // the trailing blank lines aren't the item's

    const parsed = parseBlocks(content);
    if (parsed.gaps) loose = true;
    items.push(parsed.blocks);

    let after = i;
    while (after < lines.length && isBlank(lines[after])) after++;
    if (after === i) continue; // no blank: the loop checks the next line for a sibling
    const sibling = after < lines.length ? listMarker(lines[after]) : null;
    if (!sibling || !sameList(sibling, first)) break;
    loose = true;
    i = after;
  }

  const tight = !loose;
  return {
    block: first.ordered
      ? { type: "ol", tight, start: first.start, items }
      : { type: "ul", tight, items },
    next: i,
  };
}

// --- Inline --------------------------------------------------------------------

/** Stands in for a hard line break while the paragraph is one string. */
const HARD_BREAK = "\0";

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const isWhitespace = (char: string | undefined) =>
  char === undefined || char === HARD_BREAK || /\s/u.test(char);
const isPunctuation = (char: string | undefined) =>
  char !== undefined && /[\p{P}\p{S}]/u.test(char);

interface Delimiter {
  kind: "delim";
  char: "*" | "_";
  count: number;
  original: number;
  canOpen: boolean;
  canClose: boolean;
}

type Piece = { kind: "text"; value: string } | Delimiter | { kind: "node"; node: MdInline };

function joinLines(lines: string[]): string {
  let text = "";
  lines.forEach((raw, index) => {
    let line = raw.replace(/^[ \t]+/, "");
    const last = index === lines.length - 1;
    if (last) {
      text += line.replace(/[ \t]+$/, "");
      return;
    }
    const trailingBackslashes = /\\+$/.exec(line)?.[0].length ?? 0;
    let hard = false;
    if (/ {2,}$/.test(line)) hard = true;
    else if (trailingBackslashes % 2 === 1) {
      hard = true;
      line = line.slice(0, -1);
    }
    text += line.replace(/[ \t]+$/, "") + (hard ? HARD_BREAK : "") + "\n";
  });
  return text;
}

function parseInline(lines: string[]): MdInline[] {
  const chars = Array.from(joinLines(lines));
  const pieces: Piece[] = [];
  let text = "";
  const flush = () => {
    if (text) pieces.push({ kind: "text", value: text });
    text = "";
  };

  let i = 0;
  while (i < chars.length) {
    const char = chars[i];
    if (char === "\\" && i + 1 < chars.length && ASCII_PUNCTUATION.test(chars[i + 1])) {
      text += chars[i + 1];
      i += 2;
    } else if (char === HARD_BREAK) {
      flush();
      // No "\n" after it: under pre-line that would be a second break.
      pieces.push({ kind: "node", node: { type: "br" } });
      i += 2; // the break and its newline
    } else if (char === "*" || char === "_") {
      let end = i;
      while (chars[end] === char) end++;
      const before = chars[i - 1];
      const after = chars[end];
      const leftFlanking =
        !isWhitespace(after) &&
        (!isPunctuation(after) || isWhitespace(before) || isPunctuation(before));
      const rightFlanking =
        !isWhitespace(before) &&
        (!isPunctuation(before) || isWhitespace(after) || isPunctuation(after));
      flush();
      pieces.push({
        kind: "delim",
        char,
        count: end - i,
        original: end - i,
        canOpen:
          char === "*" ? leftFlanking : leftFlanking && (!rightFlanking || isPunctuation(before)),
        canClose:
          char === "*" ? rightFlanking : rightFlanking && (!leftFlanking || isPunctuation(after)),
      });
      i = end;
    } else {
      text += char;
      i++;
    }
  }
  flush();
  matchEmphasis(pieces);
  return toInlines(pieces);
}

/** CommonMark's "process emphasis", left to right over the closers. */
function matchEmphasis(pieces: Piece[]): void {
  let closerAt = 0;
  while (closerAt < pieces.length) {
    const closer = pieces[closerAt];
    if (closer.kind !== "delim" || !closer.canClose || closer.count === 0) {
      closerAt++;
      continue;
    }
    let openerAt = -1;
    for (let j = closerAt - 1; j >= 0; j--) {
      const opener = pieces[j];
      if (opener.kind !== "delim" || opener.char !== closer.char || !opener.canOpen) continue;
      if (opener.count === 0) continue;
      // The "rule of 3": a run that can both open and close can't pair across a
      // multiple of 3 unless both are multiples of 3.
      const ruleOfThree =
        (opener.canClose || closer.canOpen) &&
        (opener.original + closer.original) % 3 === 0 &&
        !(opener.original % 3 === 0 && closer.original % 3 === 0);
      if (!ruleOfThree) {
        openerAt = j;
        break;
      }
    }
    if (openerAt < 0) {
      closerAt++;
      continue;
    }
    const opener = pieces[openerAt] as Delimiter;
    const use = opener.count >= 2 && closer.count >= 2 ? 2 : 1;
    opener.count -= use;
    closer.count -= use;
    const inner = pieces.slice(openerAt + 1, closerAt);
    pieces.splice(openerAt + 1, inner.length, {
      kind: "node",
      node: { type: use === 2 ? "strong" : "em", children: toInlines(inner) },
    });
    closerAt = openerAt + 2; // the same closer, which may have more to give
  }
}

/** Unmatched delimiters become their characters; neighbouring text merges. */
function toInlines(pieces: Piece[]): MdInline[] {
  const out: MdInline[] = [];
  const push = (value: string) => {
    if (!value) return;
    const last = out[out.length - 1];
    if (typeof last === "string") out[out.length - 1] = last + value;
    else out.push(value);
  };
  for (const piece of pieces) {
    if (piece.kind === "text") push(piece.value);
    else if (piece.kind === "delim") push(piece.char.repeat(piece.count));
    else out.push(piece.node);
  }
  return out;
}

// --- Counting ----------------------------------------------------------------------

/**
 * The length the backend's 2000 limit counts: Python's len(), one per code point.
 * "😀".length is 2 in JavaScript but 1 there.
 */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}
