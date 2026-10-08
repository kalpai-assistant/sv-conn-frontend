/**
 * Where the root gate sends a consumer who may be a Pro (SVC-322).
 *
 * The rules are in `pro-gate.ts`. The cases below are the ones that would each
 * strand someone if they regressed: a Pro unable to leave the Pro app, a
 * consumer let into it, or anyone sent somewhere on a network error.
 */
import { describe, expect, it } from "vitest";
import { consumesLanding, proGateVerdict } from "@/lib/pro-gate";

describe("the Pro app's routes", () => {
  it("let a Pro in", () => {
    expect(proGateVerdict({ pathname: "/pro", proState: "pro", landed: true })).toBe("pass");
    expect(proGateVerdict({ pathname: "/pro/jobs/abc", proState: "pro", landed: false })).toBe(
      "pass",
    );
  });

  it("send someone who is not a Pro home", () => {
    expect(proGateVerdict({ pathname: "/pro/jobs", proState: "not-pro", landed: true })).toBe(
      "to-home",
    );
  });

  it("hold a spinner while the answer is coming, rather than flash a Pro screen", () => {
    expect(proGateVerdict({ pathname: "/pro", proState: "loading", landed: false })).toBe("wait");
  });

  it("do not throw anyone out on a network error", () => {
    // It says nothing about whether they are a Pro. The screens show their
    // own errors.
    expect(proGateVerdict({ pathname: "/pro", proState: "error", landed: false })).toBe("pass");
  });
});

describe("opening the app on /", () => {
  it("lands a Pro in the Pro app", () => {
    expect(proGateVerdict({ pathname: "/", proState: "pro", landed: false })).toBe("to-pro");
  });

  it("only once: a Pro who steps out to book a service stays out", () => {
    // The Pro shell's "Book a service" link goes to "/". Redirecting again
    // would make that link a loop back into the Pro app.
    expect(proGateVerdict({ pathname: "/", proState: "pro", landed: true })).toBe("pass");
  });

  it("leaves a consumer on the consumer home", () => {
    expect(proGateVerdict({ pathname: "/", proState: "not-pro", landed: false })).toBe("pass");
  });

  it("waits for the answer rather than flashing the consumer home at a Pro", () => {
    expect(proGateVerdict({ pathname: "/", proState: "loading", landed: false })).toBe("wait");
  });

  it("stays on the consumer home when the answer is an error", () => {
    expect(proGateVerdict({ pathname: "/", proState: "error", landed: false })).toBe("pass");
  });
});

describe("the rest of the consumer app", () => {
  it("is never redirected, Pro or not", () => {
    for (const pathname of ["/bookings", "/profile", "/tracking/abc", "/cart"]) {
      expect(proGateVerdict({ pathname, proState: "pro", landed: false })).toBe("pass");
      expect(proGateVerdict({ pathname, proState: "loading", landed: false })).toBe("pass");
    }
  });
});

describe("when the launch landing is used up", () => {
  it("once the answer is known on / or in the Pro app", () => {
    expect(consumesLanding("/", "pro")).toBe(true);
    expect(consumesLanding("/", "not-pro")).toBe(true);
    expect(consumesLanding("/pro/jobs", "pro")).toBe(true);
  });

  it("not while the answer is still loading", () => {
    expect(consumesLanding("/", "loading")).toBe(false);
  });

  it("not on an error, so a Pro who opened the app offline still lands later", () => {
    expect(consumesLanding("/", "error")).toBe(false);
    expect(consumesLanding("/pro", "error")).toBe(false);
  });

  it("not on a screen the Pro passed through first", () => {
    // A new invitee is sent to /profile for their name; reaching / afterwards
    // must still land them in the Pro app.
    expect(consumesLanding("/profile", "pro")).toBe(false);
    expect(consumesLanding("/tracking/abc", "pro")).toBe(false);
  });
});
