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

describe("signing out", () => {
  it("clears the answer, so the next user is asked", () => {
    // Found on device: a consumer confirmed, logged out, and the provider who
    // signed in next went straight to their home screen — inheriting someone
    // else's "yes, I'm here" and never being asked where they were.
    //
    // The answer belongs to a session, not to the app process. `logout()` in
    // auth-context calls this for that reason.
    markLocationConfirmed();
    expect(hasConfirmedLocation()).toBe(true);

    resetLocationGate();

    expect(hasConfirmedLocation()).toBe(false);
  });
});

describe("the wiring that actually broke", () => {
  it("logout() calls resetLocationGate", async () => {
    // The store test above passes whether or not anything calls it — and
    // nothing did, which is why a provider inherited a consumer's answer on a
    // real device.
    //
    // Asserted against the source because a behavioural test would need the
    // whole AuthProvider stack (storage, FCM, Sentry, React Query) mocked to
    // observe one call. That much scaffolding tends to prove the mocks work.
    // This is narrow and fails for the right reason: someone removing the call
    // has to see this test.
    const mod = await import("@/lib/auth-context?raw");
    const source = mod.default as unknown as string;

    const logoutStart = source.indexOf("const logout");
    const logoutEnd = source.indexOf("}, [])", logoutStart);
    const logoutBody = source.slice(logoutStart, logoutEnd);

    expect(logoutBody).toContain("resetLocationGate()");
  });
});
