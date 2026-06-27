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
 *    + background + killed-state taps all funnel through this.
 *
 * Out of scope (deferred): Universal Links / App Links (web URL → app), FCM
 * token registration (that's SC-16 / junior's work).
 */
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { useAuth } from "@/lib/auth-context";

export type NotificationEvent =
  | "new_request" // dispatch broadcast → provider should see Incoming Request Card
  | "accepted"
  | "en_route"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "expired";

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
 * Routes returned here may not exist yet at the time of writing (e.g.
 * `/provider/job/{id}` lands with SC-19/SC-20). TanStack Router shows the
 * NotFound boundary if so — fine for partial rollouts.
 */
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
      // Booking lifecycle events go to the tracking screen, which differs by
      // role. Consumer watches /tracking/{id}; provider works the job from
      // /provider/job/{id}.
      if (role === "provider") return `/provider/job/${bookingId}`;
      if (role === "consumer") return `/tracking/${bookingId}`;
      return null;

    default:
      // Unknown event — log somewhere observable once Sentry lands (SC-46).
      return null;
  }
}

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

export function useNotificationRouter(): void {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role: ViewerRole = (user as UserWithMaybeRole | null)?.role ?? null;

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
  }, [role, navigate]);
}
