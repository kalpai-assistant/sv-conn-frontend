/**
 * Per-launch location confirmation state (SVC-281).
 *
 * The only property that matters: this must **not** survive a relaunch. A
 * relaunch is precisely when someone may have travelled, and a persisted
 * "already confirmed" would skip the question forever — reintroducing the exact
 * failure the gate exists to prevent, where a booking is placed against
 * yesterday's city.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  hasConfirmedLocation,
  markLocationConfirmed,
  resetLocationGate,
} from "@/lib/location-gate";

beforeEach(() => {
  resetLocationGate();
  localStorage.clear();
  sessionStorage.clear();
});

describe("within one launch", () => {
  it("starts unanswered", () => {
    expect(hasConfirmedLocation()).toBe(false);
  });

  it("stays answered once confirmed, so the gate does not reappear mid-session", () => {
    markLocationConfirmed();

    expect(hasConfirmedLocation()).toBe(true);
  });
});

describe("across launches", () => {
  it("persists nothing to storage", () => {
    markLocationConfirmed();

    // Module scope resets when the app process does — which is the definition
    // of "this launch" we want. Anything written here would outlive the launch
    // and silently disable the gate.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
