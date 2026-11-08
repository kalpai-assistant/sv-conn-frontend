/** Bookings and timeline entries shaped like GET /admin/bookings and its siblings. */
import type { Booking, StatusTimelineItem, AssignmentTimelineItem } from "@/lib/bookings";

export const BOOKING_ID = "3f2c9a1e-0b6d-4c1e-9a7f-1d2e3f4a5b6c";
export const OTHER_ID = "7a8b9c0d-1e2f-4a5b-8c6d-7e8f9a0b1c2d";

export function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: BOOKING_ID,
    consumer_id: "c1",
    provider_id: "sp1",
    items: [
      {
        id: "i1",
        service_id: "s1",
        service_name: "Deep Clean",
        variant_label: "2 BHK",
        quantity: 1,
        unit_price: 1499,
        total_price: 1499,
      },
      {
        id: "i2",
        service_id: "s2",
        service_name: "Sofa Shampoo",
        variant_label: null,
        quantity: 2,
        unit_price: 250,
        total_price: 500,
      },
    ],
    status: "accepted",
    service_amount: 1999,
    platform_commission: 299.85,
    provider_payout: 1699.15,
    discount_amount: 200,
    tip_amount: 50,
    payment_method: "online",
    payment_status: "paid",
    address: null,
    is_disputed: false,
    consumer_phone: "+919876542501",
    provider_name: "Ramesh Cleaning Co",
    professional: { id: "p1", display_name: "Ramesh", is_self: true },
    service_provider: { user_id: "sp1", business_name: "Ramesh Cleaning Co" },
    scheduled_at: null,
    created_at: "2026-11-05T06:30:00Z",
    ...overrides,
  };
}

export function bookingDetail(overrides: Partial<Booking> = {}): Booking {
  return booking({
    address: {
      id: "addr1",
      label: "Home",
      full_address: "42, 7th Cross, JP Nagar, Bengaluru 560078",
      lat: null,
      lng: null,
    },
    ...overrides,
  });
}

export function statusItem(overrides: Partial<StatusTimelineItem> = {}): StatusTimelineItem {
  return {
    type: "status",
    created_at: "2026-11-05T06:30:00Z",
    from_status: "requested",
    to_status: "accepted",
    actor_user_id: "sp1",
    actor_name: "Ramesh Cleaning Co",
    note: null,
    ...overrides,
  };
}

export function assignmentItem(
  overrides: Partial<AssignmentTimelineItem> = {},
): AssignmentTimelineItem {
  return {
    type: "assignment",
    created_at: "2026-11-05T06:31:00Z",
    kind: "claimed",
    from_professional: null,
    to_professional: { id: "p1", display_name: "Ramesh" },
    actor_user_id: "sp1",
    actor_name: "Ramesh Cleaning Co",
    note: null,
    ...overrides,
  };
}
