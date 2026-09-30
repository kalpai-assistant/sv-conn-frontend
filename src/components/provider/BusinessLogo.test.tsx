/**
 * BusinessLogo (SVC-337) — the one place the "no logo" fallback lives.
 *
 * The backend stores NULL, never a placeholder, so the default must appear
 * whenever there is no URL — and also when a URL fails to load, rather than a
 * broken-image icon.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BusinessLogo } from "@/components/provider/BusinessLogo";

describe("BusinessLogo", () => {
  it("shows the default logo when there is no URL", () => {
    render(<BusinessLogo src={null} alt="Default business logo" />);
    expect(screen.getByRole("img", { name: "Default business logo" }).tagName).toBe("svg");
  });

  it("shows the uploaded logo when there is one", () => {
    render(<BusinessLogo src="https://bucket/logo.png" alt="Sparkle logo" />);
    expect(screen.getByRole("img", { name: "Sparkle logo" })).toHaveAttribute(
      "src",
      "https://bucket/logo.png",
    );
  });

  it("falls back to the default when the logo fails to load", () => {
    render(<BusinessLogo src="https://bucket/missing.png" alt="Sparkle logo" />);

    fireEvent.error(screen.getByRole("img", { name: "Sparkle logo" }));

    expect(screen.getByRole("img", { name: "Sparkle logo" }).tagName).toBe("svg");
  });
});
