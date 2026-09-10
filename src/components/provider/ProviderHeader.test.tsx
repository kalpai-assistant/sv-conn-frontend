/**
 * The header avatar that replaced the Profile tab (SVC-273).
 *
 * Two things are load-bearing here. It is the **only** way into Provider
 * Profile now — if it stops rendering, or stops pointing at Profile, that
 * screen becomes unreachable in the app. And most providers have no photo, so
 * the fallback is the common path rather than the exception.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    [key: string]: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { ProviderHeader } from "@/components/provider/ProviderHeader";
import { initialsFrom } from "@/lib/initials";

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsFrom("Ravi Kumar")).toBe("RK");
  });

  it("handles a single name", () => {
    expect(initialsFrom("Ravi")).toBe("R");
  });

  it("ignores everything past the second word", () => {
    expect(initialsFrom("Ravi Shankar Kumar Sharma")).toBe("RS");
  });

  it("survives the messy whitespace real names arrive with", () => {
    expect(initialsFrom("  ravi   kumar  ")).toBe("RK");
  });

  it("gives up on a name with no letters", () => {
    // A phone number saved as a name would otherwise render as "91" in a
    // circle, which reads as data rather than a person.
    expect(initialsFrom("9322398902")).toBeNull();
    expect(initialsFrom("")).toBeNull();
    expect(initialsFrom(null)).toBeNull();
    expect(initialsFrom(undefined)).toBeNull();
  });
});

describe("the avatar", () => {
  it("points at Provider Profile", () => {
    // The only entry point since Profile left the tab bar. If this target is
    // ever wrong, the screen is unreachable rather than merely awkward.
    render(<ProviderHeader title="Provider Home" name="Ravi Kumar" />);

    expect(screen.getByRole("link", { name: /your profile/i })).toHaveAttribute(
      "href",
      "/provider/profile",
    );
  });

  it("is named for where it goes, not what it shows", () => {
    // "Avatar" tells a screen-reader user nothing about the destination.
    render(<ProviderHeader title="Provider Home" name="Ravi Kumar" />);

    expect(screen.getByLabelText("Your profile")).toBeInTheDocument();
  });

  it("shows initials when there is no photo", () => {
    // The common case: profile_photo_url is null for most providers, since
    // the upload is skippable during onboarding.
    render(<ProviderHeader title="Provider Home" name="Ravi Kumar" />);

    expect(screen.getByText("RK")).toBeInTheDocument();
  });

  it("still renders a tappable link when there is no name either", () => {
    // A provider mid-onboarding has neither photo nor name. The icon fallback
    // matters less than the link surviving — without it they cannot reach
    // Profile to finish setting up.
    render(<ProviderHeader title="Provider Home" />);

    expect(screen.getByRole("link", { name: /your profile/i })).toBeInTheDocument();
  });

  it("renders the title beside it", () => {
    render(<ProviderHeader title="Provider Home" name="Ravi Kumar" />);

    expect(screen.getByRole("heading", { name: "Provider Home" })).toBeInTheDocument();
  });
});
