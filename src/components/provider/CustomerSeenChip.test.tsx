/**
 * SVC-493 — CustomerSeenChip failure modes this test file locks:
 *
 *   1. The chip renders a "customer saw your ETA" line when the
 *      backend has never sent a timestamp. A pleasing-looking lie
 *      is worse than silence — null/undefined must render nothing.
 *
 *   2. A clock-skew (customer timestamp in the future) renders
 *      "-3 min ago" — the max(0, …) guard must coerce to the
 *      "just now" branch.
 *
 *   3. An invalid ISO string (bad backend serialization) renders
 *      "NaN min ago" — the Number.isNaN guard must suppress the
 *      whole chip.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CustomerSeenChip } from "@/components/provider/CustomerSeenChip";

describe("CustomerSeenChip", () => {
  it("renders nothing when seenAt is null (backend field absent)", () => {
    const { container } = render(<CustomerSeenChip seenAt={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when seenAt is undefined", () => {
    const { container } = render(<CustomerSeenChip seenAt={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the 'just now' copy when the customer saw ETA under a minute ago", () => {
    const now = new Date("2026-11-22T12:00:00Z");
    const seenAt = new Date("2026-11-22T11:59:30Z"); // 30s ago
    render(<CustomerSeenChip seenAt={seenAt} now={() => now} />);
    expect(screen.getByText(/customer just saw your eta/i)).toBeInTheDocument();
  });

  it("renders minutes-ago copy at 5 minutes exactly", () => {
    const now = new Date("2026-11-22T12:00:00Z");
    const seenAt = new Date("2026-11-22T11:55:00Z");
    render(<CustomerSeenChip seenAt={seenAt} now={() => now} />);
    expect(screen.getByText(/customer saw your eta 5 min ago/i)).toBeInTheDocument();
  });

  it("coerces a future timestamp to 'just now' instead of a negative-minutes line", () => {
    const now = new Date("2026-11-22T12:00:00Z");
    const seenAt = new Date("2026-11-22T12:03:00Z"); // 3m in the future (skew)
    render(<CustomerSeenChip seenAt={seenAt} now={() => now} />);
    expect(screen.getByText(/customer just saw your eta/i)).toBeInTheDocument();
    expect(screen.queryByText(/-\d+ min ago/i)).toBeNull();
  });

  it("renders nothing for an invalid ISO string so NaN never leaks", () => {
    const { container } = render(<CustomerSeenChip seenAt="not-a-date" />);
    expect(container.firstChild).toBeNull();
  });

  it("accepts a plain ISO string (backend serializes as JSON)", () => {
    const now = new Date("2026-11-22T12:00:00Z");
    render(<CustomerSeenChip seenAt="2026-11-22T11:58:00Z" now={() => now} />);
    expect(screen.getByText(/customer saw your eta 2 min ago/i)).toBeInTheDocument();
  });
});
