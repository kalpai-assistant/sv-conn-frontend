/**
 * SVC-493 — RateCustomerScaffold failure modes this test file locks:
 *
 *   1. Submit is enabled without a backend endpoint — a provider
 *      taps it, nothing happens, they think they submitted. Submit
 *      must stay disabled AND the "Coming soon" note must be visible
 *      next to it.
 *
 *   2. Star state leaks across bookings — the previous customer's
 *      rating shows on the next completed job. Handled via
 *      `key={bookingId}` at the host; this test verifies a fresh
 *      mount starts from zero stars.
 *
 *   3. Note textarea has no maxLength — a provider writes 10,000
 *      chars and the (future) backend rejects. Locked via the
 *      maxLength attribute.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RateCustomerScaffold } from "@/components/provider/RateCustomerScaffold";

describe("RateCustomerScaffold", () => {
  it("renders Submit disabled with a 'Coming soon' note so taps don't vanish silently", () => {
    render(<RateCustomerScaffold bookingId="b1" />);
    const submit = screen.getByRole("button", { name: /submit rating/i });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("starts with no stars selected on mount (a fresh booking never inherits)", () => {
    render(<RateCustomerScaffold bookingId="b1" />);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole("radio", { name: new RegExp(`${n} out of 5`, "i") })).toHaveAttribute(
        "aria-checked",
        "false",
      );
    }
  });

  it("marks the selected star via aria-checked so a screen reader knows what's rated", async () => {
    const user = userEvent.setup();
    render(<RateCustomerScaffold bookingId="b1" />);
    const fourStar = screen.getByRole("radio", { name: /4 out of 5/i });
    await user.click(fourStar);
    expect(fourStar).toHaveAttribute("aria-checked", "true");
  });

  it("caps the note at 500 chars so a mega-rant doesn't blow the (future) backend field", () => {
    render(<RateCustomerScaffold bookingId="b1" />);
    const textarea = screen.getByPlaceholderText(/add a note/i);
    expect(textarea).toHaveAttribute("maxLength", "500");
  });

  it("stays Submit-disabled even after 5 stars are selected (endpoint still absent)", async () => {
    const user = userEvent.setup();
    render(<RateCustomerScaffold bookingId="b1" />);
    await user.click(screen.getByRole("radio", { name: /5 out of 5/i }));
    expect(screen.getByRole("button", { name: /submit rating/i })).toBeDisabled();
  });
});
