/**
 * Coupon endpoints — list what a user can apply, and validate a specific
 * code against a cart amount.
 *
 * Kept as a separate hook file (not lumped into useApi.ts) so the cart
 * flow imports what it needs without dragging booking/review/admin
 * hooks along. Same reasoning as `useSelectedAddress.ts`: cart-scoped
 * concerns get cart-scoped modules.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface Coupon {
  id: string;
  code: string;
  discount_type: "percent" | "flat";
  discount_value: number;
  max_discount: number | null;
  min_order_amount: number | null;
  expires_at: string;
}

export interface CouponValidateResult {
  code: string;
  discount_type: "percent" | "flat";
  discount_amount: number;
}

export function useAvailableCoupons() {
  return useQuery({
    queryKey: ["coupons", "available"],
    queryFn: () => apiFetch<Coupon[]>("/coupons/available"),
    // Coupons don't churn per-second — the user's list is stable across
    // navigations within a session. A refetch on window focus is enough
    // to pick up a fresh referral bonus.
    staleTime: 60_000,
  });
}

export function useValidateCoupon() {
  return useMutation({
    mutationFn: (vars: { code: string; cart_amount: number }) =>
      apiFetch<CouponValidateResult>("/coupons/validate", {
        method: "POST",
        body: JSON.stringify(vars),
      }),
  });
}
