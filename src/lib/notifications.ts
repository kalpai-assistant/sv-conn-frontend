/**
 * Push-notification routing (SVC-69 / SC-69).
 *
 * Backend sends FCM pushes with `data = { event, booking_id }` on every booking
 * lifecycle event — see `backend/app/tasks/notification_tasks.py`. This module
 * turns that payload into a concrete in-app navigation.
 *
 * Two pieces:
 *
 * 1. `routeForPayload(data, role)` — a pure function: payload + viewer role ⇒
 *    target route. No side effects, safe to call anywhere, easy to unit-test.
 *
 * 2. `useNotificationRouter()` — a React hook that wires the Capacitor
 *    PushNotifications listeners and routes via TanStack Router. Foreground
 *    + background + killed-state taps all funnel through this. A web-push tap
 *    (PWA) arrives from the service worker as a URL, or as a message to an
 *    already-open tab, and is routed here too.
 *
 * Out of scope (deferred): Universal Links / App Links (web URL → app), FCM
 * token registration (that's SC-16 / junior's work).
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import type { PluginListenerHandle } from "@capacitor/core";
import { useAuth } from "@/lib/auth-context";
import i18n from "@/i18n";
import { useLanguage } from "@/i18n/LanguageProvider";

export type NotificationEvent =
  | "new_request" // dispatch broadcast → provider should see Incoming Request Card
  | "accepted"
  | "en_route"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "expired"
  // SVC-320 two-level dispatch (backend notification_tasks.py).
  | "pro_declined" // to the SP: a team Pro turned the job down, pick someone else
  | "reopened" // to the consumer: their provider dropped out, searching again
  | "no_taker_refunded" // to the consumer: nobody took a paid booking (SVC-344)
  | "assigned" // to a team Pro: the SP gave them this job
  // SVC-348: to a team Pro whose job went away, so they don't travel to it.
  | "job_cancelled" // the booking was cancelled (by the customer or an admin)
  | "unassigned"; // the SP re-picked, released or gave the job back

export interface NotificationPayload {
  event: NotificationEvent | string;
  booking_id?: string;
  // Future fields land here; unknown keys are ignored.
}

export type ViewerRole = "consumer" | "provider" | "admin" | null;

// `User.role` is added by junior's SVC-82 (provider role gate) and isn't on
// `main` yet. We read it defensively so this PR can land independently — until
// SVC-82 merges, role is always `null` and `routeForPayload` short-circuits.
// Once SVC-82 lands, the field surfaces and routing activates with no further
// change here.
type UserWithMaybeRole = { role?: "consumer" | "provider" | "admin" };

/**
 * Pure mapping: notification payload + viewer role → target route.
 *
 * Returns `null` when the payload is unactionable — unknown event, missing
 * booking_id, or a role mismatch (e.g. a `new_request` push reaching a
 * consumer, which shouldn't happen but we guard anyway).
 *
 * Every route returned here must exist. This used to send providers to
 * `/provider/job/{id}`, written ahead of a route that ended up at
 * `/provider/bookings/{id}`, on the reasoning that NotFound was fine "for
 * partial rollouts". It shipped that way and every provider push tap opened a
 * 404 (found on device, SVC-321). `notifications.test.ts` now pins each target.
 */
const providerJob = (bookingId: string) => `/provider/bookings/${bookingId}`;
const proJob = (bookingId: string) => `/pro/jobs/${bookingId}`;

