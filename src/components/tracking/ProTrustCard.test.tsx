/**
 * The Pro trust card on tracking (SVC-386). The hard rules the ticket pins:
 *
 *   - `rating_count === 0` → "New pro" chip, NEVER "0.0 ⭐";
 *   - `bookings_completed_count > 99` → "99+", keeps the card tight;
 *   - `is_background_verified === false` → no Verified chip, do not bluff;
 *   - optional experience chips drop when the fields are absent, no "0 yrs";
 *   - missing/broken photo → initials fallback, never a broken-image icon;
 *   - the Call button is a real `tel:` anchor only when a phone is supplied.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProTrustCard } from "@/components/tracking/ProTrustCard";

const base = {
  proName: "Rohan Kumar",
  businessName: "Sparkle Home",
  ratingAverage: 4.8,
  ratingCount: 42,
  // Below the 99 ceiling on purpose so the default case asserts the raw
  // number; the 99+ bounding gets its own tests below.
  bookingsCompletedCount: 42,
  isBackgroundVerified: true,
};

describe("rating pill vs new-pro chip", () => {
  it("renders the rating pill when ratingCount > 0", () => {
    // The pill is split across text nodes (star · 4.8 · · · 124 bookings)
    // so getByText-with-string won't match across nodes — use regex.
    render(<ProTrustCard {...base} />);
    expect(screen.getByText("4.8")).toBeInTheDocument();
    expect(screen.getByText("42 bookings")).toBeInTheDocument();
    expect(screen.queryByText("New pro")).not.toBeInTheDocument();
  });

  it("renders 'New pro' when ratingCount === 0 — never '0.0 ⭐'", () => {
    render(<ProTrustCard {...base} ratingAverage={0} ratingCount={0} />);
    expect(screen.getByText("New pro")).toBeInTheDocument();
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
    expect(screen.queryByText(/bookings$/)).not.toBeInTheDocument();
  });
});

describe("99+ bounding on bookings count", () => {
  it("prints the raw number up to 99", () => {
    render(<ProTrustCard {...base} bookingsCompletedCount={99} />);
    expect(screen.getByText("99 bookings")).toBeInTheDocument();
  });

  it("collapses anything above 99 to '99+' so the card stays tight", () => {
    render(<ProTrustCard {...base} bookingsCompletedCount={5312} />);
    expect(screen.getByText("99+ bookings")).toBeInTheDocument();
    expect(screen.queryByText(/5312/)).not.toBeInTheDocument();
  });
});

describe("background-verified claim", () => {
  it("renders the Verified chip when the backend says true", () => {
    render(<ProTrustCard {...base} isBackgroundVerified />);
    expect(screen.getByText("Background verified")).toBeInTheDocument();
  });

  it("drops the chip when false — do not bluff the trust claim", () => {
    render(<ProTrustCard {...base} isBackgroundVerified={false} />);
    expect(screen.queryByText("Background verified")).not.toBeInTheDocument();
  });
});

describe("optional experience chips", () => {
  it("renders the chips when the fields are defined", () => {
    render(<ProTrustCard {...base} yearsOfExperience={3} areaBookingsCount={15} />);
    expect(screen.getByText("3 yrs experience")).toBeInTheDocument();
    expect(screen.getByText("Serviced your area 15 times")).toBeInTheDocument();
  });

  it("drops both chips when the fields are undefined — no '0 yrs'", () => {
    render(<ProTrustCard {...base} />);
    expect(screen.queryByText(/yrs experience/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Serviced your area/)).not.toBeInTheDocument();
  });
});

describe("photo + initials fallback", () => {
  it("renders the initials when no photoUrl is provided", () => {
    render(<ProTrustCard {...base} />);
    expect(screen.getByText("RK")).toBeInTheDocument();
  });

  it("falls back to '?' when the name has no usable letters", () => {
    // A phone-number-as-name would otherwise render as "93", which reads
    // as data not a person. See initialsFrom in @/lib/initials.
    render(<ProTrustCard {...base} proName="93 54 21" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});

describe("call button", () => {
  it("renders a tel: anchor when phoneNumber is supplied", () => {
    render(<ProTrustCard {...base} phoneNumber="+919876500001" />);
    const call = screen.getByRole("link", { name: /^Call Rohan Kumar$/ });
    expect(call.getAttribute("href")).toBe("tel:+919876500001");
  });

  it("renders no button at all when no phone is supplied", () => {
    render(<ProTrustCard {...base} />);
    expect(screen.queryByRole("link", { name: /^Call / })).toBeNull();
  });

  it("never leaks the raw phone number into visible text", () => {
    render(<ProTrustCard {...base} phoneNumber="+919876500001" />);
    expect(screen.queryByText(/9876500001/)).toBeNull();
  });
});

describe("solo SPs", () => {
  it("drops the 'Professional at …' line when businessName is omitted", () => {
    render(<ProTrustCard {...base} businessName={undefined} />);
    expect(screen.queryByText(/Professional at/)).not.toBeInTheDocument();
    expect(screen.getByText("Rohan Kumar")).toBeInTheDocument();
  });
});
