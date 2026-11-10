/**
 * A service description (SVC-430 markdown) as one plain line, for places that show
 * a one-line snippet or search the text (SearchSheet). The symbols of the subset
 * go: list markers, emphasis runs and backslash escapes. Every line break becomes
 * a space.
 *
 * This is a stripper, not a parser: a literal "*" written without a backslash
 * goes too, which costs nothing in a truncated snippet or a substring search.
 * The full description renders through ServiceDescription.
 */

const ESCAPED = /\\([!-/:-@[-`{-~])/g;
// An escaped character waits behind a private-use sentinel, so stripping can't touch it.
const SENTINEL = "";
const RESTORE = /(\d+)/g;

export function toPlainText(markdown: string): string {
  const kept: string[] = [];
  return (
    markdown
      .replace(/\r\n?/g, "\n")
      .replace(ESCAPED, (_, char: string) => {
        kept.push(char);
        return `${SENTINEL}${kept.length - 1}${SENTINEL}`;
      })
      // A list marker at a line's start: "- ", "* ", "+ ", "1. ", "2) ".
      .replace(/^[ \t]*(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/gm, "")
      .replace(/\*+/g, "")
      // _ only at a word's edge: snake_case keeps its underscores.
      .replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(RESTORE, (_, index: string) => kept[Number(index)])
  );
}
