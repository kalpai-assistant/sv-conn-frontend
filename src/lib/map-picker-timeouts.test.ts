/**
 * The three-way timeout invariant (SVC-357).
 *
 * `MAP_PICKER_LOCATE_TIMEOUT_MS` is the one source the picker, the gate's
 * locate action and the launch probe all read from. A future refactor that
 * re-introduces a hardcoded `15000`/`20000`/`10000` to any of those three
 * files silently drifts one caller's bound away from the others and recreates
 * the three-independent-timeouts problem this ticket exists to fix.
 *
 * The grep is deliberately *source-level* rather than runtime. A runtime test
 * for the value would prove only "the value is 15 seconds today", not
 * "nothing else wrote the value down".
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MAP_PICKER_LOCATE_TIMEOUT_MS } from "./map-picker-timeouts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");

/** Files that must only reference the timeout through the shared constant. */
const CONSUMERS = [
  "src/components/MapPicker.tsx",
  "src/components/LocationGate.tsx",
  "src/hooks/useLocationAvailability.ts",
] as const;

/**
 * The three raw values any of those three files used before SVC-357. Catches
 * every literal variant the codebase tends to use — bare `15000`, underscored
 * `15_000`, and the same for 20s / 10s.
 */
const BANNED_LITERALS = [
  /\b15[_,]?000\b/,
  /\b20[_,]?000\b/,
  /\b10[_,]?000\b/,
] as const;

describe("MAP_PICKER_LOCATE_TIMEOUT_MS (SVC-357)", () => {
  it("is the value SVC-357 picked", () => {
    // Not a strict assertion of a magic number — rather a guard against an
    // accidental edit that moves the value with no comment update beside it.
    // If the chosen value genuinely changes, update this test and the comment
    // in `map-picker-timeouts.ts` in the same commit.
    expect(MAP_PICKER_LOCATE_TIMEOUT_MS).toBe(15_000);
  });

  it.each(CONSUMERS)("has no hardcoded ms literal in %s", (relative) => {
    const absolute = resolve(repo, relative);
    const content = readFileSync(absolute, "utf-8");

    for (const banned of BANNED_LITERALS) {
      const match = content.match(banned);
      if (match) {
        throw new Error(
          `${relative} still contains the literal "${match[0]}" — route it through ` +
            `MAP_PICKER_LOCATE_TIMEOUT_MS instead. See lib/map-picker-timeouts.ts for ` +
            `why these three files share one bound.`,
        );
      }
    }
  });

  it.each(CONSUMERS)("imports MAP_PICKER_LOCATE_TIMEOUT_MS in %s", (relative) => {
    const absolute = resolve(repo, relative);
    const content = readFileSync(absolute, "utf-8");

    expect(content).toMatch(/MAP_PICKER_LOCATE_TIMEOUT_MS/);
    expect(content).toMatch(/from ["']@\/lib\/map-picker-timeouts["']/);
  });
});
