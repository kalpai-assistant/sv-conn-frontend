/**
 * What a skeleton block says to a screen reader (SVC-397). A spinner at
 * least looked busy; a grid of empty divs says nothing at all unless this
 * wrapper says it.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingRegion } from "./LoadingRegion";

describe("LoadingRegion", () => {
  it("is a busy status region that reads 'Loading…'", () => {
    render(
      <LoadingRegion className="grid">
        <div data-testid="bar" />
      </LoadingRegion>,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveClass("grid");
    expect(region).toHaveTextContent("Loading…");
    expect(screen.getByTestId("bar")).toBeInTheDocument();
  });

  it("puts the hidden label last, out of the layout's first slot", () => {
    render(
      <LoadingRegion>
        <div data-testid="bar" />
      </LoadingRegion>,
    );
    const region = screen.getByRole("status");
    expect(region.firstElementChild).toBe(screen.getByTestId("bar"));
    expect(region.lastElementChild).toHaveClass("sr-only");
  });
});
