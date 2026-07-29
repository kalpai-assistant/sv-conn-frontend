import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api";

// UI-shape types (from mock-data) used to keep the existing components typed
// against the same shape they were built against. API-shape types come from
// the OpenAPI spec via `Schema<K>` — the two are joined in each hook's mapper.
import type {
  Category as UI_Category,
  Service as UI_Service,
  Booking as UI_Booking,
  Address as UI_Address,
} from "@/lib/mock-data";

// Alias so call sites stay terse: `Schema<"BookingResponse">` beats
// `components["schemas"]["BookingResponse"]` at every reference.
type Schema<K extends keyof components["schemas"]> = components["schemas"][K];

// ---------------------------------------------------------------------------
// Backwards-compat re-exports
// External files (admin routes, etc) import these `API_*` names. Kept as
// aliases so import sites don't churn every time the spec regenerates.
// ---------------------------------------------------------------------------

export type API_CategoryResponse = Schema<"CategoryResponse">;
export type API_ServiceResponse = Schema<"ServiceResponse">;
export type API_BookingResponse = Schema<"BookingResponse">;

// ---------------------------------------------------------------------------
// Adapters: API shape → UI shape
// ---------------------------------------------------------------------------

const mapCategory = (cat: API_CategoryResponse): UI_Category => ({
  id: cat.id,
  name: cat.name,
  icon: cat.icon_url || "Sparkles", // Fallback icon
  color: "#6C5CE7", // Fallback color
});

const mapService = (srv: API_ServiceResponse, cats: API_CategoryResponse[]): UI_Service => {
  const cat = cats.find((c) => c.id === srv.category_id);
  return {
    id: srv.id,
    name: srv.name,
    categoryId: srv.category_id,
    categoryName: cat?.name || "Service",
    description: srv.description || "",
    price: srv.base_price,
    duration: `${srv.duration_minutes} mins`,
    provider: undefined, // Services are global, no specific provider
  };
};

// The BookingResponse schema is used by both list + detail; extracted so the
// two mappers can share a single conversion pass instead of duplicating it.
const mapBooking = (b: API_BookingResponse, services?: UI_Service[]): UI_Booking => {
  const srv = services?.find((s) => s.id === b.service_id);
  const service = srv || {
    id: b.service_id,
    name: "Service Name",
    categoryId: "",
    categoryName: "",
    description: "",
    price: b.service_amount,
    duration: "",
  };

  return {
    id: b.id,
    status: b.status.toUpperCase() as UI_Booking["status"],
    // BookingResponse in the OpenAPI spec doesn't currently carry address_id;
    // placeholder until the spec + endpoint are updated.
    address: { id: "", label: "Address", full: "" },
    scheduledAt: b.scheduled_at || b.created_at,
    paymentMethod: (b.payment_method || "online") as UI_Booking["paymentMethod"],
    paymentStatus: (b.payment_status || "pending") as UI_Booking["paymentStatus"],
    totalAmount: b.service_amount,
    createdAt: b.created_at,
    otp: b.doorstep_otp || undefined,
    service: b.provider_id
      ? {
          ...service,
          provider: {
            id: b.provider_id,
            name: "Assigned Partner",
            phone: "+910000000000",
            rating: 5,
            reviewCount: 0,
            verified: true,
          },
        }
      : service,
  };
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const useCategories = () => {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const data = await apiFetch<API_CategoryResponse[]>("/categories");
      return data.map(mapCategory);
    },
  });
};

export const useServices = (categoryId?: string) => {
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<API_CategoryResponse[]>("/categories"),
  });

  return useQuery({
    queryKey: ["services", categoryId],
    queryFn: async () => {
      const query = categoryId ? `?category_id=${categoryId}` : "";
      const data = await apiFetch<API_ServiceResponse[]>(`/services${query}`);
      return data.map((s) => mapService(s, categories || []));
    },
    enabled: categories !== undefined, // Wait for categories to map names
  });
};

