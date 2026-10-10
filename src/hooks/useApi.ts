import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
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
  // SVC-286: null on top-level tiles (Home renders these), UUID on
  // sub-categories (rendered inside a category page).
  parentId: cat.parent_id,
});

// `cats` is structural on purpose — this only needs id + name to resolve a
// display label, and typing it that way lets the mapped UI categories be
// passed straight in. See `useServices`.
//
// Widened API shape: `banner_image_url` and `banner_video_url` (SVC-293) may
// not be in the generated OpenAPI types yet — the spec regenerates per-deploy
// on the backend side and the frontend snapshot lags by one PR.
type API_ServiceWithBanner = API_ServiceResponse & {
  banner_image_url?: string | null;
  banner_video_url?: string | null;
};

const mapService = (
  srv: API_ServiceWithBanner,
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
    // SVC-293: pass through even for the list route so a rail can decide
    // "video vs image vs fallback" from the already-cached catalogue.
    bannerImageUrl: srv.banner_image_url ?? null,
    bannerVideoUrl: srv.banner_video_url ?? null,
  };
};

// The BookingResponse schema is used by both list + detail; extracted so the
// two mappers can share a single conversion pass instead of duplicating it.
//
// The `items` field on the API response is authoritative; the top-level
// `service` we hand back is the FIRST item, kept as a convenience for
// screens (bookings list, tracking header) that only want a one-line
// summary. Everywhere that renders the whole cart reads `items`.
/**
 * `professional` (SVC-324, backend #197) isn't in the generated types yet.
 * Keeps "the field is absent" (an older backend: `undefined`) apart from "the
 * field says nobody" (`null`), since only the second means "pick someone".
 */
export const mapProfessional = (b: object): UI_Booking["professional"] => {
  if (!("professional" in b)) return undefined;
  const pro = (
    b as {
      professional: {
        id: string;
        display_name: string;
        profile_photo_url: string | null;
        is_self: boolean;
      } | null;
    }
  ).professional;
  if (!pro) return null;
  return {
    id: pro.id,
    displayName: pro.display_name,
    photoUrl: pro.profile_photo_url,
    isSelf: pro.is_self,
  };
};

/**
 * `service_provider` (SVC-324), the same way: absent → `undefined`, null →
 * `null`. Read from the booking's SP, so it can be set while `professional`
 * is null (a team SP re-picking after a decline).
 */
export const mapServiceProvider = (b: object): UI_Booking["serviceProvider"] => {
  if (!("service_provider" in b)) return undefined;
  const sp = (
    b as {
      service_provider: {
        user_id: string;
        business_name: string | null;
        business_image_url: string | null;
      } | null;
    }
  ).service_provider;
  if (!sp) return null;
  return {
    userId: sp.user_id,
    businessName: sp.business_name,
    businessImageUrl: sp.business_image_url,
  };
};

