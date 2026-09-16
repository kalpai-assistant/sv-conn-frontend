/**
 * Every AppGate branch keeps content out of the status bar (SVC-285).
 *
 * The iOS PWA asks iOS for the whole screen — `black-translucent` plus
 * `viewport-fit=cover` — and then never used the inset, so headers rendered
 * under the clock and the Dynamic Island. The fix hangs `safe-top` on the one
 * wrapper every route passes through, so screens inherit it rather than opting
 * in; the nine sticky headers and the four provider screens with no header at
 * all are covered without being touched.
 *
 * That only holds while *every* branch carries it. `AppGate` returns from five
 * places — public routes, the restoring splash, the login flow, admin, and the
 * normal shell — and two of them are easy to overlook because they render no
 * header of their own. A branch added later without the class reintroduces the
 * bug on whichever screens route through it.
 *
 * Asserted against the source rather than by rendering, because reaching the
 * branches through the component means driving auth state, the router and the
 * restore probe — a lot of scaffolding to prove a class name is present.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src", "routes", "__root.tsx");
const source = readFileSync(ROOT, "utf8");

/** The body of `AppGate`, which is the only function these rules apply to. */
function appGateBody(): string {
  const start = source.indexOf("function AppGate(");
  expect(start, "AppGate not found — was it renamed?").toBeGreaterThan(-1);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end === -1 ? undefined : end);
}

/**
 * The full-height wrappers that hold page content.
 *
 * Keyed on `min-h-screen` — the elements reaching the top of the viewport, so
 * the ones that meet the status bar.
 *
 * Centred spinners are excluded. Two branches render a lone `Loader2` in a
 * flex-centred screen while a profile or address query settles; there is no
 * header to protect, nothing sits near the top, and a blue band above an
 * otherwise empty screen would look like a rendering fault rather than a
 * status bar. They are exempt because of what they contain, not because they
 * were missed — this filter is that decision, written down.
 */
function contentWrappers(): string[] {
  return [...appGateBody().matchAll(/className="([^"]*min-h-screen[^"]*)"/g)]
    .map((m) => m[1])
    .filter((cls) => !cls.includes("items-center"));
}

describe("AppGate", () => {
  it("returns from the five branches this rule covers", () => {
    // A guard on the guard. If a branch is added or removed, the count moves
    // and this fails — so the next person reads the rule rather than finding
    // the new branch silently uncovered.
    expect(contentWrappers()).toHaveLength(5);
  });

  it("gives every full-height wrapper the top inset", () => {
    const missing = contentWrappers().filter((cls) => !cls.split(/\s+/).includes("safe-top"));

    expect(
      missing,
      "Add `safe-top` to this AppGate branch — without it, screens routed " +
        "through it render under the iOS status bar (SVC-285):\n  " +
        missing.join("\n  "),
    ).toEqual([]);
  });
});

describe("the utility behind it", () => {
  const styles = readFileSync(join(process.cwd(), "src", "styles.css"), "utf8");

  it("reads the inset rather than hardcoding a height", () => {
    // A fixed pixel value would be wrong on every device it was not measured
    // on — and wrong on Android and the browsers, where the inset is 0 and no
    // padding should be added at all.
    expect(styles).toMatch(/\.safe-top\s*\{[^}]*padding-top:\s*env\(safe-area-inset-top/);
  });

  it("paints the strip, not the element", () => {
    // The bug this replaced: `background-color` directly on `.safe-top` painted
    // the whole wrapper, and those wrappers are `min-h-screen` — so the entire
    // app came up brand blue on Android. Caught on device, not by a test,
    // because the first version of this file asserted the colour was declared
    // without asking *what* it covered.
    //
    // The colour belongs on the pseudo-element, whose height is the inset, and
    // `.safe-top` itself must set no background at all or it overrides the
    // `bg-background` beside it in the class list.
    const rule = styles.match(/\.safe-top\s*\{([^}]*)\}/);
    expect(rule?.[1], ".safe-top rule not found").toBeDefined();
    expect(rule?.[1]).not.toMatch(/background/);

    expect(styles).toMatch(
      /\.safe-top::before\s*\{[^}]*background-color:\s*var\(--color-primary\)/,
    );
  });

  it("sizes the strip from the inset so it collapses off iOS", () => {
    // Padding height and background extent are independent, so the strip has
    // to be zeroed explicitly rather than inheriting it from the padding. That
    // is what makes this inert on Android and in every browser.
    expect(styles).toMatch(/\.safe-top::before\s*\{[^}]*height:\s*env\(safe-area-inset-top/);
  });
});
