import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// UI-shape types (from mock-data) used to keep the existing components typed
// against the same shape they were built against. API-shape types are declared
// inline below as `API_*` — the two are joined in each hook's `select`.
import type {
  Category as UI_Category,
  Service as UI_Service,
  Booking as UI_Booking,
  Address as UI_Address,
} from "@/lib/mock-data";

// --- Types from OpenAPI ---
export interface API_CategoryResponse {
  id: string;
  name: string;
  slug: string;
  icon_url: string | null;
  description: string | null;
  sort_order: number;
}

export interface API_ServiceResponse {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price: number;
  duration_minutes: number;
  is_active: boolean;
}

export interface API_BookingResponse {
  id: string;
  consumer_id: string;
  provider_id: string;
  service_id: string;
  status: string;
  service_amount: number;
  payment_method: string | null;
  scheduled_at: string | null;
  created_at: string;
}

// --- Adapters to map Backend -> UI expected shape ---

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
      const data = await apiFetch<any[]>("/users/me/addresses");
      return data.map(
        (a) =>
          ({
            id: a.id,
            label: a.label,
            full: a.full_address,
          }) as UI_Address,
      );
    },
  });
};

export const useAddAddress = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { label: string; full_address: string; lat: number; lng: number }) => {
      return apiFetch<any>("/users/me/addresses", {
        method: "POST",
        body: JSON.stringify({
          label: vars.label,
          full_address: vars.full_address,
          lat: vars.lat,
          lng: vars.lng,
          is_default: false,
        }),
      });
    },
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
      const data = await apiFetch<any>(`/bookings/${query}`);
      const rawBookings = data.bookings || [];

      return rawBookings.map((b: any) => {
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
          status: b.status.toUpperCase(),
          address: { id: "", label: "Address", full: "" }, // Placeholder
          scheduledAt: b.scheduled_at || b.created_at,
          paymentMethod: b.payment_method || "online",
          paymentStatus: b.payment_status || "pending",
          totalAmount: b.service_amount,
          createdAt: b.created_at,
          otp: b.doorstep_otp || undefined,
          // Hydrate the provider from the booking, since global services have none.
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
        } as UI_Booking;
      });
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
        const data = await apiFetch<any>(`/reviews?provider_id=${providerId}`);
        return (data.reviews || []).map((r: any) => ({
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
      const b = await apiFetch<any>(`/bookings/${bookingId}`);
      const srv = services?.find((s) => s.id === b.service_id);

      const uiBooking: UI_Booking = {
        id: b.id,
        status: b.status.toUpperCase(),
        address: { id: b.address_id || "", label: "Address", full: "" },
        scheduledAt: b.scheduled_at || b.created_at,
        paymentMethod: b.payment_method || "online",
        paymentStatus: b.payment_status || "pending",
        totalAmount: b.service_amount,
        createdAt: b.created_at,
        otp: b.doorstep_otp || undefined,
        service: srv || {
          id: b.service_id,
          name: "Service Name",
          categoryId: "",
          categoryName: "",
          description: "",
          price: b.service_amount,
          duration: "",
        },
      };

      if (b.provider_id) {
        uiBooking.service = {
          ...uiBooking.service,
          provider: {
            id: b.provider_id,
            name: "Assigned Partner",
            phone: "+910000000000",
            rating: 5,
            reviewCount: 0,
            verified: true,
          },
        };
      }
      return uiBooking;
    },
    enabled: !!bookingId && services !== undefined,
    refetchInterval: 4000,
  });
};

export const useCancelBooking = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, reason }: { bookingId: string; reason: string }) => {
      return apiFetch<any>(`/bookings/${bookingId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: (_, { bookingId }) => {
      queryClient.invalidateQueries({ queryKey: ["booking", bookingId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
};

export const useSubmitReview = () => {
  return useMutation({
    mutationFn: async ({
      bookingId,
      rating,
      comment,
    }: {
      bookingId: string;
      rating: number;
      comment: string;
    }) => {
      return apiFetch<any>(`/reviews/`, {
        method: "POST",
        body: JSON.stringify({ booking_id: bookingId, rating, comment }),
      });
    },
  });
};

export const useCreatePaymentOrder = () => {
  return useMutation({
    mutationFn: async ({ bookingId }: { bookingId: string }) => {
      return apiFetch<any>(`/payments/orders`, {
        method: "POST",
        body: JSON.stringify({ booking_id: bookingId }),
      });
    },
  });
};

export const useVerifyPayment = () => {
  return useMutation({
    mutationFn: async (data: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => {
      return apiFetch<any>(`/payments/verify`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
  });
};

// --- Admin: KYC review (SVC-87 / SVC-90) ---

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

// --- Admin: provider payouts (SVC-144 / PAY-13) ---

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
