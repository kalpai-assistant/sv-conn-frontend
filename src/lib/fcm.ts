/**
 * FCM device-token registration (SVC-67).
 *
 * Obtains a device token and stores it against the logged-in user via
 * `PATCH /users/me/fcm-token`, which is what gives the backend somewhere to
 * send. Until a user has a token, `send_booking_notification` skips them
 * entirely — the broadcast loop is guarded on `recipient.fcm_token` and the
 * column is NULL by default.
 *
 * ## Two registration paths, picked at runtime
 *
 * |            | Android APK (Capacitor)          | PWA (iOS Safari, Chrome Android) |
 * | ---------- | -------------------------------- | -------------------------------- |
 * | SDK        | `@capacitor/push-notifications`  | `firebase/messaging`             |
 * | Permission | `requestPermissions()`           | `Notification.requestPermission()` |
 * | Token      | `register()` → `registration` ev | `getToken(…, { vapidKey })`      |
 *
 * Both SDKs are **lazy-imported** so neither lands in the other platform's
 * bundle, and the native plugin is never touched on web (it would throw).
 *
 * ## Permission is requested differently on each path, deliberately
 *
 * Android can prompt programmatically, so the hook does it on mount. Safari —
 * including iOS PWAs, our only iOS target — requires `requestPermission()` to
 * be called from a **user gesture**; calling it on mount is rejected outright.
 * So on web the hook only re-mints a token for users who already granted
 * permission, and the first grant comes from `enablePushNotifications()`,
 * wired to a button in Profile.
 *
 * ## Tokens rotate
 *
 * FCM reissues on reinstall, restore, or at its own discretion, and a rotated
 * token that never reaches the backend orphans the device silently — pushes go
 * nowhere and nothing errors. So: the native `registration` listener stays
 * attached for the whole session (it fires on rotation, not just on
 * `register()`), and the web path re-mints on every app start. Every token we
 * see is sent; `lastSentToken` only suppresses re-sending one already sent in
 * this same session.
 *
 * Handling pushes once they arrive is SVC-68 / SVC-69 — see `notifications.ts`.
 */
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { apiFetch } from "./api";
import { reportError } from "./sentry";

/**
 * `unsupported` covers browsers without the Push API (iOS Safari < 16.4,
 * in-app browsers, private tabs) and a missing/blank Firebase config — in all
 * of those "push isn't available here", which is not an error to shout about.
 */
export type PushPermission = "granted" | "denied" | "prompt" | "unsupported";

export interface PushRegistrationResult {
  status: PushPermission;
  /** Only ever set on the web path — native tokens arrive via the listener. */
  token?: string;
  /** Set when registration failed for a reason that isn't the user saying no. */
  error?: Error;
}

/**
 * The last token successfully PATCHed, so a stable token isn't re-sent on
 * every render. Module-scoped and therefore per-page-load: each app start
 * sends once, which is the cheap way to catch a token that rotated while the
 * app was closed. Cleared on logout.
 */
let lastSentToken: string | null = null;

/**
 * Store a device token against the current user. Requires a JWT; returns 204.
 *
 * `users.fcm_token` is a single nullable column server-side, so this
 * overwrites rather than appends — a second device displaces the first. That's
 * accepted for beta (multi-device storage is explicitly out of scope), but it
 * is why nothing here treats the remote value as a set.
 */
export async function sendFcmToken(token: string): Promise<void> {
  if (!token || token === lastSentToken) return;
  await apiFetch<void>("/users/me/fcm-token", {
    method: "PATCH",
    body: JSON.stringify({ fcm_token: token }),
  });
  lastSentToken = token;
}

/**
 * Report a registration failure. AC4: a provider who silently receives no jobs
 * must not be the first to notice, so every unexpected failure goes to Sentry
 * with the stage that broke.
 *
 * User-visible messaging is left to the caller — the mount-time path stays
 * quiet (a toast on every cold start would be noise), while the Profile button
 * reports the outcome inline because the user just asked for it.
 */
function reportRegistrationFailure(stage: string, err: unknown): Error {
  const error = err instanceof Error ? err : new Error(String(err));
  reportError(error, { scope: "fcm-registration", stage });
  return error;
}

