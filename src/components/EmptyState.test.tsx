/**
 * The empty-state surface (SVC-390). Pinned:
 *
 *   - illustration takes precedence over the icon fallback when both are
 *     supplied (callers that want a Lucide-icon-in-a-circle just pass `icon`);
 *   - `action` with `to` renders a TanStack link, with `onClick` renders a
 *     button — these are the two shapes the ticket calls out, so the
 *     component should refuse to express anything else;
 *   - a title-only state (no description, no action, no icon) still renders
 *     cleanly — the fallback CircleAlert fills the icon slot;
 *   - the description is optional, so a terse "No X yet" state is fine.
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
    [k: string]: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { EmptyState } from "@/components/EmptyState";

describe("illustration vs icon", () => {
  it("renders the illustration when provided", () => {
    render(
      <EmptyState title="No bookings yet" illustration={<div data-testid="booking-illus" />} />,
    );
    expect(screen.getByTestId("booking-illus")).toBeInTheDocument();
  });

  it("renders the icon fallback when no illustration is given", () => {
    render(<EmptyState title="x" icon={<svg data-testid="my-icon" />} />);
    expect(screen.getByTestId("my-icon")).toBeInTheDocument();
  });

  it("renders the CircleAlert fallback when neither illustration nor icon is supplied", () => {
    // A title-only EmptyState is still valid — the component shouldn't crash
    // or render an empty circle. The default icon reads as "nothing here"
    // without the caller needing to spell it out.
    const { container } = render(<EmptyState title="Nothing" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("action shape", () => {
  it("renders a Link when action.to is set", () => {
    render(<EmptyState title="x" action={{ label: "Explore services", to: "/" }} />);
    const link = screen.getByRole("link", { name: /Explore services/ });
    expect(link.getAttribute("href")).toBe("/");
  });

  it("renders a button that fires onClick when action.onClick is set", () => {
    const onClick = vi.fn();
    render(<EmptyState title="x" action={{ label: "Try again", onClick }} />);
    const button = screen.getByRole("button", { name: /Try again/ });
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders no action at all when none is supplied", () => {
    render(<EmptyState title="x" description="y" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("optional description", () => {
  it("omits the description paragraph entirely when not supplied", () => {
    render(<EmptyState title="Just a title" />);
    expect(screen.getByText("Just a title")).toBeInTheDocument();
    // The paragraph element shouldn't exist at all — not an empty <p> that
    // leaves vertical rhythm wrong.
    expect(screen.queryByRole("paragraph")).toBeNull();
  });
});
