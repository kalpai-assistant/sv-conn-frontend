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
import { detectPlatform } from "./platform";
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
  // The one moment we know push works end-to-end on this device: a real token
  // reached the backend. Settles whichever attempt is still open (SVC-255).
  reportPushCapability(true);
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

/* --------------------------------------------------- capability telemetry */

/**
 * How long to wait for a native token before calling the attempt a failure.
 *
 * Native `register()` resolves before the token exists — it arrives later on
 * the `registration` listener, or it never does. "Permission granted but no
 * token ever showed up" is the silent failure this whole ticket is about, so
 * it has to be counted, which means giving up on the wait at some point.
 * Issuance is normally sub-second; 15s is slack for a cold start on a bad
 * connection, not a real expectation.
 */
const NATIVE_TOKEN_WAIT_MS = 15_000;

/** The attempt awaiting an outcome, or null when nothing is in flight. */
let pendingAttempt: { interactive: boolean; permission: PushPermission } | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Tell the backend what this device can actually do about push (SVC-255).
 *
 * Nobody can currently say how many providers are reachable by push at all, so
 * there is no way to judge whether the iOS install walkthrough is worth
 * building or whether the answer is "everyone is on the Android APK anyway".
 * Sentry has the failures but no denominator, and no other request carries the
 * platform, so there is nothing to mine after the fact.
 *
 * Fire-and-forget in the strongest sense: it is deliberately not awaited and
 * swallows every error. A measurement that could break push would be worse
 * than no measurement.
 */
function sendCapabilityReport(
  permission: PushPermission,
  tokenObtained: boolean,
  interactive: boolean,
): void {
  const { platform, isChromeIOS, isIosStandalone } = detectPlatform();
  void apiFetch<void>("/users/me/push-capability", {
    method: "POST",
    body: JSON.stringify({
      platform,
      is_native: Capacitor.isNativePlatform(),
      ios_standalone: isIosStandalone,
      is_chrome_ios: isChromeIOS,
      push_permission: permission,
      token_obtained: tokenObtained,
      interactive,
    }),
  }).catch(() => {
    // Swallowed on purpose, including a 404 from a backend that predates this
    // endpoint. Not even Sentry — a failing telemetry call would report itself
    // on every app start on every stale build.
  });
}

/** Close out the open attempt, if there still is one. */
function reportPushCapability(tokenObtained: boolean): void {
  const attempt = pendingAttempt;
  if (!attempt) return;
  pendingAttempt = null;
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  sendCapabilityReport(attempt.permission, tokenObtained, attempt.interactive);
}

/**
 * Turn a registration result into exactly one report.
 *
 * One line per *attempt*, not per app start: the passive attempt on mount and
 * an explicit Enable tap are different questions ("never tried" vs "tried and
 * it still failed") and both are worth a row.
 *
 * The wait exists only for native-granted, where the token arrives out of band
 * — see `NATIVE_TOKEN_WAIT_MS`. Every other outcome is already final, because
 * without permission no token is coming, and on web the token (or its absence)
 * is part of the result.
 */
function settlePushCapability(result: PushRegistrationResult, interactive: boolean): void {
  // A still-open attempt is superseded rather than dropped — it had no token,
  // or `sendFcmToken` would already have closed it.
  reportPushCapability(false);
  pendingAttempt = { interactive, permission: result.status };

  const awaitingNativeToken = Capacitor.isNativePlatform() && result.status === "granted";
  if (!awaitingNativeToken) {
    reportPushCapability(Boolean(result.token));
    return;
  }
  pendingTimer = setTimeout(() => reportPushCapability(false), NATIVE_TOKEN_WAIT_MS);
}