/* ------------------------------------------------------------------ native */

async function loadPushPlugin() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return PushNotifications;
}

/**
 * Native permission + `register()`. The token itself does not come back from
 * here — it arrives asynchronously on the `registration` listener that
 * `useFcmRegistration` keeps attached.
 */
async function registerNative(interactive: boolean): Promise<PushRegistrationResult> {
  try {
    const PushNotifications = await loadPushPlugin();

    let perm = await PushNotifications.checkPermissions();
    // `prompt-with-rationale` is Android's "user denied once, explain why".
    // Only re-ask on an explicit user action; re-prompting on every launch is
    // how apps get permanently blocked.
    if (perm.receive === "prompt" || (perm.receive === "prompt-with-rationale" && interactive)) {
      perm = await PushNotifications.requestPermissions();
    }

    if (perm.receive !== "granted") {
      return { status: perm.receive === "denied" ? "denied" : "prompt" };
    }

    // Kicks off token issuance; resolves before the token exists.
    await PushNotifications.register();
    return { status: "granted" };
  } catch (err) {
    return { status: "denied", error: reportRegistrationFailure("native-register", err) };
  }
}

/* --------------------------------------------------------------------- web */

/**
 * Lazy handle on `./firebase`, which statically imports `firebase/messaging`.
 * Importing it at the top of this module would pull the entire Web Push SDK
 * (~250 kB) into the Capacitor bundle, where the web path never runs. Loading
 * it here keeps it in its own chunk, fetched only when a browser actually
 * reaches for a token.
 */
function loadFirebase() {
  return import("./firebase");
}

/**
 * Mint a Web Push token. Returns `null` when push isn't available in this
 * browser at all, which is a normal outcome, not a failure.
 *
 * The Firebase SDK registers `/firebase-messaging-sw.js` itself, under its own
 * `/firebase-cloud-messaging-push-scope` scope — so it does not fight
 * vite-plugin-pwa's service worker for the root scope. The file must be served
 * from the site root for that default lookup to find it; `public/` puts it
 * there in both builds.
 *
 * NOTE: `getToken` carries a deprecation notice in firebase-js-sdk v12, which
 * points at `register()` + `onRegistered()`. That replacement yields a
 * **Firebase Installation ID, not a registration token**, and targeting a FID
 * is a backend change — `users.fcm_token` holds a token and the send path
 * passes it as one. Migrating is a cross-repo contract change, not a local
 * cleanup; until it's agreed, `getToken` is the correct call here. Deprecated,
 * not removed — it still works.
 */
async function getWebToken(): Promise<string | null> {
  const { getFirebaseMessaging, VAPID_PUBLIC_KEY } = await loadFirebase();
  const messaging = await getFirebaseMessaging();
  if (!messaging) return null;

  if (!VAPID_PUBLIC_KEY) {
    // Config gap, not a browser limitation — worth an explicit error, because
    // the symptom otherwise is "push just never works" with nothing logged.
    throw new Error("VITE_FIREBASE_VAPID_KEY is not set — cannot mint a Web Push token");
  }

  const { getToken } = await import("firebase/messaging");
  return getToken(messaging, { vapidKey: VAPID_PUBLIC_KEY });
}

async function registerWeb(interactive: boolean): Promise<PushRegistrationResult> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return { status: "unsupported" };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    // Safari (and so every iOS PWA) rejects this outside a user gesture, so
    // the mount-time path must not attempt it — it would burn the prompt.
    if (!interactive) return { status: "prompt" };
    try {
      permission = await Notification.requestPermission();
    } catch (err) {
      return { status: "denied", error: reportRegistrationFailure("web-permission", err) };
    }
  }

  if (permission !== "granted") {
    return { status: permission === "denied" ? "denied" : "prompt" };
  }

  try {
    const token = await getWebToken();
    if (!token) return { status: "unsupported" };
    await sendFcmToken(token);
    return { status: "granted", token };
  } catch (err) {
    return { status: "granted", error: reportRegistrationFailure("web-token", err) };
  }
}

/* ------------------------------------------------------------------ public */