export function routeForPayload(data: NotificationPayload, role: ViewerRole): string | null {
  const event = data.event;
  const bookingId = data.booking_id;

  if (!bookingId) return null;

  switch (event) {
    case "new_request":
      // Provider-only: open the Incoming Request Card via a search-param the
      // card watches (junior's SC-18 listens for `incomingBookingId` on
      // `/provider`). A consumer should never receive this push; if they do,
      // dropping it (return null) is safer than misrouting.
      if (role !== "provider") return null;
      return `/provider?incomingBookingId=${bookingId}`;

    case "accepted":
    case "en_route":
    case "in_progress":
    case "completed":
    case "cancelled":
    case "expired":
      // Booking lifecycle events open the booking, on the screen for the
      // viewer's role: the consumer watches /tracking/{id}, the provider works
      // the job from /provider/bookings/{id}.
      if (role === "provider") return providerJob(bookingId);
      if (role === "consumer") return `/tracking/${bookingId}`;
      return null;

    case "pro_declined":
      // The SP still holds the job, now with nobody on it. Their job screen is
      // where they act on it.
      return role === "provider" ? providerJob(bookingId) : null;

    case "reopened":
    case "no_taker_refunded":
      // Consumer-only. The booking is searching again (REQUESTED) or was
      // cancelled with a refund; /tracking renders both.
      return role === "consumer" ? `/tracking/${bookingId}` : null;

    case "assigned":
      // Goes to a team Pro, whose account is consumer-role, so the role cannot
      // pick the screen — /tracking would show them a customer's view. Their
      // job view is the Pro app's (SVC-322). If the recipient somehow is not a
      // Pro, the root gate sends them home from there. Never to a provider:
      // the backend doesn't tell an SP who picked themselves.
      return role === "consumer" ? proJob(bookingId) : null;

    case "job_cancelled":
    case "unassigned":
      // The team Pro's side of a job going away (SVC-348), so the same rule as
      // "assigned". Plain "cancelled" would send them to /tracking. Their job
      // screen shows the cancelled state, or "no longer yours" once the
      // booking answers 403.
      return role === "consumer" ? proJob(bookingId) : null;

    default:
      // Unknown event — log somewhere observable once Sentry lands (SC-46).
      return null;
  }
}

/**
 * What the Pro is told when a job goes away with the app open (SVC-348), as
 * keys under `pushToast` in pro.json. Word for word the push's own title and
 * body (backend NOTIFICATION_TEMPLATES, and its PROVIDER_PUSH_TRANSLATIONS in
 * Hindi/Marathi), so the toast and the notification never disagree. Not
 * "reassigned": a release or give-back sends the job back to searching, to
 * nobody.
 */
const PRO_JOB_GONE_TOAST: Record<string, { title: string; description: string }> = {
  job_cancelled: {
    title: "pushToast.jobCancelledTitle",
    description: "pushToast.jobCancelledBody",
  },
  unassigned: { title: "pushToast.unassignedTitle", description: "pushToast.unassignedBody" },
};

/**
 * Whether a foreground-arrival notification should auto-navigate.
 *
 * `new_request` for a provider is time-critical (2-minute accept window) —
 * we open the card immediately even if the app is in the foreground. Other
 * events arriving in the foreground don't navigate — the user is presumably
 * already on the tracking screen, and yanking them is jarring.
 */
function shouldAutoRouteForeground(data: NotificationPayload, role: ViewerRole): boolean {
  return data.event === "new_request" && role === "provider";
}

/**
 * A web-push tap arrives as a URL (`/?push_event=…&push_booking_id=…`) built by
 * `public/firebase-messaging-sw.js`, which can't know the viewer's role. Keep
 * these names in step with that file.
 */
export const PUSH_EVENT_PARAM = "push_event";
export const PUSH_BOOKING_PARAM = "push_booking_id";

/** The push payload carried in a URL's query string, or null if none. */
export function readPushLink(search: string): NotificationPayload | null {
  const params = new URLSearchParams(search);
  const event = params.get(PUSH_EVENT_PARAM);
  if (!event) return null;
  return { event, booking_id: params.get(PUSH_BOOKING_PARAM) ?? undefined };
}

/**
 * A web-push tap while the app is already open (SVC-363). The service worker
 * focuses the tab and posts `{ type: "push_click", url }`, `url` being the same
 * `/?push_event=…` link it opens when no tab is open. It can't navigate the tab
 * itself: the Firebase SDK registers it under its own scope, so it controls no
 * app window. Anything else posted to the page is not ours: null.
 */
export function readPushClickMessage(data: unknown): NotificationPayload | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, url } = data as { type?: unknown; url?: unknown };
  if (type !== "push_click" || typeof url !== "string") return null;
  return readPushLink(new URL(url, "https://app.invalid").search);
}

/** A push tap to route: from the launch URL (replaces it) or a message (pushes). */
interface PushLink {
  payload: NotificationPayload;
  replace: boolean;
}

