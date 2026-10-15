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
import { fireEvent, render, screen } from "@testing-library/react";

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
  it("renders the Pro, initials, business and the summary", () => {
    render(<WhoIsComingCard booking={who()} summary="Deep Clean + 1 more" />);
    expect(screen.getByText("Rohan Kumar")).toBeInTheDocument();
    expect(screen.getByText("RK")).toBeInTheDocument();
    expect(screen.getByText("Sparkle Home")).toBeInTheDocument();
    expect(screen.getByText("Deep Clean + 1 more")).toBeInTheDocument();
  });

  it("renders one name only on a solo job", () => {
    render(
      <WhoIsComingCard
        booking={who({ professional: { ...rohan, isSelf: true } })}
        summary="Deep Clean"
      />,
    );
    expect(screen.getByText("Rohan Kumar")).toBeInTheDocument();
    expect(screen.queryByText("Sparkle Home")).not.toBeInTheDocument();
    expect(screen.queryByTestId("business-logo-placeholder")).not.toBeInTheDocument();
  });

  it("gives a missing logo an intentional placeholder", () => {
    render(<WhoIsComingCard booking={who()} summary="x" />);
    expect(screen.getByTestId("business-logo-placeholder")).toBeInTheDocument();
  });

  it("shows the logo when there is one, and falls back if it fails to load", () => {
    const { container } = render(
      <WhoIsComingCard
        booking={who({ serviceProvider: { ...sparkle, businessImageUrl: "https://x/logo.png" } })}
        summary="x"
      />,
    );
    const img = container.querySelector('img[src="https://x/logo.png"]');
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(screen.getByTestId("business-logo-placeholder")).toBeInTheDocument();
  });

  it("truncates a long business name, and a tap shows it whole", () => {
    const long = "Sparkle Home Cleaning and Deep Sanitisation Services of Greater Bangalore";
    render(
      <WhoIsComingCard
        booking={who({ serviceProvider: { ...sparkle, businessName: long } })}
        summary="x"
      />,
    );
    const name = screen.getByText(long);
    expect(name).toHaveClass("truncate");
    const toggle = screen.getByRole("button", { name: long });
    expect(toggle).toHaveAttribute("title", long);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(name).not.toHaveClass("truncate");
  });

  it("shows the finding state during a re-pick, never a stale name", () => {
    render(<WhoIsComingCard booking={who({ professional: null })} summary="x" />);
    expect(screen.getByText("Finding a professional for you")).toBeInTheDocument();
    expect(screen.queryByText("Rohan Kumar")).not.toBeInTheDocument();
    expect(screen.queryByText("Sparkle Home")).not.toBeInTheDocument();
  });

  it("renders nothing for an older backend", () => {
    const { container } = render(
      <WhoIsComingCard booking={who({ professional: undefined })} summary="x" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the trailing action next to the Pro", () => {
    render(<WhoIsComingCard booking={who()} summary="x" action={<a href="tel:1">Call</a>} />);
    expect(screen.getByText("Call")).toBeInTheDocument();
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
