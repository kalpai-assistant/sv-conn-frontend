/**
 * Data layer for the Pro app (SVC-322): who the caller is as a Pro, their jobs,
 * and their online switch. Backend: SVC-320, `app/routers/pros.py` and
 * `app/schemas/team.py`.
 *
 * Hand-written types, for the reason `useTeam.ts` gives: `svc_connect.json`
 * predates these endpoints, and regenerating it drags in every other stale
 * change with it.
 *
 * ## Who is a Pro
 *
 * Not a role. Invitees sign up as consumers (the app's signup always sends
 * `role=consumer`), so a Pro is "a user with an active `professionals` row",
 * and `GET /pros/me` is the only way to ask. It answers 404 `NOT_A_PRO` for
 * everyone else.
 *
 * It also answers 200 for a solo SP's own Pro-for-self (`is_self`). That person
 * works from the provider app, where the Pro actions are folded into their own
 * job screen, so they are not a Pro *for the Pro app*. `isTeamPro` is the test.
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { mapBooking, useServices, type API_BookingResponse, type KycStatus } from "@/hooks/useApi";

/** The SP whose team this Pro is on, as `GET /pros/me` describes it. */
export interface ProServiceProvider {
  user_id: string;
  business_name: string | null;
  business_image_url: string | null;
}

/** `GET /pros/me` (`ProMeResponse`). No payout details: those are the SP's. */
export interface ProMe {
  id: string;
  user_id: string;
  display_name: string;
  profile_photo_url: string | null;
  is_self: boolean;
  is_online: boolean;
  /** The KYC that applies to this person: their own Aadhaar KYC, or for a
   *  Pro-for-self, the SP's. */
  kyc_status: KycStatus;
  kyc_rejection_reason: string | null;
  last_location_at: string | null;
  service_provider: ProServiceProvider;
}

/** `POST /pros/me/online` and `/location` (`ProStatusResponse`). */
export interface ProStatus {
  is_online: boolean;
  last_location_at: string | null;
}

export const PRO_ME_QUERY_KEY = ["pro-me"] as const;
export const PRO_JOBS_QUERY_KEY = ["pro-jobs"] as const;

/** Enough for the Pro app: a Pro holds a handful of jobs, not pages of them. */
export const PRO_JOBS_PER_PAGE = 50;

/** Does this `/pros/me` answer make the caller a user of the Pro app? */
export function isTeamPro(me: ProMe | null | undefined): me is ProMe {
  return !!me && !me.is_self;
}

/**
 * The caller's Pro row, or `null` when they are not a Pro.
 *
 * 404 is an answer, not a failure, so it resolves to `null` rather than
 * erroring: an erroring query retries three times, and the root gate would sit
 * on a spinner for every ordinary consumer while it did. Anything else — a 5xx,
 * a dropped connection — stays an error, so a Pro offline at launch is not
 * quietly told they are a consumer.
 */
