/**
 * Firebase initialization — browser + SSR-safe.
 *
 * All 6 Firebase config values + the VAPID public key come from Vite env
 * vars (see `.env.example`). This file is safe to import from any component;
 * `getMessaging()` returns null on the server and when the browser doesn't
 * support the push APIs (older iOS Safari < 16.4, most in-app browsers).
 *
 * The single-init pattern (module-scoped flag) means importing this from
 * multiple call sites doesn't double-init Firebase (would throw).
 *
 * Foundation only — the actual FCM token registration + push handling lives
 * in `src/lib/fcm.ts` (junior's SVC-67 territory).
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// VAPID public key — required to subscribe a browser to Web Push. Public
// half of a key pair; safe to ship in the client bundle.
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let messagingInitialized = false;

function ensureConfigured(): boolean {
  // Fail fast in dev if the env is unset — silent no-op would make
  // "why aren't pushes arriving?" a nightmare to diagnose.
  if (!config.apiKey || !config.projectId || !config.appId) {
    if (import.meta.env.DEV) {
      console.warn("[firebase] config env vars missing — Firebase disabled");
    }
    return false;
  }
  return true;
}

/** The Firebase app instance. Null if config is missing. */
export function getFirebaseApp(): FirebaseApp | null {
  if (app) return app;
  if (!ensureConfigured()) return null;
  app = initializeApp(config);
  return app;
}

/**
 * The Firebase Messaging instance. Null on the server, on unsupported
 * browsers (old iOS Safari, in-app browsers, or private tabs where the
 * Push API isn't available), or when the config env vars aren't set.
 *
 * Callers must handle null gracefully — a return value of null means
 * "push is not available here, don't error the user."
 */
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (messagingInitialized) return messaging;
  messagingInitialized = true;

  if (typeof window === "undefined") return null; // SSR guard

  const supported = await isSupported();
  if (!supported) return null;

  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;

  messaging = getMessaging(firebaseApp);
  return messaging;
}