export function useNotificationRouter(): void {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role: ViewerRole = (user as UserWithMaybeRole | null)?.role ?? null;
  // The foreground toasts speak the screen's language (SVC-395), read when a
  // push arrives. A ref, not a dependency: the listeners below are added once
  // per role, and re-adding them on every /pro ↔ /profile move would leave a
  // gap where a push goes unheard.
  const lang = useLanguage();
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  // Web push (PWA). Read once, on the first render: that runs before any
  // child's effect, and __root's role redirects (a provider landing on "/" is
  // sent to /provider) would otherwise drop the query string first. Resolved
  // once the role is known, which is after the session restore, or after login
  // when the tap opened a signed-out app. A tap on an already-open tab arrives
  // as a service-worker message instead, and takes the same path from here.
  const [pushLink, setPushLink] = useState<PushLink | null>(() => {
    if (typeof window === "undefined") return null;
    const payload = readPushLink(window.location.search);
    return payload && { payload, replace: true };
  });
  const handledPushLink = useRef<PushLink | null>(null);
  useEffect(() => {
    if (!pushLink || handledPushLink.current === pushLink || role === null) return;
    handledPushLink.current = pushLink;
    const target = routeForPayload(pushLink.payload, role);
    if (target) navigate({ to: target, replace: pushLink.replace });
  }, [pushLink, role, navigate]);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || !("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    const onMessage = (event: MessageEvent) => {
      const payload = readPushClickMessage(event.data);
      if (payload) setPushLink({ payload, replace: false });
    };
    container.addEventListener("message", onMessage);
    // addEventListener alone leaves messages queued until DOMContentLoaded;
    // a tap that cold-opens the tab can land before that.
    container.startMessages();
    return () => container.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handles: PluginListenerHandle[] = [];
    // Guards a race where the component unmounts before the lazy import
    // resolves — without it we'd attach a listener that's never removed.
    let cancelled = false;

    (async () => {
      // Lazy import keeps the plugin out of the web bundle (matches the
      // pattern from `src/lib/camera.ts`).
      const { PushNotifications } = await import("@capacitor/push-notifications");

      const tapped = await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          const target = routeForPayload(action.notification.data as NotificationPayload, role);
          if (target) navigate({ to: target });
        },
      );
      if (cancelled) {
        tapped.remove();
        return;
      }
      handles.push(tapped);

      const received = await PushNotifications.addListener(
        "pushNotificationReceived",
        (notification) => {
          const data = notification.data as NotificationPayload;
          const t = i18n.getFixedT(langRef.current, "pro");
          // A job assigned while the Pro has the app open (SVC-322). Android
          // shows no notification in the foreground, so without this nothing
          // happened at all: found on device, Pro Home kept saying "No job
          // right now". Refresh, and offer the job rather than yanking them
          // off whatever they are doing — possibly typing a PIN at a door.
          if (data.event === "assigned" && role === "consumer" && data.booking_id) {
            const target = proJob(data.booking_id);
            void queryClient.invalidateQueries({ queryKey: ["pro-jobs"] });
            toast(t("pushToast.assignedTitle"), {
              description: t("pushToast.assignedBody"),
              action: { label: t("pushToast.open"), onClick: () => navigate({ to: target }) },
            });
            return;
          }
          // The reverse (SVC-348): the job was cancelled or taken off them.
          // Refresh Pro Home and the job screen if it is open, and say so. No
          // "Open": there is nothing to do there but read that it is gone.
          const gone = PRO_JOB_GONE_TOAST[data.event];
          if (gone && role === "consumer" && data.booking_id) {
            void queryClient.invalidateQueries({ queryKey: ["pro-jobs"] });
            void queryClient.invalidateQueries({ queryKey: ["booking", data.booking_id] });
            toast(t(gone.title), { description: t(gone.description) });
            return;
          }
          if (!shouldAutoRouteForeground(data, role)) return;
          const target = routeForPayload(data, role);
          if (target) navigate({ to: target });
        },
      );
      if (cancelled) {
        received.remove();
        return;
      }
      handles.push(received);
    })();

    return () => {
      cancelled = true;
      handles.forEach((h) => h.remove());
    };
  }, [role, navigate, queryClient]);
}
