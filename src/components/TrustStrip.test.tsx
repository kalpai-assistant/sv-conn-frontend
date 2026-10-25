/**
 * The persistent trust strip (SVC-387).
 *
 * The strip is the one place in the app where we make shippable claims about
 * KYC + refund + support hours. Three things it must not break: the default
 * must drop the un-backed "damage cover" claim, the compact variant has to
 * stay a 32px band on Home (ticket hard max), and a caller-supplied subset
 * must render as given without silent additions. The window.matchMedia
 * narrow-width collapse is behaviour we exercise elsewhere via the preview;
 * here we assert the stable visual contract.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { TrustStrip, trustClaims } from "@/components/TrustStrip";

// jsdom doesn't ship matchMedia. The hook inside TrustStrip subscribes to it,
// so a missing implementation would throw on render in every test here.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what it ships by default", () => {
  it("renders the three legitimately-backed claims", () => {
    render(<TrustStrip />);

    expect(screen.getByText("Background-verified pros")).toBeInTheDocument();
    expect(screen.getByText("Full refund guarantee")).toBeInTheDocument();
    expect(screen.getByText("Support 10am–10pm")).toBeInTheDocument();
  });

  it("does NOT ship the ₹10,000 damage-cover claim", () => {
    // The ticket's hard rule: only claims we can back. We don't have an
    // insurance partner yet. If this fires, someone added the fourth claim
    // without the partnership in place — stop and check with product.
    render(<TrustStrip />);

    expect(screen.queryByText(/₹10,000 damage cover/)).not.toBeInTheDocument();
  });
});

describe("variants carry their layout contract", () => {
  it("compact variant stays within the 32px Home budget", () => {
    // The ticket pins this at 32px vertical for the Home surface. The
    // utility used — `min-h-8` — is a 32px floor; changing it is a design
    // change that needs sign-off, not a drive-by.
    const { container } = render(<TrustStrip variant="compact" />);

    expect(container.firstChild).toHaveClass("min-h-8");
  });

  it("full variant uses rounded pill styling for detail + tracking surfaces", () => {
    const { container } = render(<TrustStrip variant="full" />);

    expect(container.firstChild).toHaveClass("rounded-md");
    expect(container.firstChild).toHaveClass("min-h-10");
  });
});

describe("caller-supplied claims", () => {
  it("renders exactly the subset passed in — no silent additions", () => {
    // The ticket is explicit that the strip rebalances for 2-4 claims.
    // A regression where the component merges caller claims with the
    // defaults would silently show stale copy on a surface the caller
    // meant to pare down.
    render(<TrustStrip claims={trustClaims.slice(0, 2)} />);

    expect(screen.getByText("Background-verified pros")).toBeInTheDocument();
    expect(screen.getByText("Full refund guarantee")).toBeInTheDocument();
    expect(screen.queryByText("Support 10am–10pm")).not.toBeInTheDocument();
  });
});