export const mapBooking = (
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
    professional: mapProfessional(b),
    serviceProvider: mapServiceProvider(b),
    // Who is coming is `professional` + `serviceProvider` (SVC-325); nothing
    // reads `provider.name` any more, so it carries no invented name. The
    // object survives only for the tracking call button, which still dials
    // this placeholder number by Tushar's call (SVC-325): BookingResponse has
    // no phone by design, and a real contact path is a follow-up.
    service: b.provider_id
      ? {
          ...primaryService,
          provider: {
            id: b.provider_id,
            name: "",
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

// ---------------------------------------------------------------------------
// SVC-291 / SVC-292: related-services surfaces on the service sheet
// ---------------------------------------------------------------------------

/** One entry as the sheet's related rails render it — a lightweight subset of
 *  the full `Service` shape carrying only what a rail card needs. */
export interface UI_RelatedServiceEntry {
  id: string;
  name: string;
  price: number;
  sortOrder: number;
}

/** The three related surfaces `GET /services/{id}` returns. Section names
 *  match the API's `relationship_type` enum values so the mapping is 1:1
 *  and neither side has to re-shape. */
export interface UI_RelatedServicesBucket {
  hook: UI_RelatedServiceEntry[];
  upsell: UI_RelatedServiceEntry[];
  related: UI_RelatedServiceEntry[];
}

// API shape isn't in the generated OpenAPI types yet (spec regenerates
// per-deploy on the backend side; frontend snapshot lags by one PR). Widening
// type kept local so this file compiles without a hand-edit to src/types/api.ts.
interface API_RelatedEntry {
  id: string;
  name: string;
  base_price: number;
  sort_order: number;
}
interface API_ServiceDetail extends API_ServiceResponse {
  related?: {
    hook?: API_RelatedEntry[];
    upsell?: API_RelatedEntry[];
    related?: API_RelatedEntry[];
  };
  // SVC-340: detail-only, absent from GET /services. `null` when the service
  // has none, and missing entirely on a backend from before SVC-340.
  steps?: string[] | null;
  exclusions?: string[] | null;
}

/** What the service sheet needs beyond the cached list entry (SVC-292,
 *  SVC-341). `steps` / `exclusions` are always arrays — empty means "render
 *  no section", whichever of null / [] / missing the backend sent. */
export interface UI_ServiceDetail {
  related: UI_RelatedServicesBucket;
  steps: string[];
  exclusions: string[];
}

const mapRelatedEntry = (e: API_RelatedEntry): UI_RelatedServiceEntry => ({
  id: e.id,
  name: e.name,
  price: e.base_price,
  sortOrder: e.sort_order,
});

const toTextList = (v: string[] | null | undefined): string[] =>
  Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim() !== "") : [];

/** Fetch the sheet-only detail for a service: the related-services bucket
 * (SVC-292) plus steps + exclusions (SVC-341). One request per sheet open.
 *
 * Kept separate from `useServices` on purpose: the list route is the app's
 * biggest single request (home page + every category page), and folding the
 * per-service detail payload into it would multiply its cost for a payload
 * nothing on those pages renders. Sheet-detail pays for sheet-detail.
 *
 * Base service data still comes from the cached `useServices` list — the
 * sheet paints its header and CTA from cache instantly, and this query fills
 * in the sections below the trust card when the response lands.
 */
export const useServiceDetail = (serviceId: string | undefined) => {
  return useQuery({
    enabled: !!serviceId,
    queryKey: ["service", serviceId, "detail"],
    queryFn: async (): Promise<UI_ServiceDetail> => {
      const data = await apiFetch<API_ServiceDetail>(`/services/${serviceId}`);
      const bucket = data.related ?? {};
      return {
        related: {
          hook: (bucket.hook ?? []).map(mapRelatedEntry),
          upsell: (bucket.upsell ?? []).map(mapRelatedEntry),
          related: (bucket.related ?? []).map(mapRelatedEntry),
        },
        steps: toTextList(data.steps),
        exclusions: toTextList(data.exclusions),
      };
    },
  });
};

// `enabled` so the root gate can ask "does this user have any address?"
// without a provider or a logged-out visitor firing the call. Defaults true —
// every existing caller already knows it wants addresses.
export const useAddresses = (enabled = true) => {
  return useQuery({
    enabled,
    queryKey: ["addresses"],
    queryFn: async () => {
      const data = await apiFetch<Schema<"AddressResponse">[]>("/users/me/addresses");
      return data.map<UI_Address>((a) => ({
        id: a.id,
        label: a.label,
        full: a.full_address,
        // SVC-281: the pin, so a map can open on an address the user already
        // saved. `?? null` because a stale backend omits these entirely, and an
        // address can genuinely have been created without one — both mean "no
        // pin", which callers must not read as 0,0.
        lat: a.lat ?? null,
        lng: a.lng ?? null,
        // SVC-287. Carried through so Edit can prefill from the columns rather
        // than parse the composed string — which is how a street ends up
        // stored as somebody's flat number.
        house_floor: a.house_floor ?? null,
        building: a.building ?? null,
        landmark_area: a.landmark_area ?? null,
        pincode: a.pincode ?? null,
        contact_name: a.contact_name ?? null,
        contact_phone: a.contact_phone ?? null,
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

/**
 * The most rows `GET /bookings/` will return in one response.
 *
 * The server caps `per_page` at 50 and defaults to 20 — and this hook used to
 * send neither, so every caller silently took the first 20 of everything and
 * filtered that page client-side. Invisible while accounts hold a handful of
 * bookings, wrong as soon as one does not: a provider with 25 jobs in flight
 * would have their finished work sitting on page 2, which nothing requests
 * (SVC-296).
 *
 * Asking for the maximum does not make this paginated — it raises the ceiling
 * and, with `useBookingsTotal` below, makes the truncation *visible* instead of
 * silent. Real paging belongs to whichever screen first has an account big
 * enough to need it, and should be built against that screen rather than
 * guessed at here.
 */
const BOOKINGS_PER_PAGE = 50;

/**
 * How many bookings the server holds for this caller, against how many we
 * fetched (SVC-296).
 *
 * Kept outside the query's `data` on purpose: `data` is an array and four
 * screens already treat it as one, so widening it to `{bookings, total}` would
 * rewrite three unrelated files to serve this one. The count rides alongside
 * in module state, written by the queryFn and read by whoever asks.
 */
const bookingsTotals = new Map<string, number>();

export const useBookings = (status?: string) => {
  const { data: services } = useServices(); // leverage cached services

  return useQuery({
    queryKey: ["bookings", status],
    queryFn: async () => {
      const params = new URLSearchParams({ per_page: String(BOOKINGS_PER_PAGE) });
      if (status) params.set("status", status);
      const data = await apiFetch<Schema<"BookingListResponse">>(`/bookings/?${params}`);
      bookingsTotals.set(status ?? "", data.total ?? 0);
      return (data.bookings ?? []).map((b) => mapBooking(b, services));
    },
    // Bookings must load even when the services catalog is empty/slow, so this query
    // is not gated on `services`; service names fall back to a placeholder above (SVC-75).
  });
};

/**
 * The server's total for the last `useBookings(status)` response, and whether
 * it exceeded what we asked for.
 *
 * A screen showing 50 of 80 rows should say so rather than present a truncated
 * list as if it were complete.
 */
export const useBookingsTotal = (status?: string) => {
  const total = bookingsTotals.get(status ?? "") ?? 0;
  return { total, truncated: total > BOOKINGS_PER_PAGE };
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

/**
 * 403/404 on `GET /bookings/{id}`: this viewer can't see the booking, e.g. a
 * provider whose job was given back or reassigned. Asking again can't change
 * that, so it is neither retried nor polled.
 */
export function isBookingGone(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

/** `useBooking`'s poll: every 4s while the booking is live, never once it's gone. */
export const BOOKING_POLL_MS = 4000;
export function bookingPollInterval(error: unknown): number | false {
  return isBookingGone(error) ? false : BOOKING_POLL_MS;
}

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
    refetchInterval: (query) => bookingPollInterval(query.state.error),
    retry: (failureCount, error) => !isBookingGone(error) && failureCount < 3,
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

export interface API_KYCQueueRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  // Provider-profile timestamps surfaced for the review queue (SVC-298).
  // `kyc_submitted_at` powers the "3 days ago" age on the Pending tab;
  // `kyc_reviewed_at` + `kyc_rejection_reason` back the Rejected tab.
  kyc_submitted_at: string | null;
  kyc_reviewed_at: string | null;
  kyc_rejection_reason: string | null;
}

// Alias kept so any older external caller still resolves; the pending list
// and the rejected list are two flavours of the same shape.
export type API_PendingKYCUser = API_KYCQueueRow;

// SVC-308: `auto_approved` is the third queue view — providers the AI verifier
// waved through in the last 7 days, surfaced for reviewer spot-checks. The
// backend filter on `/admin/providers/kyc/pending?status=auto_approved` is
// added by the SVC-307 agent; the frontend treats it as one more status.
export type KYCQueueStatus = "submitted" | "rejected" | "auto_approved";

// SVC-308: AI-verdict payload embedded in `GET /admin/providers/{id}/kyc`.
// The shape mirrors the `KYCVerdict` Pydantic model produced by SVC-307 so
// fixtures written against the ticket description double as an integration
// test against the real endpoint once that PR lands.
export type KYCVerdictOutcome = "auto_approve" | "needs_review" | "reject";

export interface API_KYCVerdictExtracted {
  aadhaar_last4: string | null;
  name_en: string | null;
  name_local: string | null;
  dob: string | null;
  gender: string | null;
  address: string | null;
}

export interface API_KYCVerdict {
  outcome: KYCVerdictOutcome;
  // 0..1 from Gemini; the UI renders confidence * 100 as a horizontal bar.
  confidence: number;
  extracted: API_KYCVerdictExtracted;
  // Machine codes (`name_mismatch`, `blurred_selfie`, …). Rendered through
  // KYC_FLAG_LABELS in the route so an unknown code degrades to its raw form
  // rather than blocking the render.
  flags: string[];
  // Kept in the payload for audit / re-verification tooling; the review UI
  // deliberately doesn't render it.
  raw_response: Record<string, unknown>;
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
  // SVC-308: null for KYCs submitted before SVC-307 shipped — the UI shows
  // an "AI: unavailable" state rather than an empty section.
  ai_verdict: API_KYCVerdict | null;
  // SVC-308: provider's stated DOB (from provider_profiles), side-by-side
  // against `ai_verdict.extracted.dob` in the comparison table. The stated
  // *name* is already the top-level `name` field (users.name) so it doesn't
  // repeat here. Nullable because a provider can submit KYC before filling
  // DOB on their profile — the row degrades to "—" rather than mismatching.
  provider_stated_dob: string | null;
}

export const useKYCQueue = (status: KYCQueueStatus = "submitted") => {
  return useQuery({
    queryKey: ["admin", "kyc", "queue", status],
    queryFn: () => apiFetch<API_KYCQueueRow[]>(`/admin/providers/kyc/pending?status=${status}`),
  });
};

// Retained for backwards compat with the old call site; prefer `useKYCQueue`.
export const usePendingKYC = () => useKYCQueue("submitted");

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
// Admin: bookings surface + force-cancel (SVC-299)
//
// These types aren't in the frozen `svc_connect.json` yet — same pattern as
// the KYC + payouts blocks below. `consumer_phone` and `provider_name` are
// admin-only widenings of BookingResponse (backend defaults them to None on
// every other route); typed inline so the frontend doesn't have to
// regenerate the whole OpenAPI snapshot for a two-field addition.
// ---------------------------------------------------------------------------

/** All possible booking statuses on the API. Widen if the enum grows. */
export type BookingStatusFilter =
  "all" | "requested" | "accepted" | "en_route" | "in_progress" | "completed" | "cancelled";

/** Admin bookings row: the base response plus the two admin-only party
 *  fields the SVC-299 backend hydrates for `/admin/bookings*`. */
export type API_AdminBookingResponse = API_BookingResponse & {
  consumer_phone?: string | null;
  provider_name?: string | null;
};

export interface API_AdminBookingListResponse {
  bookings: API_AdminBookingResponse[];
  total: number;
  page: number;
  per_page: number;
}

export interface AdminBookingsFilters {
  status: BookingStatusFilter;
  disputed: boolean;
  // Server pagination — 50 per page matches the backend default (SVC-299).
  page: number;
  perPage: number;
}

/**
 * Admin bookings list. Backend paginates at 50 per page by default; this hook
 * is stable across filter changes so react-query caches each combination.
 *
 * ``consumer_phone`` and ``provider_name`` are populated on the response
 * (SVC-299) so the table doesn't have to fetch a User per row.
 */
export const useAdminBookings = ({ status, disputed, page, perPage }: AdminBookingsFilters) => {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (disputed) params.set("disputed", "true");
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  const qs = params.toString();

  return useQuery({
    queryKey: ["admin", "bookings", "list", status, disputed, page, perPage],
    queryFn: () => apiFetch<API_AdminBookingListResponse>(`/admin/bookings?${qs}`),
  });
};

/**
 * Single admin booking (GET /admin/bookings/{id}) — powers the side sheet.
 *
 * ``staleTime: 0`` because the same booking is re-fetched immediately after
 * force-cancel (mutation `onSuccess` invalidates this key), and holding a
 * cached copy longer would flash the pre-cancel status.
 */
export const useAdminBooking = (bookingId: string | null) => {
  return useQuery({
    queryKey: ["admin", "bookings", "detail", bookingId],
    queryFn: () => apiFetch<API_AdminBookingResponse>(`/admin/bookings/${bookingId}`),
    enabled: !!bookingId,
    staleTime: 0,
  });
};

/**
 * POST /admin/bookings/{id}/cancel — force-cancel on the customer's behalf.
 *
 * Both the list (any page/filter combination) and the affected detail key are
 * invalidated on success so the row's status flips without a refresh. Backend
 * refuses with 409 on already-terminal bookings; caller surfaces the error
 * message as toast (or inline in the confirm dialog).
 */
export const useForceCancelBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason: string }) =>
      apiFetch<API_AdminBookingResponse>(`/admin/bookings/${bookingId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: (_res, { bookingId }) => {
      qc.invalidateQueries({ queryKey: ["admin", "bookings", "list"] });
      qc.invalidateQueries({ queryKey: ["admin", "bookings", "detail", bookingId] });
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

// SVC-300: per-provider payout history. Mirrors the payout_audits row shape —
// no re-invented enum — so the admin sees exactly what landed in the ledger.
export interface API_ProviderPayoutHistoryEntry {
  audit_id: string;
  /** RazorpayX `pout_XXXXX` id. Null when the attempt failed before RazorpayX
   *  returned one (see payout_audit resolve path, outcome=="unknown"). */
  payout_id: string | null;
  /** Batch key (also sent to RazorpayX as `reference_id`). Lets an admin
   *  cross-reference the RazorpayX dashboard during an incident. */
  reference_id: string | null;
  amount_paise: number;
  booking_count: number;
  /** Free-form payout_audits.outcome — one of attempting / unknown / initiated
   *  / processing / processed / completed / failed / rejected / reversed /
   *  requeued. String rather than a literal so the UI can add cases without a
   *  backend enum roundtrip. */
  outcome: string;
  /** "admin" | "reconciliation" — a reconciliation row is a repair by the
   *  nightly job, not an admin-triggered payout. Read to caption the row. */
  source: string;
  /** Null on reconciliation rows (payout_audits.admin_user_id is nullable). */
  admin_user_id: string | null;
  admin_name: string | null;
  error: string | null;
  /** ISO8601. Server uses UTC. */
  created_at: string;
}

export interface API_ProviderPayoutHistoryResponse {
  entries: API_ProviderPayoutHistoryEntry[];
  total: number;
  page: number;
  per_page: number;
}

// Payout outcomes that mean "we haven't confirmed the money settled" — reads
// the raw payout_audits.outcome column, so keep in sync with the backend
// resolve/reconcile paths. Terminal states (processed, completed, failed,
// rejected, reversed, requeued) are excluded so a finished payout doesn't
// keep the trigger button disabled forever.
export const PAYOUT_IN_FLIGHT_OUTCOMES = new Set([
  "attempting",
  "unknown",
  "initiated",
  "queued",
  "processing",
]);

// Only fetched when the admin actually expands a provider row (`enabled` flag).
// Cached per provider so re-expanding after a collapse is instant; a fresh
// trigger invalidates via useTriggerPayout below.
export const useProviderPayoutHistory = (providerId: string, enabled: boolean) => {
  return useQuery({
    queryKey: ["admin", "providers", providerId, "payouts"],
    queryFn: () =>
      apiFetch<API_ProviderPayoutHistoryResponse>(`/admin/providers/${providerId}/payouts`),
    enabled: enabled && Boolean(providerId),
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
      // SVC-300: an inline expansion of this provider's row is now stale —
      // the just-fired payout will show up as an `attempting`/`initiated`
      // row and drives the 60s in-flight guard.
      qc.invalidateQueries({ queryKey: ["admin", "providers", providerId, "payouts"] });
    },
  });
};

// ---------------------------------------------------------------------------
// Admin: team management (SVC-329)
//
// Hand-written against backend `app/schemas/admin_team.py` (#202), like the
// blocks above — not in the frozen `svc_connect.json`. Every list endpoint
// here is a bare array with no total, so paging asks for the next page until
// one comes back short.
// ---------------------------------------------------------------------------

/** GET /admin/providers — one owner (a user with a provider profile). */
export interface API_AdminProviderRow {
  user_id: string;
  name: string | null;
  phone: string;
  business_name: string | null;
  kyc_status: KycStatus;
  is_online: boolean;
  user_is_active: boolean;
  /** Active team Pros, the owner's own Pro-for-self not counted. */
  active_pro_count: number;
  created_at: string;
}

/** A Pro row as admin sees it. Removed rows are included (`is_active` false). */
export interface API_AdminTeamPro {
  id: string;
  service_provider_id: string;
  user_id: string;
  display_name: string;
  phone: string;
  user_is_active: boolean;
  profile_photo_url: string | null;
  /** KYC lives on the row: per owner, never copied between owners. */
  kyc_status: KycStatus;
  is_online: boolean;
  is_active: boolean;
  /** The owner's own Pro-for-self row. Can't be force-removed or reassigned. */
  is_self: boolean;
  /** "Takes jobs themselves" (SVC-326); meaningful on the is_self row. */
  accepts_direct_jobs: boolean;
  active_job_count: number;
  created_at: string;
}

/** An invite in the owner's history. The backend never returns the code. */
export interface API_AdminInviteRow {
  id: string;
  invitee_phone: string;
  status: string;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  revoked_at: string | null;
}

export type AdminActionKind = "user_deactivated" | "pro_force_removed" | "pro_reassigned";

/** GET /admin/actions — one append-only audit row. */
export interface API_AdminActionRow {
  id: string;
  admin_user_id: string;
  admin_name: string | null;
  action: AdminActionKind;
  target_type: "user" | "professional";
  target_id: string;
  /** The owner a Pro was removed or moved from (or the deactivated owner). */
  sp_user_id: string | null;
  /** For a reassign, the owner the person moved to. */
  to_sp_user_id: string | null;
  reason: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface API_ForceRemoveResponse {
  professional_id: string;
  /** True when this removed the owner's last other Pro while they'd switched
   *  off taking jobs themselves, so that was switched back on (SVC-326). */
  self_reenabled: boolean;
}

export interface API_ReassignResponse {
  old_professional_id: string;
  /** The person's row under the new owner: reactivated (its own KYC) or new (pending). */
  professional: API_AdminTeamPro;
  reactivated: boolean;
  self_reenabled: boolean;
}

export const ADMIN_TEAMS_PER_PAGE = 50;

/** Next page number, or undefined once a page comes back short. */
const nextPageWhileFull = <T>(last: T[], all: T[][]) =>
  last.length < ADMIN_TEAMS_PER_PAGE ? undefined : all.length + 1;

/**
 * Owner search. `q` under 2 characters lists every owner (the backend
 * rejects a 1-character `q` with a 422, so it's never sent).
 */
export const useAdminProviderSearch = (q: string) => {
  const term = q.trim();
  const sent = term.length >= 2 ? term : "";
  return useInfiniteQuery({
    queryKey: ["admin", "teams", "providers", sent],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (sent) params.set("q", sent);
      params.set("page", String(pageParam));
      params.set("per_page", String(ADMIN_TEAMS_PER_PAGE));
      return apiFetch<API_AdminProviderRow[]>(`/admin/providers?${params.toString()}`);
    },
    initialPageParam: 1,
    getNextPageParam: nextPageWhileFull,
  });
};

export const useAdminProviderTeam = (spUserId: string) =>
  useQuery({
    queryKey: ["admin", "teams", "team", spUserId],
    queryFn: () => apiFetch<API_AdminTeamPro[]>(`/admin/providers/${spUserId}/team`),
  });

export const useAdminProviderInvites = (spUserId: string) =>
  useQuery({
    queryKey: ["admin", "teams", "invites", spUserId],
    queryFn: () => apiFetch<API_AdminInviteRow[]>(`/admin/providers/${spUserId}/invites`),
  });

/** An owner's audit history: matches them on either side, so a reassign shows
 *  for both the owner the person left and the one they joined. */
export const useAdminOwnerActions = (spUserId: string) =>
  useInfiniteQuery({
    queryKey: ["admin", "teams", "actions", spUserId],
    queryFn: ({ pageParam }) =>
      apiFetch<API_AdminActionRow[]>(
        `/admin/actions?sp_user_id=${spUserId}&page=${pageParam}&per_page=${ADMIN_TEAMS_PER_PAGE}`,
      ),
    initialPageParam: 1,
    getNextPageParam: nextPageWhileFull,
  });

/**
 * Both mutations touch more than one owner's view: a reassign changes two
 * teams and both histories, and either can change an owner's Pro count in
 * search. So everything under ["admin", "teams"] is refetched.
 */
export const useAdminForceRemovePro = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ professionalId, reason }: { professionalId: string; reason: string }) =>
      apiFetch<API_ForceRemoveResponse>(`/admin/pros/${professionalId}/force-remove`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "teams"] }),
  });
};

export const useAdminReassignPro = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      professionalId,
      targetSpUserId,
      reason,
    }: {
      professionalId: string;
      targetSpUserId: string;
      reason: string;
    }) =>
      apiFetch<API_ReassignResponse>(`/admin/pros/${professionalId}/reassign`, {
        method: "POST",
        body: JSON.stringify({ target_sp_user_id: targetSpUserId, reason }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "teams"] }),
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
  // The business the provider trades as, and its logo (SVC-336/337). Null until
  // set; a null logo is shown as the bundled default (see BusinessLogo) — the
  // backend never stores a placeholder. Optional because a backend without
  // SVC-336 omits both fields.
  business_name?: string | null;
  business_image_url?: string | null;
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

// PATCH /providers/me { business_name } (SVC-337). The backend trims it and
// rejects blank or over-100-character names with a 422.
export const useUpdateBusinessName = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (business_name: string) =>
      apiFetch<ProviderProfile>("/providers/me", {
        method: "PATCH",
        body: JSON.stringify({ business_name }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providerProfile"] }),
  });
};

// POST /providers/me/business-image (multipart, field `image`) — upload/replace
// the business logo (SVC-336). There is no endpoint to remove one.
export const useUploadBusinessImage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (image: Blob) => {
      const form = new FormData();
      form.append("image", image, "logo.jpg");
      return apiFetch<ProviderProfile>("/providers/me/business-image", {
        method: "POST",
        body: form,
      });
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

// ---------------------------------------------------------------------------
// Provider earnings (SVC-260 / SVC-275)
// ---------------------------------------------------------------------------

export type EarningsRange = "today" | "week" | "month";

export type API_EarningsResponse = Schema<"EarningsResponse">;
export type API_EarningsBookingItem = Schema<"EarningsBookingItem">;
export type API_EarningsSummaryResponse = Schema<"EarningsSummaryResponse">;

/**
 * Lifetime totals: GET /providers/me/earnings/summary.
 *
 * Two scalars, whatever the history. The windowed hook below returns a row per
 * booking — fine over a week, unbounded over a lifetime — which is why the
 * backend grew a second route rather than a fourth `range` value (SVC-275).
 *
 * Provider Home and the Earnings hero both call this, deliberately: one query
 * key means react-query dedupes them into a single request and the two screens
 * cannot disagree about the number. That is SVC-275 AC3 satisfied by
 * construction rather than by two call sites staying in step.
 *
 * "Earned" here is completed-and-not-refunded, which includes cash jobs. It is
 * *not* the same as what the provider is owed — cash is already in their hand.
 * See `ProviderService._earned_filter` vs `PayoutService._owed_filter`.
 */
export const useEarningsSummary = () => {
  return useQuery({
    queryKey: ["earnings", "summary"],
    queryFn: () => apiFetch<API_EarningsSummaryResponse>("/providers/me/earnings/summary"),
  });
};

/**
 * One window's earnings + its per-booking breakdown: GET /providers/me/earnings.
 *
 * Keyed by range so switching segments swaps to cached data instead of
 * re-fetching, and switching back is instant. `placeholderData` keeps the
 * previous window on screen while the next one loads, so the figure does not
 * blink to a skeleton on every tap.
 *
 * Windows are IST calendar boundaries on the server (today = since 00:00 IST,
 * week = since Monday, month = since the 1st) — not rolling 24h/7d. The labels
 * say "Today"/"This week" for exactly that reason.
 */
export const useEarnings = (range: EarningsRange) => {
  return useQuery({
    queryKey: ["earnings", range],
    queryFn: () => apiFetch<API_EarningsResponse>(`/providers/me/earnings?range=${range}`),
    placeholderData: (previous) => previous,
  });
};

// ---------------------------------------------------------------------------
// Provider payouts (SVC-303)
// ---------------------------------------------------------------------------

export type API_ProviderPayoutSummary = Schema<"ProviderPayoutSummaryResponse">;
export type API_ProviderPayoutEntry = Schema<"ProviderPayoutEntry">;
export type API_ProviderPayoutList = Schema<"ProviderPayoutListResponse">;
export type SettlementStatus = Schema<"SettlementStatus">;
export type ApiPaymentMethod = Schema<"PaymentMethod">;

/**
 * What the next transfer will actually be: GET /providers/me/payouts/summary.
 *
 * Deliberately **not** the same question as `useEarningsSummary`. That one
 * answers "what have I earned" — completed and not refunded, cash included.
 * This answers "what is coming to me", and the two differ by real money:
 *
 * - **cash commission** is netted off. On a cash job the provider collected the
 *   whole amount at the door, so the platform's 20% comes out of their next
 *   online transfer.
 * - **a T+1 settlement gate** holds a completed job out of the payable balance
 *   until Razorpay has actually deposited that money with the platform.
 *
 * Hence three figures rather than one. `pending_amount` is what the bank will
 * send, `gross_amount` what the queued jobs are worth, and the UI names the
 * difference rather than letting a provider discover it at the bank — which is
 * the bug SVC-303 exists to close.
 *
 * Provider Home and the Earnings tab both read this, on one query key, so the
 * two screens cannot disagree. Same construction as SVC-275 AC3.
 */
export const useProviderPayoutSummary = () => {
  return useQuery({
    queryKey: ["payouts", "summary"],
    queryFn: () => apiFetch<API_ProviderPayoutSummary>("/providers/me/payouts/summary"),
  });
};

/**
 * The provider's own payout statement: GET /providers/me/payouts.
 *
 * Reads settlement statements, not payout attempts. The backend filters to
 * cycles that actually moved money, so a row here means "this landed in your
 * account" rather than "we asked the bank" — see `list_my_payouts`.
 *
 * `enabled` so the Payouts screen pays for it and the Earnings tab does not:
 * the tab shows only the last-paid figure, which the summary already carries.
 */
export const useProviderPayouts = (enabled = true) => {
  return useQuery({
    queryKey: ["payouts", "list"],
    queryFn: () => apiFetch<API_ProviderPayoutList>("/providers/me/payouts"),
    enabled,
  });
};