export function useProMe(userId: string | null | undefined, enabled = true) {
  const query = useQuery({
    // Keyed by user: nothing clears the query cache on logout, so a second
    // account signing in on the same phone must not read the first one's
    // answer.
    queryKey: [...PRO_ME_QUERY_KEY, userId],
    queryFn: async (): Promise<ProMe | null> => {
      try {
        return await apiFetch<ProMe>("/pros/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: enabled && !!userId,
    // No retries. The root gate holds "/" on a spinner while this is pending,
    // and the app-wide default (3 retries, 1+2+4 s backoff) would hold every
    // customer there for ~7 s whenever the backend is slow or the phone is
    // offline — a regression for the many to serve the few. A failure
    // resolves at once to an error, which the gate passes through, and the
    // next focus refetch — or the network returning, below — asks again.
    retry: false,
    // Membership changes rarely (an accept, or the SP removing them), and
    // every screen reads it. Refetched on focus anyway, which is when a
    // removal is most likely to have happened.
    staleTime: 60_000,
  });

  // Ask again when the network comes back, if the last answer was a failure.
  // React Query's own reconnect refetch does not cover this: its online
  // manager starts out assuming "online" and never reads the real state, so an
  // app *launched* offline sees no offline → online change and the `online`
  // event is a no-op. Found on device — a Pro who opened the app with no
  // signal stayed on the consumer home after it returned, until they left the
  // app and came back.
  const { isError, refetch } = query;
  useEffect(() => {
    if (!isError || typeof window === "undefined") return;
    const onOnline = () => void refetch();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [isError, refetch]);

  return query;
}

/**
 * The Pro's jobs: `active` = accepted, en route or in progress; `past` =
 * everything else, newest first. A job the Pro gave back is reassigned and
 * leaves this list — the backend filters on the job's current Pro.
 */
export function useProJobs(scope: "active" | "past", enabled = true) {
  const { data: services } = useServices(); // leverage cached services
  return useQuery({
    queryKey: [...PRO_JOBS_QUERY_KEY, scope],
    queryFn: async () => {
      const params = new URLSearchParams({ scope, per_page: String(PRO_JOBS_PER_PAGE) });
      const data = await apiFetch<{ bookings: API_BookingResponse[]; total: number }>(
        `/pros/me/jobs?${params}`,
      );
      return { jobs: data.bookings.map((b) => mapBooking(b, services)), total: data.total };
    },
    enabled,
    // Active jobs are re-asked every 30 s while a screen shows them. Found on
    // device: a Pro sitting on Home kept seeing "No job right now" after their
    // SP assigned one, because nothing refetched until a tab switch. The
    // "assigned" push refreshes it too (notifications.ts), but a push can be
    // missed or arrive late; this is the floor. Past jobs don't change.
    refetchInterval: scope === "active" ? PRO_JOBS_POLL_MS : false,
  });
}

export const PRO_JOBS_POLL_MS = 30_000;

/** Refresh everything a job transition can change, for the Pro's screens. */
function invalidateProJob(queryClient: ReturnType<typeof useQueryClient>, bookingId: string) {
  queryClient.invalidateQueries({ queryKey: ["booking", bookingId] });
  queryClient.invalidateQueries({ queryKey: PRO_JOBS_QUERY_KEY });
}

/**
 * The Pro's three legs of a job: `POST /pros/me/jobs/{id}/en-route | start |
 * complete`. Same variable shapes as the SP's `useMarkEnRoute` /
 * `useStartBooking` / `useCompleteBooking`, so `JobActions` can drive either.
 * A wrong PIN is a 400; a stale step is a 409; a job that is no longer this
 * Pro's is a 404 `JOB_NOT_FOUND`.
 */
const useProJobTransition = <V extends { bookingId: string }>(
  leg: (vars: V) => { path: string; body?: string },
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: V) => {
      const { path, body } = leg(vars);
      return apiFetch<API_BookingResponse>(`/pros/me/jobs/${vars.bookingId}/${path}`, {
        method: "POST",
        ...(body ? { body } : {}),
      });
    },
    onSuccess: (_, { bookingId }) => invalidateProJob(queryClient, bookingId),
  });
};

export const useProEnRoute = () =>
  useProJobTransition<{ bookingId: string }>(() => ({ path: "en-route" }));

export const useProStart = () =>
  useProJobTransition<{ bookingId: string; otp: string }>(({ otp }) => ({
    path: "start",
    body: JSON.stringify({ otp }),
  }));

export const useProComplete = () =>
  useProJobTransition<{ bookingId: string }>(() => ({ path: "complete" }));

/** `DeclineJobResponse`: who the job went to after this Pro said no. */
export interface DeclineJobResult {
  booking_id: string;
  /** awaiting_repick: the SP has someone else and was asked to pick.
   *  reopened: nobody else on the team, so it went back to the broadcast. */
  outcome: "awaiting_repick" | "reopened";
}

/** Turn down an assigned job, before setting off. 409 once en route. */
export function useDeclineProJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      apiFetch<DeclineJobResult>(`/pros/me/jobs/${bookingId}/decline`, { method: "POST" }),
    onSuccess: (_, bookingId) => invalidateProJob(queryClient, bookingId),
  });
}

/**
 * The location heartbeat. Rate-limited to 10 a minute; the 30 s cadence is 2.
 * Stored on the Pro row only — it does not feed dispatch or live tracking yet.
 */
export function sendProLocation(coords: { lat: number; lng: number }) {
  return apiFetch<ProStatus>("/pros/me/location", {
    method: "POST",
    body: JSON.stringify(coords),
  });
}

/**
 * My Aadhaar identity KYC (SVC-327): front, back and a live selfie, the same
 * three images an SP sends. Payout KYC stays with the SP. A Pro-for-self gets
 * 409 SELF_PRO_KYC_IS_SP_KYC, which the Pro app never reaches.
 */
export function useSubmitProKyc() {
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
      return apiFetch<unknown>("/pros/me/kyc", { method: "POST", body: form });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRO_ME_QUERY_KEY }),
  });
}

/**
 * The Pro's own online switch. Same rule as the SP's (`useSetOnlineStatus`):
 * fire it from a deliberate tap only. Online means "give me jobs", not "the
 * app is open".
 */
export function useSetProOnline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (is_online: boolean) =>
      apiFetch<ProStatus>("/pros/me/online", {
        method: "POST",
        body: JSON.stringify({ is_online }),
      }),
    onSuccess: (status) => {
      queryClient.setQueriesData<ProMe | null>({ queryKey: PRO_ME_QUERY_KEY }, (me) =>
        me ? { ...me, is_online: status.is_online } : me,
      );
    },
  });
}
