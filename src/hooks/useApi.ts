import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
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

/**
 * Makes a query that is `enabled`-gated on another one report its
 * dependency's failure as its own.
 *
 * react-query v5 leaves a disabled query in `pending` + `idle`: `isLoading`
 * is **false** and `data` is `undefined`. That is indistinguishable, at the
 * call site, from a query that finished and found nothing — so when the
 * dependency fails, every consumer renders its empty state. One failed
 * `/categories` request emptied the catalogue on Home, category pages and
 * service detail, and told a user tracking a live booking that it did not
 * exist.
 *
 * `refetch` retries the dependency first and only re-runs the dependent
 * query if that succeeded. Without this a "Try again" button re-runs a query
 * that is still disabled, and appears to do nothing.
 *
 * `useBookings` avoids the whole problem by simply not gating (SVC-75); this
 * is for the cases where the dependency's data is genuinely needed to map the
 * response.
 */
function mergeDependentQuery<TQuery extends UseQueryResult<unknown>>(
  query: TQuery,
  dependency: UseQueryResult<unknown>,
): TQuery {
  // `Object.create`, not a spread.
  //
  // react-query v5 hands back an object whose properties are getters that
  // record which ones a component actually read, and re-renders only when
  // those change. Spreading it reads every getter, so the component is marked
  // as depending on all of them — including `isFetching` and `dataUpdatedAt`,
  // which churn on their own. That turns `useBooking`'s 4s poll into a
  // re-render of the whole tracking screen every 4s regardless of whether
  // anything visible changed.
  //
  // Shadowing on a prototype chain keeps the getters lazy: the four fields
  // below are resolved here because we genuinely use them, and everything
  // else is still only tracked if the caller reads it. The getters close over
  // the observer rather than `this`, so delegation works.
  //
  // Caveat: inherited properties are not own properties, so `{...useServices()}`
  // would copy only the four below. Nothing does that today; destructuring,
  // which everything does use, is unaffected.
  return Object.create(query, {
    isError: { value: query.isError || dependency.isError, enumerable: true },
    error: { value: query.error ?? dependency.error, enumerable: true },
    isLoading: { value: query.isLoading || dependency.isLoading, enumerable: true },
    refetch: {
      enumerable: true,
      value: async (...args: Parameters<TQuery["refetch"]>) => {
        if (dependency.isError) {
          const retried = await dependency.refetch();
          // Still broken — re-running the dependent query would just
          // re-disable it, so report the dependency's result rather than a
          // misleading success.
          if (retried.isError) return retried;
        }
        return query.refetch(...args);
      },
    },
  }) as TQuery;
}

// ---------------------------------------------------------------------------
// Adapters: API shape → UI shape
// ---------------------------------------------------------------------------

// `icon_url` is null for every category in the live catalogue and the backend
// has no colour column at all, so the previous mapping handed the grid a
// constant "Sparkles" and a constant brand blue — 18 visually identical
// tiles. Icons and colours are now derived client-side from slug and
// sort_order (lib/category-icons.ts), so this only carries what that
// derivation needs.
const mapCategory = (cat: API_CategoryResponse): UI_Category => ({
  id: cat.id,
  name: cat.name,
  slug: cat.slug,
  sortOrder: cat.sort_order,
});

