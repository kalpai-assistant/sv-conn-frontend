/**
 * `useBooking` polls every 4s, which is right for a live job and wrong for one
 * this viewer can no longer see: a 403/404 can't change on a retry, and polling
 * it forever just repeats the request.
 */
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { BOOKING_POLL_MS, bookingPollInterval, isBookingGone } from "@/hooks/useApi";

describe("booking poll", () => {
  it.each([403, 404])("stops for a %i", (status) => {
    expect(isBookingGone(new ApiError(status, "x"))).toBe(true);
    expect(bookingPollInterval(new ApiError(status, "x"))).toBe(false);
  });

  it.each([
    ["no error", null],
    ["a 500", new ApiError(500, "API error: 500")],
    ["a 401", new ApiError(401, "x")],
    ["a network drop", new TypeError("Failed to fetch")],
  ])("keeps polling after %s", (_label, error) => {
    expect(isBookingGone(error)).toBe(false);
    expect(bookingPollInterval(error)).toBe(BOOKING_POLL_MS);
  });
});
