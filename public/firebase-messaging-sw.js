/**
 * Firebase Messaging service worker (PWA background push).
 *
 * MUST be at the site root — the Firebase SDK looks for it at
 * `/firebase-messaging-sw.js` by default. Runs in a separate worker
 * context (no DOM, no window), so no ES modules and no Vite build.
 *
 * Purpose: when a push arrives while the PWA isn't focused (backgrounded
 * or tab closed), this worker receives the FCM message and shows a native
 * notification. When the PWA IS focused, `onMessage` in the app receives
 * it instead and we render an in-app UI (junior's SVC-67 territory).
 *
 * Config values below match `firebase-config.json` for the one Firebase
 * project we run (eazyserv-2024-a2eb1). They're all public identifiers
 * (safe to commit — the actual sender authorisation is the server-side
 * service account key). If we ever run per-environment Firebase projects
 * (post-beta), swap this file for a Vite-built variant that reads env vars.
 */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Notification click → open the app and let it decide where to go.
//
// The right screen depends on who is signed in (a provider's job screen, a
// consumer's tracking screen), and this worker can't know that: no
// localStorage, no auth state. It used to send everyone to /tracking/{id},
// which bounced providers to /provider and lost the job. So it hands the
// payload over in the URL, and the app resolves it with the same
// `routeForPayload` the native tap uses (`useNotificationRouter`,
// src/lib/notifications.ts). The parameter names are that file's
// PUSH_EVENT_PARAM / PUSH_BOOKING_PARAM; notifications.test.ts checks they match.
//
// Registered BEFORE `firebase.messaging()` on purpose (SVC-363). That call adds
// the SDK's own click listener, which claims every notification the SDK showed
// (data.FCM_MSG), stops propagation, and opens only `fcmOptions.link` — which
// our backend doesn't send. Registered after it, this listener never ran, and a
// tap did nothing. Running first, it claims the click instead.
self.addEventListener("notificationclick", (event) => {
  event.stopImmediatePropagation();
  event.notification.close();

  // The SDK shows a `notification` push itself and nests the message under
  // FCM_MSG; a data-only push shown by onBackgroundMessage carries it flat.
  const raw = event.notification.data || {};
  const data = (raw.FCM_MSG && raw.FCM_MSG.data) || raw;
  const params = new URLSearchParams();
  if (data.event) params.set("push_event", data.event);
  if (data.booking_id) params.set("push_booking_id", data.booking_id);
  const query = params.toString();
  const targetUrl = query ? `/?${query}` : "/";

  // An open app tab is not controlled by this worker (the SDK registers it
  // under /firebase-cloud-messaging-push-scope), so it only shows up with
  // includeUncontrolled, and client.navigate() would reject. Focus it and let
  // the app's router take the link. All of this stays inside waitUntil: Chrome
  // allows focus()/openWindow() only while the click event is being handled.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const app = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (app) {
        return app.focus().then((focused) => {
          (focused || app).postMessage({ type: "push_click", url: targetUrl });
        });
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});

firebase.initializeApp({
  apiKey: "AIzaSyAxGY_THmmdj5_4sULnUFUt-UnCWCoUrs4",
  authDomain: "eazyserv-2024-a2eb1.firebaseapp.com",
  projectId: "eazyserv-2024-a2eb1",
  storageBucket: "eazyserv-2024-a2eb1.firebasestorage.app",
  messagingSenderId: "10307133035",
  appId: "1:10307133035:web:56699ed06456792a371b2e",
});

const messaging = firebase.messaging();

// Background handler — fires when the PWA is not in focus and an FCM
// message arrives. A message with a `notification` block (every push our
// backend sends today) has already been shown by the SDK before this runs;
// showing it again put two in the tray (SVC-363). So only a data-only message
// is shown here, tagged by booking id so a resend replaces rather than stacks.
messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;

  self.registration.showNotification("EazyServ", {
    icon: "/icons/icon-192.png",
    tag: payload.data?.booking_id || undefined,
    data: payload.data || {},
  });
});
