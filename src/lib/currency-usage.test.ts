/**
 * One money formatter, enforced (SVC-297).
 *
 * The bug this ticket reports was never in the formatter — `formatRupees` has
 * always been correct. It was that almost nothing called it: ~27 sites across
 * 16 files hand-rolled `₹{x.toLocaleString("en-IN")}`, or bare `₹{x}` with no
 * formatting at all, and one file defined its own local `money()` helper. Five
 * spellings of the same idea, and they disagreed the moment a value was
 * fractional.
 *
 * Fixing those sites once does not keep them fixed. The next screen that
 * renders a price will reach for `₹{...}` again unless something objects, so
 * this file objects — in CI, by name, with the fix in the failure message.
 *
 * It is a lint rule expressed as a test because the repo has no custom ESLint
 * plugin, and a test that reads source is cheaper than introducing one.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "tinyglobby";

// Resolved from the working directory rather than `import.meta.url`: vitest
// transforms this file, and the transformed module's URL is not a file: URL.
const SRC = join(process.cwd(), "src");

/**
 * Everything that renders. Tests are excluded — they assert on rendered output
 * and legitimately contain the symbol — as is `currency.ts` itself, which is
 * the one place allowed to spell it.
 */
const files = globSync("**/*.{ts,tsx}", {
  cwd: SRC,
  ignore: ["**/*.test.{ts,tsx}", "**/currency.ts", "**/routeTree.gen.ts", "**/types/**"],
});

/**
 * Strip comments and JSX comment blocks before scanning.
 *
 * Prose legitimately mentions money — "Tips are capped at ₹10,000", "min ₹499",
 * the note in IncomingRequestCard about Indian grouping. Those are text, not
 * rendered amounts, and flagging them would train people to ignore this test.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
}

/**
 * A rupee symbol followed by an interpolation — `₹{x}`, `₹${x}`, or the two
 * split across lines by the formatter, which is how ServiceSheet spelled it:
 *
 *     {label} ₹
 *     {ctaPrice.toLocaleString("en-IN")}
 *
 * Whitespace-tolerant on purpose. A pattern anchored to `₹{` would have missed
 * that site entirely and let a hardcoded symbol survive beside a formatter call
 * — the exact double-₹ this is meant to prevent.
 */
const INTERPOLATED_RUPEE = /₹\s*\$?\{/;

describe("every rendered amount goes through the formatter", () => {
  const offenders: string[] = [];

  for (const file of files) {
    const source = code(readFileSync(join(SRC, file), "utf8"));
    if (INTERPOLATED_RUPEE.test(source)) {
      offenders.push(file);
    }
  }

  it("has no hand-rolled rupee interpolation left", () => {
    // Also the double-₹ guard: `formatRupees` emits its own symbol, so a
    // hardcoded one surviving next to a formatter call renders "₹₹598.40".
    // That can only happen where a literal ₹ remains — which is exactly what
    // this catches, rather than trusting a careful read of the diff.
    expect(
      offenders,
      `Render money with formatRupees() from @/lib/currency — it emits its own ₹ symbol, ` +
        `so drop the hardcoded one. Found hand-rolled interpolation in:\n  ` +
        offenders.join("\n  "),
    ).toEqual([]);
  });
});

describe("rupees and paise are not mixed up", () => {
  /**
   * The 100× trap. `formatRupees(2400000)` on a paise field renders ₹24,00,000
   * where the real amount is ₹24,000 — on screens that move real money.
   *
   * The API makes this mechanically checkable rather than a matter of care:
   * every paise-denominated field is named `*_paise`. So the rule is simply
   * that the rupee formatter never receives one.
   */
  it("never passes a *_paise field to formatRupees", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = code(readFileSync(join(SRC, file), "utf8"));
      for (const call of source.matchAll(/formatRupees\(([^)]*)\)/g)) {
        if (/_paise\b/.test(call[1])) {
          offenders.push(`${file}: formatRupees(${call[1].trim()})`);
        }
      }
    }

    expect(
      offenders,
      `Paise fields must use formatPaise(), not formatRupees() — the amount would ` +
        `render 100× too large:\n  ` +
        offenders.join("\n  "),
    ).toEqual([]);
  });
});
