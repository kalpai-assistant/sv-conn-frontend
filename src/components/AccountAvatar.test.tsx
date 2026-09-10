/**
 * The account avatar that replaced the Profile tab, for both roles (SVC-273).
 *
 * It is the **only** way into Profile now — if it stops rendering, or points
 * at the wrong screen, that screen becomes unreachable inside the app. And
 * most users have no photo, so the fallback is the common path rather than the
 * exception: consumers have no photo field at all, and a provider's is null
 * whenever the onboarding upload is skipped.
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

import { AccountAvatar } from "@/components/AccountAvatar";

describe("where it goes", () => {
  it("opens the consumer Profile", () => {
    render(<AccountAvatar to="/profile" name="Tushar Kharat" />);

    expect(screen.getByRole("link", { name: /your profile/i })).toHaveAttribute("href", "/profile");
  });

  it("opens the provider Profile", () => {
    // Two separate screens — a provider sent to /profile would be bounced by
    // the role guard, arriving somewhere they did not ask for.
    render(<AccountAvatar to="/provider/profile" name="Tushar Kharat" />);

    expect(screen.getByRole("link", { name: /your profile/i })).toHaveAttribute(
      "href",
      "/provider/profile",
    );
  });

  it("is named for its destination, not its contents", () => {
    // "Avatar" tells a screen-reader user nothing about where the tap lands.
    render(<AccountAvatar to="/profile" name="Tushar Kharat" />);

    expect(screen.getByLabelText("Your profile")).toBeInTheDocument();
  });
});

describe("what it shows", () => {
  it("falls back to initials when there is no photo", () => {
    // The only path a consumer ever takes: User carries no photo field.
    render(<AccountAvatar to="/profile" name="Tushar Kharat" />);

    expect(screen.getByText("TK")).toBeInTheDocument();
  });

  it("still renders a tappable link with neither photo nor name", () => {
    // A user part-way through setup has no name yet. The glyph matters less
    // than the link surviving — without it they cannot reach Profile at all.
    render(<AccountAvatar to="/profile" />);

    expect(screen.getByRole("link", { name: /your profile/i })).toBeInTheDocument();
  });
});