/** Drop an in-flight attempt — the session is over and the POST needs a JWT. */
function cancelPushCapability(): void {
  pendingAttempt = null;
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

/* ------------------------------------------------------------------ native */

async function loadPushPlugin() {
  // Returns the module namespace, NOT `mod.PushNotifications`.
  //
  // An async function resolves whatever it returns, and resolution probes the
  // value for a `.then` to see if it's a thenable. Capacitor plugin objects are
  // Proxies that turn *any* unknown property access into a native method call,
  // so that probe becomes a call to a plugin method named `then` and throws:
  //
  //     Uncaught (in promise) Error:
  //       "PushNotifications.then()" is not implemented on android
  //
  // Every caller below goes through here, so returning the proxy broke native
  // registration, the permission read, the enable button and the logout token
  // clear — all of them, on Android, since SVC-67. It went unnoticed because
  // `google-services.json` was also missing, which is the failure everyone
  // reasonably blamed. A namespace object has no `.then`, so it survives the
  // await untouched.
  const mod = await import("@capacitor/push-notifications");
  return mod;
}

/**
 * Native permission + `register()`. The token itself does not come back from
 * here — it arrives asynchronously on the `registration` listener that
 * `useFcmRegistration` keeps attached.
 */
async function registerNative(interactive: boolean): Promise<PushRegistrationResult> {
  try {
    const { PushNotifications } = await loadPushPlugin();

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
      const { PushNotifications } = await loadPushPlugin();
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
export async function enablePushNotifications(): Promise<PushRegistrationResult> {
  const result = await (Capacitor.isNativePlatform() ? registerNative(true) : registerWeb(true));
  settlePushCapability(result, true);
  return result;
}

/**
 * Stop sending this user notifications, without un-registering the device
 * (SVC-277 bug 2).
 *
 * The Profile row had no Off. It could not simply call `clearFcmToken`: that
 * is the *logout* path, which also deletes the token at FCM itself — the user
 * would have to grant permission again to come back, and on iOS Safari a
 * declined re-prompt cannot be re-asked at all.
 *
 * So Off means "the backend has nowhere to send", not "this device is no
 * longer capable". NULLing `users.fcm_token` is enough: every send path is
 * guarded on `recipient.fcm_token`, so the user simply stops being a
 * recipient. Tapping again re-registers with the token the device still holds.
 *
 * Note the OS permission stays granted, which is why the row must not claim
 * notifications are "blocked" — someone who checks their device settings would
 * see the app still allowed and reasonably conclude the app is lying.
 */
export async function disablePushNotifications(): Promise<void> {
  // Clear the local memo first: without this, re-enabling in the same session
  // would find `lastSentToken` unchanged and skip the PATCH that restores it.
  lastSentToken = null;
  await apiFetch<void>("/users/me/fcm-token", {
    method: "PATCH",
    // A literal null, not an omitted key — the field is required and nullable
    // server-side so a half-written client cannot wipe push with `{}`.
    body: JSON.stringify({ fcm_token: null }),
  });
}

/**
 * Tell the backend to drop this user's stored token (SVC-164).
 *
 * Takes the JWT explicitly rather than leaning on the module-scoped one in
 * `api.ts`. The endpoint identifies the row from the `Authorization` header,
 * and `logout()` tears down auth state on the line right after it calls us —
 * this function can't reach `fetch` before that happens, because
 * `clearFcmToken` awaits a dynamic import first. Passing the token in makes
 * the call correct regardless of who wins that race, instead of depending on
 * it. `apiFetch` only overrides an explicit `Authorization` header while a
 * module token still exists, and it's the same token either way.
 */
async function clearFcmTokenOnServer(accessToken: string | null): Promise<void> {
  // No session → guaranteed 401 and pure log noise. Covers app-boot cleanup
  // and repeat logouts.
  if (!accessToken) return;

  try {
    await apiFetch<void>("/users/me/fcm-token", {
      method: "PATCH",
      // A LITERAL null, not an omitted key. `fcm_token` is required *and*
      // nullable server-side, deliberately so a half-written client can't
      // wipe push with an empty body — `{}` is a 422 and the token survives.
      // `JSON.stringify` preserves null (it only drops `undefined`), and
      // `apiFetch` passes `body` through untouched, so this reaches the wire
      // as {"fcm_token":null}.
      body: JSON.stringify({ fcm_token: null }),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    // Non-fatal by design: offline, a 500, or a backend predating SVC-164
    // (which 422s on the null) must never block sign-out. The server returns
    // 204 on a repeat clear, so retrying later is safe.
    reportRegistrationFailure("logout-clear-server", err);
  }
}

/** Delete the token at FCM itself, so this handset stops being addressable. */
async function deleteDeviceToken(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { PushNotifications } = await loadPushPlugin();
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
    reportRegistrationFailure("logout-clear-device", err);
  }
}

/**
 * Invalidate this device's token at logout — both halves.
 *
 * 1. Server (SVC-164): NULLs `users.fcm_token`, so the backend stops
 *    addressing pushes for the signed-out user to this device at all.
 * 2. Device: deletes the token at FCM, so even a stale server copy no longer
 *    resolves to a live handset.
 *
 * Both matter. The server call can fail (offline), and the device call can
 * fail; doing both means a single failure isn't a silent privacy leak — and
 * booking pushes carry the customer's address.
 *
 * ⚠️ `users.fcm_token` is a SINGLE column, so this drops push for the user on
 * every device, not just this one. Known and accepted for beta; the real fix
 * is a per-device token table and is its own ticket.
 *
 * Never throws — logout must complete regardless.
 */
export async function clearFcmToken(accessToken: string | null): Promise<void> {
  lastSentToken = null;
  cancelPushCapability();
  // allSettled, not all: one half failing must not skip or reject the other.
  await Promise.allSettled([clearFcmTokenOnServer(accessToken), deleteDeviceToken()]);
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
      void registerWeb(false).then((result) => settlePushCapability(result, false));
      return;
    }

    void (async () => {
      const { PushNotifications } = await loadPushPlugin();

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

      const result = await registerNative(false);
      settlePushCapability(result, false);
    })();

    return () => {
      cancelled = true;
      // Any wait for a native token dies with the mount — the report needs a
      // JWT and this cleanup is what a logout runs through.
      cancelPushCapability();
      handles.forEach((h) => void h.remove());
    };
  }, [isAuthenticated]);
}
