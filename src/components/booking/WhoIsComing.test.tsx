/**
 * Who is coming, on the consumer side (SVC-325). Pinned:
 *
 * - the mapper keeps "field absent" (older backend) apart from null;
 * - the Pro's name leads; the business shows only when it isn't just them;
 * - solo collapses: is_self, no business name, or the same name;
 * - nobody yet → "finding" while the job is live, nothing once it's over;
 * - long business names truncate, a missing logo gets a placeholder;
 * - the old made-up "Assigned Partner" never renders.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { mapBooking, mapProfessional, mapServiceProvider } from "@/hooks/useApi";
import type { Booking } from "@/lib/mock-data";
import { WhoIsComingCard, WhoIsComingLine, whoIsComing } from "@/components/booking/WhoIsComing";

type Who = Pick<Booking, "status" | "professional" | "serviceProvider">;

const rohan = { id: "p1", displayName: "Rohan Kumar", photoUrl: null, isSelf: false };
const sparkle = { userId: "sp1", businessName: "Sparkle Home", businessImageUrl: null };
const who = (over: Partial<Who> = {}): Who => ({
  status: "ACCEPTED",
  professional: rohan,
  serviceProvider: sparkle,
  ...over,
});

// The smallest BookingResponse the mapper accepts.
const apiBooking = (over: Record<string, unknown> = {}) =>
  ({
    id: "b1",
    status: "accepted",
    provider_id: "sp1",
    service_amount: 500,
    created_at: "2026-10-09T10:00:00Z",
    scheduled_at: null,
    payment_method: "cash",
    payment_status: "pending",
    items: [
      {
        id: "i1",
        service_id: "s1",
        service_name: "Deep Clean",
        quantity: 1,
        unit_price: 500,
        total_price: 500,
      },
    ],
    ...over,
  }) as unknown as Parameters<typeof mapBooking>[0];

describe("mapping", () => {
  it("maps service_provider when present", () => {
    expect(
      mapServiceProvider({
        service_provider: {
          user_id: "sp1",
          business_name: "Sparkle Home",
          business_image_url: "https://x/logo.png",
        },
      }),
    ).toEqual({
      userId: "sp1",
      businessName: "Sparkle Home",
      businessImageUrl: "https://x/logo.png",
    });
  });

  it("keeps null apart from absent", () => {
    expect(mapServiceProvider({ service_provider: null })).toBeNull();
    expect(mapServiceProvider({})).toBeUndefined();
    expect(mapProfessional({ professional: null })).toBeNull();
    expect(mapProfessional({})).toBeUndefined();
  });

  it("carries both onto the booking and never invents a provider name", () => {
    const b = mapBooking(
      apiBooking({
        professional: {
          id: "p1",
          display_name: "Rohan Kumar",
          profile_photo_url: null,
          is_self: false,
        },
        service_provider: { user_id: "sp1", business_name: null, business_image_url: null },
      }),
    );
    expect(b.professional?.displayName).toBe("Rohan Kumar");
    expect(b.serviceProvider).toEqual({
      userId: "sp1",
      businessName: null,
      businessImageUrl: null,
    });
    expect(JSON.stringify(b)).not.toContain("Assigned Partner");
  });

  // SVC-360: the old placeholder number is gone; no phone means null.
  it.each([
    ["absent", {}],
    ["null", { provider_phone: null }],
  ])("never invents a provider phone when provider_phone is %s", (_, over) => {
    const b = mapBooking(apiBooking(over));
    expect(b.service.provider?.phone).toBeNull();
    expect(JSON.stringify(b)).not.toContain("910000000000");
  });

  it("carries provider_phone through as given", () => {
    const b = mapBooking(apiBooking({ provider_phone: "+919876500001" }));
    expect(b.service.provider?.phone).toBe("+919876500001");
  });
});

describe("whoIsComing", () => {
  it("shows the Pro and the business on a team job", () => {
    expect(whoIsComing(who())).toEqual({
      kind: "assigned",
      name: "Rohan Kumar",
      photoUrl: null,
      business: { name: "Sparkle Home", logoUrl: null },
    });
  });

  it.each([
    ["the Pro is the SP themselves", who({ professional: { ...rohan, isSelf: true } })],
    ["the SP has no business name", who({ serviceProvider: { ...sparkle, businessName: null } })],
    ["the business name is blank", who({ serviceProvider: { ...sparkle, businessName: "  " } })],
    [
      "the business name is the Pro's name",
      who({ serviceProvider: { ...sparkle, businessName: " rohan kumar " } }),
    ],
    ["there is no SP on the payload", who({ serviceProvider: null })],
  ])("collapses to one name when %s", (_, b) => {
    const state = whoIsComing(b);
    expect(state).toMatchObject({ kind: "assigned", name: "Rohan Kumar", business: null });
  });

  it("is finding while nobody has accepted", () => {
    expect(whoIsComing(who({ status: "REQUESTED", professional: undefined })).kind).toBe("finding");
  });

  it.each(["ACCEPTED", "EN_ROUTE", "IN_PROGRESS"] as const)(
    "is finding when %s with nobody on it (team re-pick), even with the SP known",
    (status) => {
      expect(whoIsComing(who({ status, professional: null })).kind).toBe("finding");
    },
  );

  it.each(["CANCELLED", "EXPIRED", "COMPLETED"] as const)(
    "shows nothing on a %s job with nobody on it",
    (status) => {
      expect(whoIsComing(who({ status, professional: null })).kind).toBe("hidden");
    },
  );

  it("shows nothing for an older backend that doesn't send the field", () => {
    expect(whoIsComing(who({ professional: undefined, serviceProvider: undefined })).kind).toBe(
      "hidden",
    );
  });

  it("still names who did a past job", () => {
    expect(whoIsComing(who({ status: "COMPLETED" })).kind).toBe("assigned");
  });
});

describe("WhoIsComingCard", () => {
  // SVC-386: the "assigned" branch delegates to ProTrustCard, which owns the
  // visual trust surface (photo, badges, call button). The assertions below
  // only pin what WhoIsComingCard still OWNS: the state resolution, the
  // "finding" placeholder, and that the summary line sits alongside the card.
  // Deeper visual contract (badges, 99+ bounding, "New pro") is pinned in
  // ProTrustCard's own test file — pinning it twice would couple two files
  // to the same decisions.

  it("renders the Pro, business line and the summary on an assigned job", () => {
    render(<WhoIsComingCard booking={who()} summary="Deep Clean + 1 more" />);
    expect(screen.getByText("Rohan Kumar")).toBeInTheDocument();
    expect(screen.getByText("RK")).toBeInTheDocument();
    expect(screen.getByText(/Sparkle Home/)).toBeInTheDocument();
    expect(screen.getByText("Deep Clean + 1 more")).toBeInTheDocument();
  });

  it("drops the business line entirely on a solo job", () => {
    // One name only: "Rohan · Rohan" would be noise, and no business logo
    // should sneak in to re-create the two-identity feel.
    render(
      <WhoIsComingCard
        booking={who({ professional: { ...rohan, isSelf: true } })}
        summary="Deep Clean"
      />,
    );
    expect(screen.getByText("Rohan Kumar")).toBeInTheDocument();
    expect(screen.queryByText(/Sparkle Home/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Professional at/)).not.toBeInTheDocument();
  });

  it("shows the finding state during a re-pick, never a stale name", () => {
    render(<WhoIsComingCard booking={who({ professional: null })} summary="x" />);
    expect(screen.getByText("Finding a professional for you")).toBeInTheDocument();
    expect(screen.queryByText("Rohan Kumar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sparkle Home/)).not.toBeInTheDocument();
  });

  it("renders nothing for an older backend that doesn't send `professional`", () => {
    const { container } = render(
      <WhoIsComingCard booking={who({ professional: undefined })} summary="x" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("WhoIsComingLine", () => {
  it("joins Pro and business on a team job", () => {
    render(<WhoIsComingLine booking={who()} />);
    const line = screen.getByText("Rohan Kumar · Sparkle Home");
    expect(line).toHaveClass("truncate");
  });

  it("shows just the Pro on a solo job", () => {
    render(
      <WhoIsComingLine booking={who({ serviceProvider: { ...sparkle, businessName: null } })} />,
    );
    expect(screen.getByText("Rohan Kumar")).toBeInTheDocument();
  });

  it("says finding while nobody has accepted", () => {
    render(<WhoIsComingLine booking={who({ status: "REQUESTED", professional: null })} />);
    expect(screen.getByText("Finding a professional…")).toBeInTheDocument();
  });

  it("renders nothing on a mapped old-backend booking — no made-up name", () => {
    const { container } = render(<WhoIsComingLine booking={mapBooking(apiBooking())} />);
    expect(container).toBeEmptyDOMElement();
    expect(container.textContent).not.toContain("Assigned Partner");
  });
});

// SVC-367: after an account delete the backend writes placeholders and nulls
// photos. Whatever it sends, the card must read like a sentence.
describe("a deleted Pro or SP", () => {
  it("renders the placeholders as plain names, no logo, no photo", () => {
    render(
      <WhoIsComingCard
        booking={who({
          professional: { ...rohan, displayName: "Deleted professional", photoUrl: null },
          serviceProvider: { ...sparkle, businessName: "Deleted provider", businessImageUrl: null },
        })}
        summary="Deep Clean"
      />,
    );
    expect(screen.getByText("Deleted professional")).toBeInTheDocument();
    // The business name is rendered inside "Professional at {name}", so match
    // the substring rather than the whole text node.
    expect(screen.getByText(/Deleted provider/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/null|undefined/);
  });

  it("never crashes or prints null on a null name", () => {
    const booking = who({
      professional: { ...rohan, displayName: null as unknown as string },
      serviceProvider: { ...sparkle, businessName: null, businessImageUrl: null },
    });
    render(<WhoIsComingCard booking={booking} summary="Deep Clean" />);
    render(<WhoIsComingLine booking={booking} />);
    expect(screen.getAllByText("Your professional").length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(/null|undefined/);
  });
});