/**
 * Current push permission, without requesting anything. Drives the Profile
 * row's label so it can say "On" / "Blocked in settings" / "Enable".
 */
export async function getPushPermission(): Promise<PushPermission> {
  if (Capacitor.isNativePlatform()) {
    try {
      const PushNotifications = await loadPushPlugin();
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive === "granted") return "granted";
      return perm.receive === "denied" ? "denied" : "prompt";
    } catch {
      return "unsupported";
    }
  }

  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return Notification.permission === "denied" ? "denied" : "prompt";
}

/**
 * Request permission and register, from a user gesture.
 *
 * This is the only path that may prompt on web — see the Safari gesture
 * requirement in the module docs. Safe to call on either platform.
 */
export function enablePushNotifications(): Promise<PushRegistrationResult> {
  return Capacitor.isNativePlatform() ? registerNative(true) : registerWeb(true);
}

/**
 * Invalidate this device's token at logout.
 *
 * ⚠️ This clears the token **on the device**, not in the database. The backend
 * rejects an empty value — `UpdateFCMTokenRequest.fcm_token` is
 * `Field(..., max_length=255)`, i.e. required and non-empty — so the stored
 * string stays until SVC-164 relaxes it. Deleting the token at FCM is the half
 * we can do unilaterally, and it is the half that matters for privacy: the
 * stale string in the column no longer addresses a live device, so pushes for
 * the previous user (booking addresses included) stop landing on a handset
 * someone else may now be holding.
 *
 * Never throws — logout must complete regardless.
 */
export async function clearFcmToken(): Promise<void> {
  lastSentToken = null;

  try {
    if (Capacitor.isNativePlatform()) {
      const PushNotifications = await loadPushPlugin();
      // Deletes the Firebase token on Android (plugin ≥ 5.0).
      await PushNotifications.unregister();
      return;
    }

    if (typeof window === "undefined") return;
    const { getFirebaseMessaging } = await loadFirebase();
    const messaging = await getFirebaseMessaging();
    if (!messaging) return;
    const { deleteToken } = await import("firebase/messaging");
    await deleteToken(messaging);
  } catch (err) {
    // Best-effort: a failure here must not block logout, but we still want to
    // know, because it means a device kept a live token after sign-out.
    reportRegistrationFailure("logout-clear", err);
  }
}

/**
 * Keep the logged-in user's device token registered and current.
 *
 * Mount once, inside `AuthProvider`. No-op when logged out (the PATCH needs a
 * JWT) and no-op on the server during SSR.
 *
 * Takes `isAuthenticated` rather than calling `useAuth()` itself: `logout()`
 * lives in `auth-context` and needs `clearFcmToken()` from this module, so
 * importing the context here would close an import cycle.
 */
export function useFcmRegistration(isAuthenticated: boolean): void {
  useEffect(() => {
    if (!isAuthenticated) return;

    // Guards the unmount-before-lazy-import-resolves race, same pattern as
    // `useNotificationRouter`.
    let cancelled = false;
    const handles: PluginListenerHandle[] = [];

    if (!Capacitor.isNativePlatform()) {
      // Web: re-mint on every app start so a token that rotated while the app
      // was closed gets re-sent. Only for users who already granted — the
      // first grant needs a gesture (Profile → Notifications).
      void registerWeb(false);
      return;
    }

    void (async () => {
      const PushNotifications = await loadPushPlugin();

      // Attached before register() so the first token isn't missed, and left
      // attached for the session so rotations are caught too.
      const registered = await PushNotifications.addListener("registration", (token) => {
        void sendFcmToken(token.value).catch((err) => reportRegistrationFailure("send-token", err));
      });
      if (cancelled) {
        void registered.remove();
        return;
      }
      handles.push(registered);

      const failed = await PushNotifications.addListener("registrationError", (err) => {
        reportRegistrationFailure("native-registration-event", err.error);
      });
      if (cancelled) {
        void failed.remove();
        return;
      }
      handles.push(failed);

      await registerNative(false);
    })();

    return () => {
      cancelled = true;
      handles.forEach((h) => void h.remove());
    };
  }, [isAuthenticated]);
}
