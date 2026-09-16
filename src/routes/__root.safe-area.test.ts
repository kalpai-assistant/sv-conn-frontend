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

describe("screens that bypass AppGate", () => {
  /**
   * Some screens `return` from AppGate rather than rendering inside it, so they
   * replace the wrapper instead of nesting in it and inherit nothing. The
   * location gate is the one that matters — it draws its own full-height root
   * with a heading at the very top, and it is the first screen many users meet.
   *
   * Missed on the first pass and caught on a device: the gate was still
   * rendering against the status bar after the AppGate fix. Pinned here because
   * nothing about that file hints it is special.
   */
  it("gives the location gate the inset too", () => {
    const gate = readFileSync(join(process.cwd(), "src", "components", "LocationGate.tsx"), "utf8");
    const root = gate.match(/className="([^"]*min-h-screen[^"]*)"/);

    expect(root?.[1], "LocationGate has no full-height root — did it change?").toBeDefined();
    expect(
      root?.[1].split(/\s+/),
      "Add `safe-top` to LocationGate's root: it returns from AppGate rather " +
        "than rendering inside it, so it inherits nothing (SVC-285).",
    ).toContain("safe-top");
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

  it("paints the strip it clears", () => {
    // `black-translucent` means transparent, not colourless: the status bar
    // shows whatever is painted beneath it. Without a background the iOS PWA
    // would be the only surface with no status bar colour.
    expect(styles).toMatch(/\.safe-top\s*\{[^}]*background-color:\s*var\(--color-primary\)/);
  });
});
