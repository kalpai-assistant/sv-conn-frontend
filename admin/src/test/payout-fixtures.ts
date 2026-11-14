/** SPs, bookings and history entries shaped like the SVC-426 payout endpoints. */
import type { PayoutBooking, PayoutHistoryEntry, PayoutProvider } from "@/lib/payouts";

export const SP_ID = "5b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
export const OTHER_SP_ID = "6c2e3d4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f";
export const PAYOUT_BOOKING_ID = "8d3f4e5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";

export function payoutProvider(overrides: Partial<PayoutProvider> = {}): PayoutProvider {
  return {
    provider_id: SP_ID,
    name: "Ramesh Kumar",
    business_name: "Ramesh Cleaning Co",
    phone: "+919876500001",
    is_active: true,
    payout_set: true,
    kyc_status: "verified",
    pending_count: 5,
    pending_paise: 749_950,
    processing_count: 0,
    processing_paise: 0,
    completed_count: 4,
    completed_paise: 512_000,
    failed_count: 0,
    failed_paise: 0,
    reversed_count: 0,
    reversed_paise: 0,
    earned_count: 9,
    earned_paise: 1_261_950,
    payable_paise: 749_950,
    latest_failure_reason: null,
    ...overrides,
  };
}

export function payoutBooking(overrides: Partial<PayoutBooking> = {}): PayoutBooking {
  return {
    booking_id: PAYOUT_BOOKING_ID,
    completed_at: "2026-11-05T09:30:00Z",
    service_amount_paise: 149_900,
    discount_amount_paise: 10_000,
    platform_commission_paise: 22_485,
    provider_payout_paise: 117_415,
    tip_amount_paise: 5_000,
    settlement_status: "pending",
    settlement_payout_id: null,
    settlement_failure_reason: null,
    professional_name: "Vikram Sharma",
    ...overrides,
  };
}

export function historyEntry(overrides: Partial<PayoutHistoryEntry> = {}): PayoutHistoryEntry {
  return {
    audit_id: "a0000000-0000-4000-8000-000000000001",
    payout_id: "pout_123",
    reference_id: "ref-1",
    amount_paise: 512_000,
    booking_count: 4,
    outcome: "processed",
    source: "admin",
    admin_user_id: "a1",
    admin_name: "Asha Admin",
    error: null,
    created_at: "2026-11-01T10:00:00Z",
    ...overrides,
  };
}
