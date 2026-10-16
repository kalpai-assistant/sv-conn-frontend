/**
 * Where the root gate sends a consumer who may be a Pro (SVC-322).
 *
 * The rules are in `pro-gate.ts`. The cases below are the ones that would each
 * strand someone if they regressed: a Pro unable to leave the Pro app, a
 * consumer let into it, or anyone sent somewhere on a network error.
 */
import { describe, expect, it } from "vitest";
import {
  consumesLanding,
  nextLandedFor,
  proGateVerdict,
  providerSeesInviteRoute,
  skipsLocationGate,
} from "@/lib/pro-gate";

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
    expect(consumesLanding("/", "pro", true)).toBe(true);
    expect(consumesLanding("/", "not-pro", true)).toBe(true);
    expect(consumesLanding("/pro/jobs", "pro", true)).toBe(true);
  });

  it("not while the answer is still loading", () => {
    expect(consumesLanding("/", "loading", true)).toBe(false);
  });

  it("not on an error, so a Pro who opened the app offline still lands later", () => {
    expect(consumesLanding("/", "error", true)).toBe(false);
    expect(consumesLanding("/pro", "error", true)).toBe(false);
  });

  it("not on a render that never reached the gate (found on device)", () => {
    // Cold start with an expired token: the refresh let /pros/me answer
    // before /users/me, so "/" + "pro" was seen while the gate still showed
    // the restoring splash. Counting it skipped the redirect to /pro.
    expect(consumesLanding("/", "pro", false)).toBe(false);
    expect(consumesLanding("/pro", "pro", false)).toBe(false);
  });

  it("not on a screen the Pro passed through first", () => {
    // A new invitee is sent to /profile for their name; reaching / afterwards
    // must still land them in the Pro app.
    expect(consumesLanding("/profile", "pro", true)).toBe(false);
    expect(consumesLanding("/tracking/abc", "pro", true)).toBe(false);
  });
});

describe("the consumer location gate", () => {
  it("never covers the Pro app", () => {
    expect(skipsLocationGate("/pro", "pro")).toBe(true);
    expect(skipsLocationGate("/pro/jobs/abc", "loading")).toBe(true);
  });

  it("does not cover /invite: the invitee isn't a Pro yet and has no address", () => {
    expect(skipsLocationGate("/invite", "not-pro")).toBe(true);
    expect(skipsLocationGate("/invite", "loading")).toBe(true);
  });

  it("does not cover Profile for a Pro (found on device)", () => {
    // The Pro Home avatar opens /profile. A new invitee has no saved address,
    // so the gate there left them no way to sign out.
    expect(skipsLocationGate("/profile", "pro")).toBe(true);
  });

  it("still covers Profile for a customer, as before", () => {
    expect(skipsLocationGate("/profile", "not-pro")).toBe(false);
    expect(skipsLocationGate("/profile", "error")).toBe(false);
  });

  it("still covers booking screens for a Pro: booking needs an address", () => {
    expect(skipsLocationGate("/", "pro")).toBe(false);
    expect(skipsLocationGate("/cart", "pro")).toBe(false);
  });

  it("does not mistake /provider or /profile-like paths for the Pro app", () => {
    expect(skipsLocationGate("/profiles", "pro")).toBe(false);
  });
});

describe("an SP owner opening /invite (SVC-354)", () => {
  it("is shown the screen, which tells them why it can't add them", () => {
    expect(providerSeesInviteRoute("/invite")).toBe(true);
  });

  it.each(["/", "/bookings", "/profile", "/pro", "/invite/", "/invites", "/invite/abc"])(
    "is still moved into the provider app from %s",
    (pathname) => {
      expect(providerSeesInviteRoute(pathname)).toBe(false);
    },
  );
});

describe("signing out and back in", () => {
  const RAVI = "user-ravi";

  it("forgets the landing on sign-out", () => {
    expect(nextLandedFor(RAVI, { userId: undefined, signedOut: true, consumes: false })).toBe(null);
  });

  it("keeps it while signed in, and while a session is being restored", () => {
    // Restoring: no user yet, but not signed out. Clearing here would send a
    // Pro back to the Pro app every time the app came to the foreground.
    expect(nextLandedFor(RAVI, { userId: undefined, signedOut: false, consumes: false })).toBe(
      RAVI,
    );
    expect(nextLandedFor(RAVI, { userId: RAVI, signedOut: false, consumes: false })).toBe(RAVI);
  });

  it("records it when a render uses it up", () => {
    expect(nextLandedFor(null, { userId: RAVI, signedOut: false, consumes: true })).toBe(RAVI);
  });

  it("lands the same Pro in the Pro app again after signing back in", () => {
    // Found on device: the same Pro signing out and in during one app run was
    // left on "/" under the location gate, with no way out but a restart.
    let landedFor: string | null = null;
    const render = (userId: string | undefined, signedOut: boolean, pathname: string) => {
      const verdict = proGateVerdict({
        pathname,
        proState: "pro",
        landed: !!userId && landedFor === userId,
      });
      landedFor = nextLandedFor(landedFor, {
        userId,
        signedOut,
        consumes: consumesLanding(pathname, "pro", !!userId),
      });
      return verdict;
    };

    expect(render(RAVI, false, "/")).toBe("to-pro");
    expect(render(RAVI, false, "/pro")).toBe("pass");
    // Pro Home links back to "/" to book as a customer: no bounce.
    expect(render(RAVI, false, "/")).toBe("pass");
    render(undefined, true, "/");
    expect(render(RAVI, false, "/")).toBe("to-pro");
  });
});
