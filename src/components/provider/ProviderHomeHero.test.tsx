/**
 * SVC-491 · ProviderHomeHero unit tests.
 *
 * The hero is the first thing a provider sees 15× a day. Each case names
 * the regression it catches so a drift in the greeting, the stats, or the
 * streak reads as a failure in the diff that caused it.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const earningsSummary = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useEarningsSummary: () => earningsSummary(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { ProviderHomeHero } from "./ProviderHomeHero";

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  earningsSummary.mockReset();
});

describe("ProviderHomeHero", () => {
  // Catches: "greeting + name + avatar regresses to a bare screen title.
  // Pre-SVC-491 showed 'Provider Home' as the h1 — losing this changes
  // the feel of the app."
  it("renders greeting + provider name as the hero", () => {
    earningsSummary.mockReturnValue({
      data: { lifetime_payout: 0, completed_count: 0 },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrap>
        <ProviderHomeHero name="Rohan Kumar" />
      </Wrap>,
    );

    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rohan Kumar" })).toBeInTheDocument();
  });

  // Catches: "lifetime figure drops to ₹0 when the fetch errors —
  // dishonest, same failure mode EarningsRow was designed to avoid."
  it("hides the lifetime figure under an em-dash on fetch error", () => {
    earningsSummary.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(
      <Wrap>
        <ProviderHomeHero name="Rohan" />
      </Wrap>,
    );

    // Em-dash in both stat cards; no bare ₹0.
    expect(screen.queryByText(/₹0\b/)).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  // Catches: "streak sentence lies to a fresh provider by printing
  // '0 jobs done — nice run.'"
  it("shows 'first job coming' for a provider with zero completed jobs", () => {
    earningsSummary.mockReturnValue({
      data: { lifetime_payout: 0, completed_count: 0 },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrap>
        <ProviderHomeHero name="Rohan" />
      </Wrap>,
    );

    expect(screen.getByText("Your first job is on its way.")).toBeInTheDocument();
    expect(screen.queryByText(/jobs done/)).not.toBeInTheDocument();
  });

  // Catches: "streak sentence drops the count or misformats it. Count
  // plural is a signal of history — critical for a motivated provider."
  it("shows the job count in the streak sentence for a seasoned provider", () => {
    earningsSummary.mockReturnValue({
      data: { lifetime_payout: 152000, completed_count: 42 },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrap>
        <ProviderHomeHero name="Rohan" />
      </Wrap>,
    );

    expect(screen.getByText("42 jobs done — nice run.")).toBeInTheDocument();
    expect(screen.getByText("₹1,52,000")).toBeInTheDocument();
  });

  // Catches: "hero renders no streak sentence at all while the fetch is
  // loading — leaving a blank slot that then pops in — or renders a
  // misleading sentence against stale data."
  it("holds the streak sentence out of DOM while loading", () => {
    earningsSummary.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    render(
      <Wrap>
        <ProviderHomeHero name="Rohan" />
      </Wrap>,
    );

    expect(screen.queryByText(/jobs done/)).not.toBeInTheDocument();
    expect(screen.queryByText("Your first job is on its way.")).not.toBeInTheDocument();
  });
});