export const useAddresses = () => {
  return useQuery({
    queryKey: ["addresses"],
    queryFn: async () => {
      const data = await apiFetch<Schema<"AddressResponse">[]>("/users/me/addresses");
      return data.map<UI_Address>((a) => ({
        id: a.id,
        label: a.label,
        full: a.full_address,
      }));
    },
  });
};

export const useAddAddress = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: Omit<Schema<"CreateAddressRequest">, "is_default">) =>
      apiFetch<Schema<"AddressResponse">>("/users/me/addresses", {
        method: "POST",
        body: JSON.stringify({ ...vars, is_default: false }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
  });
};

export const useBookings = (status?: string) => {
  const { data: services } = useServices(); // leverage cached services

  return useQuery({
    queryKey: ["bookings", status],
    queryFn: async () => {
      const query = status ? `?status=${status}` : "";
      const data = await apiFetch<Schema<"BookingListResponse">>(`/bookings/${query}`);
      return (data.bookings ?? []).map((b) => mapBooking(b, services));
    },
    // Bookings must load even when the services catalog is empty/slow, so this query
    // is not gated on `services`; service names fall back to a placeholder above (SVC-75).
  });
};

export const useReviews = (providerId?: string) => {
  return useQuery({
    queryKey: ["reviews", providerId],
    queryFn: async () => {
      if (!providerId) return [];
      try {
        const data = await apiFetch<Schema<"ReviewListResponse">>(
          `/reviews?provider_id=${providerId}`,
        );
        return (data.reviews ?? []).map((r) => ({
          id: r.id,
          rating: r.rating,
          reviewer: "Customer", // Fallback, reviewer name might need fetching
          comment: r.comment || "No comment",
          date: new Date(r.created_at).toLocaleDateString(),
        }));
      } catch {
        return [];
      }
    },
    enabled: !!providerId,
  });
};

export const useBooking = (bookingId?: string) => {
  const { data: services } = useServices(); // leverage cached services

  return useQuery({
    queryKey: ["booking", bookingId],
    queryFn: async () => {
      if (!bookingId) return null;
      const b = await apiFetch<API_BookingResponse>(`/bookings/${bookingId}`);
      return mapBooking(b, services);
    },
    enabled: !!bookingId && services !== undefined,
    refetchInterval: 4000,
  });
};

export const useCancelBooking = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason: string }) =>
      apiFetch<API_BookingResponse>(`/bookings/${bookingId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason } satisfies Schema<"CancelBookingRequest">),
      }),
    onSuccess: (_, { bookingId }) => {
      queryClient.invalidateQueries({ queryKey: ["booking", bookingId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
};

export const useSubmitReview = () => {
  return useMutation({
    mutationFn: (vars: Schema<"CreateReviewRequest">) =>
      apiFetch<Schema<"ReviewResponse">>(`/reviews/`, {
        method: "POST",
        body: JSON.stringify(vars),
      }),
  });
};

export const useCreatePaymentOrder = () => {
  return useMutation({
    mutationFn: ({ bookingId }: { bookingId: string }) =>
      apiFetch<Schema<"PaymentOrderResponse">>(`/payments/orders`, {
        method: "POST",
        body: JSON.stringify({
          booking_id: bookingId,
        } satisfies Schema<"CreatePaymentOrderRequest">),
      }),
  });
};

// Response shape isn't in the OpenAPI spec (the endpoint returns whatever
// Razorpay hands back plus our own status). `unknown` forces the caller to
// narrow before use — safer than `any`, still explicit that we don't type it.
export const useVerifyPayment = () => {
  return useMutation({
    mutationFn: (data: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) =>
      apiFetch<unknown>(`/payments/verify`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
};

// ---------------------------------------------------------------------------
// Admin: KYC review (SVC-87 / SVC-90)
//
// These endpoints aren't in the OpenAPI spec yet — hand-written until the
// backend regenerates. Keep them local; when the spec picks them up, replace
// with `Schema<...>` and delete the interfaces.
// ---------------------------------------------------------------------------

export interface API_PendingKYCUser {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
}

export interface API_KYCDocsResponse {
  user_id: string;
  name: string | null;
  phone: string;
  kyc_status: "pending" | "submitted" | "verified" | "rejected";
  kyc_submitted_at: string | null;
  kyc_reviewed_at: string | null;
  kyc_rejection_reason: string | null;
  // Presigned, 1-hour TTL. Null if no docs were uploaded for that slot.
  aadhaar_url: string | null;
  selfie_url: string | null;
}

export const usePendingKYC = () => {
  return useQuery({
    queryKey: ["admin", "kyc", "pending"],
    queryFn: () => apiFetch<API_PendingKYCUser[]>("/admin/providers/kyc/pending"),
  });
};

export const useKYCReview = (userId: string | null) => {
  return useQuery({
    queryKey: ["admin", "kyc", "review", userId],
    queryFn: () => apiFetch<API_KYCDocsResponse>(`/admin/providers/${userId}/kyc`),
    // Skip until a row is selected — and disable cache so re-opening the same
    // row re-mints fresh presigned URLs (the cached ones may have expired).
    enabled: !!userId,
    staleTime: 0,
    gcTime: 0,
  });
};

export const useVerifyKYC = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<unknown>(`/admin/providers/${userId}/kyc/verify`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "kyc"] });
    },
  });
};

export const useRejectKYC = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      apiFetch<unknown>(`/admin/providers/${userId}/kyc/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "kyc"] });
    },
  });
};