// `cats` is structural on purpose — this only needs id + name to resolve a
// display label, and typing it that way lets the mapped UI categories be
// passed straight in. See `useServices`.
const mapService = (
  srv: API_ServiceResponse,
  cats: readonly { id: string; name: string }[],
): UI_Service => {
  const cat = cats.find((c) => c.id === srv.category_id);

  // Inactive variants stay in the payload — the catalogue keeps them so
  // historical bookings still resolve a label — but they must never be
  // offered. Sorted by the catalogue's own `sort_order` so "1 BHK" precedes
  // "4 BHK" instead of arriving in insertion order.
  const variants = (srv.variants ?? [])
    .filter((v) => v.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((v) => ({
      id: v.id,
      label: v.label,
      subcategory: v.subcategory,
      price: v.base_price,
      payout: v.provider_payout,
      duration: v.duration_minutes ? `${v.duration_minutes} mins` : undefined,
    }));

  return {
    id: srv.id,
    name: srv.name,
    categoryId: srv.category_id,
    categoryName: cat?.name || "Service",
    description: srv.description || "",
    // `base_price` on the service is the "starting at" figure. Where variants
    // exist the cheapest one is the honest headline — that is what "from ₹X"
    // means to someone scanning the catalogue, and it matches what they'll be
    // charged if they don't change the default selection.
    price: variants.length > 0 ? Math.min(...variants.map((v) => v.price)) : srv.base_price,
    // Same "from ₹X" rule as price, in the provider's currency. A service with
    // no priced variants has no payout to promise, so 0 — callers show the name
    // alone rather than "from ₹0".
    payout: variants.length > 0 ? Math.min(...variants.map((v) => v.payout)) : 0,
    duration: `${srv.duration_minutes} mins`,
    variants,
    provider: undefined, // Services are global, no specific provider
  };
};

// The BookingResponse schema is used by both list + detail; extracted so the
// two mappers can share a single conversion pass instead of duplicating it.
//
// The `items` field on the API response is authoritative; the top-level
// `service` we hand back is the FIRST item, kept as a convenience for
// screens (bookings list, tracking header) that only want a one-line
// summary. Everywhere that renders the whole cart reads `items`.
const mapBooking = (
  b: API_BookingResponse & {
    // The generated OpenAPI type may not yet include these fields — cast
    // through a widening type so TypeScript doesn't refuse the read while
    // svc_connect.json regenerates.
    items?: Array<{
      id: string;
      service_id: string;
      service_name: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }>;
    discount_amount?: number;
    tip_amount?: number;
  },
  services?: UI_Service[],
): UI_Booking => {
  const apiItems = b.items ?? [];

  // Map every item, hydrating each with the catalogue service if we
  // already have it cached (better icon, category), otherwise falling
  // back to whatever the item itself carries.
  const mapped_items = apiItems.map((it) => ({
    id: it.id,
    serviceId: it.service_id,
    serviceName: it.service_name,
    quantity: it.quantity,
    unitPrice: it.unit_price,
    totalPrice: it.total_price,
  }));

  // Primary service = first item. Kept so screens that were built against
  // the single-service assumption keep rendering something sane on a
  // multi-service booking (they show the first service; the whole cart
  // is one click away via `items`).
  const firstItem = mapped_items[0];
  const catalogueSrv = firstItem && services?.find((s) => s.id === firstItem.serviceId);
  const primaryService: UI_Service = catalogueSrv || {
    id: firstItem?.serviceId ?? "",
    name: firstItem?.serviceName ?? "Service",
    categoryId: "",
    categoryName: "",
    description: "",
    price: firstItem?.unitPrice ?? b.service_amount,
    // Placeholder for a booking whose service is no longer in the catalogue;
    // nothing provider-facing reads it, and inventing a payout would be worse
    // than admitting we don't have one.
    payout: 0,
    duration: "",
    // No variants on this fallback by design: it reconstructs a service from
    // a booking line when the catalogue isn't cached, and a past booking's
    // variant is already settled. Nothing should offer a picker from here.
    variants: [],
  };

  const serviceAmount = b.service_amount ?? 0;
  const discountAmount = b.discount_amount ?? 0;
  const tipAmount = b.tip_amount ?? 0;

  // Address is nested on the response (SVC-170) and carries lat/lng
  // when the address was geocoded at create time. Fall back to a
  // placeholder when the server returns null (admin listings blank it
  // for bulk-PII reasons; single-booking reads always have it).
  const apiAddress = (
    b as unknown as {
      address?: {
        id: string;
        label: string;
        full_address: string;
        lat: number | null;
        lng: number | null;
      } | null;
    }
  ).address;
  const address = apiAddress
    ? {
        id: apiAddress.id,
        label: apiAddress.label,
        full: apiAddress.full_address,
        lat: apiAddress.lat,
        lng: apiAddress.lng,
      }
    : { id: "", label: "Address", full: "" };

  return {
    id: b.id,
    status: b.status.toUpperCase() as UI_Booking["status"],
    items: mapped_items,
    address,
    scheduledAt: b.scheduled_at || b.created_at,
    paymentMethod: (b.payment_method || "online") as UI_Booking["paymentMethod"],
    paymentStatus: (b.payment_status || "pending") as UI_Booking["paymentStatus"],
    serviceAmount,
    discountAmount,
    tipAmount,
    // What the consumer was (or will be) charged, in the same math the
    // backend uses: original sum minus platform-absorbed coupon plus
    // gratuity. Kept as one field on the UI type so every screen shows
    // the same number.
    totalAmount: Math.max(0, serviceAmount - discountAmount + tipAmount),
    // Snapshot from the booking (not derived): the split ratio isn't a global
    // constant — see BookingItem.provider_payout / platform_commission notes in
    // the spec — so the provider earnings screen has to trust these fields
    // rather than compute a percentage.
    platformCommission: b.platform_commission ?? 0,
    providerPayout: b.provider_payout ?? 0,
    createdAt: b.created_at,
    // Uppercased to match `status` above: the API speaks lowercase enum
    // values, the UI type is uppercase, and the timeline matches history
    // entries against stage names by identity (SVC-248).
    statusHistory: (b.status_history ?? []).map((e) => ({
      status: e.to_status.toUpperCase() as UI_Booking["status"],
      at: e.created_at,
    })),
    otp: b.doorstep_otp || undefined,
    service: b.provider_id
      ? {
          ...primaryService,
          provider: {
            id: b.provider_id,
            name: "Assigned Partner",
            phone: "+910000000000",
            rating: 5,
            reviewCount: 0,
            verified: true,
          },
        }
      : primaryService,
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
  // Reuses `useCategories` rather than fetching `/categories` again.
  //
  // This used to run its own query under the SAME `["categories"]` key while
  // returning the raw API shape, so the two hooks fought over one cache entry:
  // React Query dedupes by key, so whichever fetched first won and the loser's
  // consumers silently read the other's shape.
  //
  // The visible symptom was category tiles losing their colour. `sort_order`
  // survives that swap, `sortOrder` does not, so `categoryColor()` received
  // undefined and every icon fell back to plain foreground. Order-dependent,
  // which is why it looked intermittent rather than broken.
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data;

  const servicesQuery = useQuery({
    queryKey: ["services", categoryId],
    queryFn: async () => {
      const query = categoryId ? `?category_id=${categoryId}` : "";
      const data = await apiFetch<API_ServiceResponse[]>(`/services${query}`);
      return data.map((s) => mapService(s, categories || []));
    },
    enabled: categories !== undefined, // Wait for categories to map names
  });

  return mergeDependentQuery(servicesQuery, categoriesQuery);
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

/**
 * Edit a saved address (SVC-277).
 *
 * Copy-on-write server-side: the old row is hidden and a new one returned, so
 * bookings that already point at the old address keep recording where the job
 * actually happened. The id in the response is therefore a *new* id — callers
 * must not assume it matches the one they sent.
 */
export const useUpdateAddress = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      addressId,
      ...body
    }: { addressId: string } & Partial<Schema<"CreateAddressRequest">>) =>
      apiFetch<Schema<"AddressResponse">>(`/users/me/addresses/${addressId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
  });
};

/**
 * Remove a saved address (SVC-277).
 *
 * A soft delete server-side — the row survives because a booking may point at
 * it — but from here it is simply gone from the list.
 */
export const useDeleteAddress = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (addressId: string) =>
      apiFetch<void>(`/users/me/addresses/${addressId}`, { method: "DELETE" }),
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
  const servicesQuery = useServices(); // leverage cached services
  const services = servicesQuery.data;

  const bookingQuery = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: async () => {
      if (!bookingId) return null;
      const b = await apiFetch<API_BookingResponse>(`/bookings/${bookingId}`);
      return mapBooking(b, services);
    },
    enabled: !!bookingId && services !== undefined,
    refetchInterval: 4000,
  });

  // Gated on services, which is itself gated on categories — so a single
  // failed /categories request would otherwise leave this query disabled and
  // the tracking screen telling someone their in-progress booking doesn't
  // exist.
  return mergeDependentQuery(bookingQuery, servicesQuery);
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

// --- Provider-side booking transitions (SVC-41) ---
//
// The three legs of a job after it has been accepted. All share the same cache
// invalidation, so they go through one factory rather than three near-identical
// hooks: on success both the single booking (the job screen polls it) and the
// list (the jobs tab) have to be refetched, or the screen keeps rendering the
// step the provider just finished.
//
// The backend enforces the state machine, so a stale button press comes back as
// 409 rather than silently moving the booking; callers surface that.
const useBookingTransition = <V extends { bookingId: string }>(
  leg: (vars: V) => { path: string; body?: string },
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: V) => {
      const { path, body } = leg(vars);
      return apiFetch<API_BookingResponse>(`/bookings/${vars.bookingId}/${path}`, {
        method: "PATCH",
        ...(body ? { body } : {}),
      });
    },
    onSuccess: (_, { bookingId }) => {
      queryClient.invalidateQueries({ queryKey: ["booking", bookingId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
};

/** "I'm on my way" — ACCEPTED → EN_ROUTE. */
export const useMarkEnRoute = () =>
  useBookingTransition<{ bookingId: string }>(() => ({ path: "en-route" }));

/**
 * Doorstep OTP gate — EN_ROUTE → IN_PROGRESS.
 *
 * A wrong PIN is a 400 (`InvalidOTP`), which is the only error the OTP screen
 * treats as "try again" rather than "something went wrong".
 */
export const useStartBooking = () =>
  useBookingTransition<{ bookingId: string; otp: string }>(({ otp }) => ({
    path: "start",
    body: JSON.stringify({ otp }),
  }));

/** "Mark as Complete" — IN_PROGRESS → COMPLETED. */
export const useCompleteBooking = () =>
  useBookingTransition<{ bookingId: string }>(() => ({ path: "complete" }));

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
    // `idempotencyKey` MUST be generated by the caller (not inside `mutationFn`)
    // so a react-query retry replays the same key. Regenerating inside would
    // defeat the whole point — the server would treat each retry as a fresh
    // intent and create a second Razorpay order. See SVC-158.
    mutationFn: ({ bookingId, idempotencyKey }: { bookingId: string; idempotencyKey: string }) =>
      apiFetch<Schema<"PaymentOrderResponse">>(`/payments/orders`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
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
  /** KYCStatus value from the backend — "pending" | "submitted" | "verified" |
   *  "rejected". Anything other than "verified" means Pay out will 402 at the
   *  backend (SVC-189 / G16). Renders as a badge; also gates the button. */
  kyc_status: "pending" | "submitted" | "verified" | "rejected";
}

export interface API_PendingSettlementsResponse {
  providers: API_PendingSettlementProvider[];
  /** True provider count, which exceeds `providers.length` when `truncated`. */
  total: number;
  /** True when the backend capped the list — the admin is NOT seeing everyone owed. */
  truncated: boolean;
}

export interface API_PayoutTriggerResponse {
  /** Always "queued" — the payout is now handed off to a background worker
   *  (SVC-188 / G30). The final RazorpayX status arrives via webhook. */
  status: "queued";
  /** Celery task id — surfaced for support/debug, not shown to the admin. */
  task_id: string;
  /** Paise, matches `pending_payout_paise` from the list. Estimate at enqueue
   *  time — the amount the worker actually charges is authoritative and shows
   *  up on the audit trail. */
  amount_paise: number;
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

// --- Provider service subscriptions (SVC-92) ---

// GET /providers/me/services → [{ id, provider_id, service_id }]. We expose just the
// set of subscribed service ids; the UI cross-references the full catalog (useServices).
export const useProviderServices = () => {
  return useQuery({
    queryKey: ["providerServices"],
    queryFn: async () => {
      const data =
        await apiFetch<{ id: string; provider_id: string; service_id: string }[]>(
          "/providers/me/services",
        );
      return data.map((s) => s.service_id);
    },
  });
};

// Toggle a provider's subscription to a catalog service with optimistic update + rollback.
// subscribe=true → POST /providers/me/services { service_id }; false → DELETE …/{id}.
// A 403 (KYC not verified) surfaces as ApiError with status 403 for the caller to handle.
export const useToggleProviderService = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId, subscribe }: { serviceId: string; subscribe: boolean }) => {
      if (subscribe) {
        return apiFetch("/providers/me/services", {
          method: "POST",
          body: JSON.stringify({ service_id: serviceId }),
        });
      }
      return apiFetch(`/providers/me/services/${serviceId}`, { method: "DELETE" });
    },
    onMutate: async ({ serviceId, subscribe }) => {
      await queryClient.cancelQueries({ queryKey: ["providerServices"] });
      const previous = queryClient.getQueryData<string[]>(["providerServices"]);
      queryClient.setQueryData<string[]>(["providerServices"], (old = []) =>
        subscribe ? [...new Set([...old, serviceId])] : old.filter((id) => id !== serviceId),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Roll back to the snapshot taken in onMutate.
      if (context?.previous) {
        queryClient.setQueryData(["providerServices"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["providerServices"] });
    },
  });
};

// --- Provider onboarding (SVC-93) ---

export type KycStatus = "pending" | "submitted" | "verified" | "rejected";

export type PayoutMethodKind = "upi" | "bank";

export interface ProviderProfile {
  id: string;
  user_id: string;
  profile_photo_url: string | null;
  languages: string[];
  kyc_status: KycStatus;
  // Whether the provider is accepting jobs right now (SVC-155). The booking
  // broadcast filters on this, so a provider who never turns it on is matched by
  // nothing. Server state, not a UI preference: it survives restarts, and it is
  // only ever changed by an explicit user action — never by a lifecycle event.
  is_online: boolean;
  avg_rating: number;
  total_completed_jobs: number;
  // Where this provider works, and how far they travel (SVC-279). The dispatch
  // geo-fence needs all three: a provider with a null centre matches no booking
  // at all, however online they are.
  //
  // Optional because the fields only exist against a backend carrying #156.
  // A stale backend omits them, and `null` means "never set" — which is not the
  // same as 0,0, a real point in the Gulf of Guinea.
  service_area_lat?: number | null;
  service_area_lng?: number | null;
  service_area_radius_km?: number;
  // Derived on the backend: whether a payout destination is on file. Never the raw PII.
  payout_set: boolean;
  // Which stored destination payouts actually go to (SVC-148). A provider may keep
  // both a UPI handle and a bank account on file — saving one never erases the
  // other — so this, not "which details exist", is what decides where money lands.
  payout_method: PayoutMethodKind | null;
  // Display-safe label for the active method: the full handle for UPI (a VPA is
  // public by design, and masking it would cost recognisability for no gain), the
  // last 4 digits for a bank account. Null when nothing is on file — and also null
  // for providers whose method predates SVC-148, since the backfill deliberately
  // left it empty rather than guess. Callers must handle set-but-unlabelled.
  payout_display: string | null;
  // Which methods have details on file, active or not (SVC-152) — what makes it
  // possible to know whether "switch back to your bank account" will work, rather
  // than firing the switch and reading the 400. Names the filled slots, never their
  // contents, and always includes the active method.
  //
  // Optional only for the window before the SVC-152 backend (PR #39) is deployed:
  // against an older backend the field is absent, and callers fall back to offering
  // the switch optimistically, which the 400 handling already covers. Drop the `?`
  // once that backend is everywhere.
  payout_methods_stored?: PayoutMethodKind[];
}

// GET /providers/me — the current provider's profile (kyc_status drives the
// onboarding route guard and the Step 3 services-picker lock).
export const useProviderProfile = (enabled = true) => {
  return useQuery({
    queryKey: ["providerProfile"],
    queryFn: () => apiFetch<ProviderProfile>("/providers/me"),
    enabled,
  });
};

// PATCH /users/me { name } — name lives on the user, not the provider profile.
export const useUpdateName = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch("/users/me", { method: "PATCH", body: JSON.stringify({ name }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providerProfile"] }),
  });
};

// PATCH /providers/me { languages } — backend trims + de-duplicates server-side.
export const useUpdateLanguages = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (languages: string[]) =>
      apiFetch<ProviderProfile>("/providers/me", {
        method: "PATCH",
        body: JSON.stringify({ languages }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providerProfile"] }),
  });
};

// PATCH /providers/me/status { is_online } — go online/offline (SVC-155).
// Returns the full profile, same shape as GET /providers/me, so invalidating the
// profile query is enough to settle every reader back onto server truth.
//
// Callers must only fire this from a deliberate user action. Going online means
// "I am accepting jobs", not "the app is open", so it must never be driven by
// mount, focus, foreground or background. Auto-offline-on-background would be
// actively broken here: the app is backgrounded exactly when a push arrives.
export const useSetOnlineStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (is_online: boolean) =>
      apiFetch<ProviderProfile>("/providers/me/status", {
        method: "PATCH",
        body: JSON.stringify({ is_online }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providerProfile"] }),
  });
};

// POST /providers/me/photo (multipart) — upload/replace the provider photo.
export const useUploadPhoto = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photo: Blob) => {
      const form = new FormData();
      form.append("photo", photo, "photo.jpg");
      return apiFetch<ProviderProfile>("/providers/me/photo", { method: "POST", body: form });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providerProfile"] }),
  });
};

// POST /providers/me/kyc (multipart) — upload Aadhaar front + back + live selfie;
// sets kyc_status=submitted. All three are captured live on the client (no upload).
export const useSubmitKyc = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      aadhaarFront,
      aadhaarBack,
      selfie,
    }: {
      aadhaarFront: Blob;
      aadhaarBack: Blob;
      selfie: Blob;
    }) => {
      const form = new FormData();
      form.append("aadhaar_front", aadhaarFront, "aadhaar-front.jpg");
      form.append("aadhaar_back", aadhaarBack, "aadhaar-back.jpg");
      form.append("selfie", selfie, "selfie.jpg");
      return apiFetch<{ kyc_status: KycStatus; kyc_submitted_at: string | null }>(
        "/providers/me/kyc",
        { method: "POST", body: form },
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providerProfile"] }),
  });
};

// PATCH /providers/me — save the provider's payout destination (SVC-133).
// Send UPI *or* bank details; the backend encrypts at rest and returns the
// derived payout_set flag (never the raw PII).
//
// The union is what stops "both at once" being expressible: the backend 422s on a
// request carrying UPI and bank together, because saving a method also activates
// it and two activations have no defined winner.
export type PayoutInput =
  { payout_vpa: string } | { payout_account_number: string; payout_ifsc: string };

// Every payout endpoint returns the full provider profile, so each mutation seeds
// the cache from its own response rather than invalidating and refetching. Saves a
// round-trip, and — more importantly — avoids the window where the screen renders
// stale payout state between a successful write and the refetch landing.
const seedProfile =
  (queryClient: ReturnType<typeof useQueryClient>) => (profile: ProviderProfile) =>
    queryClient.setQueryData(["providerProfile"], profile);

export const useUpdatePayout = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payout: PayoutInput) =>
      apiFetch<ProviderProfile>("/providers/me", {
        method: "PATCH",
        body: JSON.stringify(payout),
      }),
    onSuccess: seedProfile(queryClient),
  });
};

// SVC-257: PATCH /providers/me { service_area_lat, service_area_lng,
// service_area_radius_km } — save the provider's service-area centre + radius.
// Without a centre set, the PostGIS dispatch treats the provider as invisible
// and they receive zero offers, so the go-online toggle refuses with a
// SERVICE_AREA_MISSING code and the onboarding wizard requires this step
// before payout.
export type ServiceAreaInput = {
  service_area_lat: number;
  service_area_lng: number;
  service_area_radius_km: number;
};

export const useUpdateServiceArea = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (area: ServiceAreaInput) =>
      apiFetch<ProviderProfile>("/providers/me", {
        method: "PATCH",
        body: JSON.stringify(area),
      }),
    onSuccess: seedProfile(queryClient),
  });
};

// PATCH /providers/me/payout-method — switch payouts to a method already on file,
// without re-entering it (SVC-148). Saving a method never erases the other one, so
// a provider who has both stored can flip between them.
//
// Throws ApiError with status 400 when nothing is stored for the requested method.
// That 400 is currently the *only* way to discover what is stored: GET /providers/me
// returns the active method and its label, but nothing about the inactive one.
export const useSetPayoutMethod = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (method: PayoutMethodKind) =>
      apiFetch<ProviderProfile>("/providers/me/payout-method", {
        method: "PATCH",
        body: JSON.stringify({ method }),
      }),
    onSuccess: seedProfile(queryClient),
  });
};

// DELETE /providers/me/payout-method — erase every stored payout destination.
// Clears *both* methods, not just the active one, so this is not an undo for a
// switch: afterwards payout_set is false and the provider cannot be paid until
// they add a method again. Callers must confirm before firing it.
export const useRemovePayoutMethod = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<ProviderProfile>("/providers/me/payout-method", { method: "DELETE" }),
    onSuccess: seedProfile(queryClient),
  });
};
