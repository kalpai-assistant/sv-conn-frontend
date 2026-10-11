/**
 * The Pro header's team line. It read "On {name}’s team", which a business
 * name ending in "s" turned into "On Sparkle Cleaners’s team".
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// A router Link; irrelevant to the team line.
vi.mock("@/components/AccountAvatar", () => ({
  AccountAvatar: () => null,
}));

import { ProHeader } from "@/components/pro/ProHeader";

const team = (business_name: string | null) => ({
  user_id: "sp1",
  business_name,
  business_image_url: null,
});

describe("ProHeader team line", () => {
  it("names a business ending in 's' without a possessive", () => {
    render(<ProHeader title="Jobs" team={team("Sparkle Cleaners")} />);

    expect(screen.getByText("Working with Sparkle Cleaners")).toBeInTheDocument();
    expect(screen.queryByText(/’s team|'s team/)).not.toBeInTheDocument();
  });

  it("falls back when the business has no name", () => {
    render(<ProHeader title="Jobs" team={team("  ")} />);

    expect(screen.getByText("Working with your service provider")).toBeInTheDocument();
  });
});
