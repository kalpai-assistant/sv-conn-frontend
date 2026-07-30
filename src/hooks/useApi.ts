import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
// Let's use the mock-data types as target shape so we don't have to rewrite UI heavily
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
  avg_rating: number;
  total_completed_jobs: number;
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
