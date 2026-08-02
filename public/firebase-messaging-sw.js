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
// message arrives. We show a native notification either way, using the
// booking id as a tag so the tray doesn't fill with duplicates on resend.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Eazyserv";
  const body = payload.notification?.body || "";

  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    tag: payload.data?.booking_id || undefined,
    data: payload.data || {},
  });
});

// Notification click → focus / open the app at the right route.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const bookingId = event.notification.data?.booking_id;
  const targetUrl = bookingId ? `/tracking/${bookingId}` : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && "navigate" in client) {
          client.focus();
          return client.navigate(targetUrl);
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