// ---------------------------------------------------------------------------
// Admin: provider payouts (SVC-144 / PAY-13)
//
// Same story as KYC — not in the OpenAPI spec yet. Hand-written interfaces
// stay here until backend regenerates.
// ---------------------------------------------------------------------------

export interface API_PendingSettlementProvider {
  // The provider's *user* id: the list joins User.id == Booking.provider_id, and
  // POST /admin/providers/{user_id}/payout takes the same id — no lookup needed.
  provider_id: string;
  // Null for providers who registered with a phone only — fall back to `phone`.
  name: string | null;
  phone: string;
  pending_booking_count: number;
  // Paise, not rupees. Render via `formatPaise` — ₹24,000 arrives as 2400000.
  pending_payout_paise: number;
  // False → no UPI/bank details on file; triggering a payout would 402.
  payout_set: boolean;
  // False → deactivated provider who is still owed. Surfaced, never filtered out.
  is_active: boolean;
}

export interface API_PendingSettlementsResponse {
  providers: API_PendingSettlementProvider[];
  /** True provider count, which exceeds `providers.length` when `truncated`. */
  total: number;
  /** True when the backend capped the list — the admin is NOT seeing everyone owed. */
  truncated: boolean;
}

export interface API_PayoutTriggerResponse {
  payout_id: string;
  status: string;
  /** Paise, like `pending_payout_paise`. */
  amount: number;
  booking_count: number;
}

// Already sorted by amount owed (largest first) and capped at 200 server-side,
// so there is no sort or pagination here — see `truncated`.
export const usePendingSettlements = () => {
  return useQuery({
    queryKey: ["admin", "settlements", "pending"],
    queryFn: () => apiFetch<API_PendingSettlementsResponse>("/admin/providers/pending-settlements"),
  });
};

// Settles every pending booking for one provider. A 402 (no payout details on
// file, or nothing pending) surfaces as an ApiError for the caller to render.
export const useTriggerPayout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) =>
      apiFetch<API_PayoutTriggerResponse>(`/admin/providers/${providerId}/payout`, {
        method: "POST",
      }),
    onSuccess: (_data, providerId) => {
      // Drop the row synchronously so the admin can't fire a second payout at the
      // same provider while the refetch is still in flight. The invalidate then
      // reconciles `total`/`truncated` with the server.
      qc.setQueryData<API_PendingSettlementsResponse>(["admin", "settlements", "pending"], (old) =>
        old
          ? { ...old, providers: old.providers.filter((p) => p.provider_id !== providerId) }
          : old,
      );
      qc.invalidateQueries({ queryKey: ["admin", "settlements"] });
    },
  });
};
