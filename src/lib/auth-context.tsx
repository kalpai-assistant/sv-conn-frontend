import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, clearTokens, getAccessToken, hasStoredAuth, setTokens } from "./api";
import { setSentryUser } from "./sentry";
import { clearFcmToken } from "./fcm";
import { resetLocationGate } from "./location-gate";
import { clearSession } from "./session";

// SVC-41 back-port: three roles the backend recognises. The client uses this
// to pick between consumer and provider UIs; `admin` isn't a mobile persona
// but the type mirrors backend for exhaustiveness.
export type UserRole = "consumer" | "provider" | "admin";

interface User {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isNewUser: boolean;
  /** True during app cold-start while we probe stored tokens against the
   *  backend. UI should render a splash / spinner instead of the AuthFlow
   *  so a signed-in user doesn't see the login screen flash before landing
   *  on home. Flips false once the probe resolves either way. */
  isRestoring: boolean;
  login: (accessToken: string, refreshToken: string, user: User, isNewUser?: boolean) => void;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Persists the user record alongside the tokens (api.ts holds the tokens).
// The tokens alone would be enough to prove auth — but re-fetching the
// user on every cold start is a round-trip we can avoid by caching the
// object. The probe in AuthProvider revalidates against /users/me anyway,
// so a stale local copy self-heals on next boot with network.
const USER_STORAGE_KEY = "eazyserv:user";

function readStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Defensive: shape check. A schema change or a tampered value shouldn't
    // hand the app a malformed user object.
    if (parsed && typeof parsed.id === "string" && typeof parsed.phone === "string") {
      return parsed as User;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredUser(user: User | null): void {
  if (typeof window === "undefined") return;
  try {
    if (user === null) window.localStorage.removeItem(USER_STORAGE_KEY);
    else window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Private-mode; ignore.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // The QueryClient `logout` hands to `clearSession` (SVC-350). Grabbed via
  // the hook rather than imported from `__root.tsx` so this module stays
  // free of a route-tree import and tests can wrap the provider under any
  // client they like.
  const queryClient = useQueryClient();
  // Seed from localStorage immediately so the very first render already
  // knows whether we THINK we're logged in. The probe below either
  // confirms it (network + token still valid) or clears everything.
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  // True when verify-otp reports a fresh registration; gates the user to /profile
  // setup before home. In-memory only — the `!user.name` fallback covers reloads.
  const [isNewUser, setIsNewUser] = useState(false);
  // Start restoring iff we have any stored auth to probe. If nothing's in
  // storage, we're not restoring — we're just logged out; render AuthFlow
  // immediately.
  const [isRestoring, setIsRestoring] = useState<boolean>(() => hasStoredAuth());

  // Cold-start session restore.
  //
  // On mount, if api.ts loaded tokens from localStorage, hit /users/me to
  // prove the token still authenticates. Three outcomes:
  //   - 200: token good → user object in state (also gives us the fresh
  //          copy in case something changed since last cache write)
  //   - 401 → apiFetch's built-in refresh flow → either succeeds (200 on
  //          retry, we're good) or fails → refresh token also dead →
  //          `clearTokens()` in api.ts fires → we drop back to AuthFlow.
  //   - Network error: leave stored user in state; next real API call
  //          will retry. Better than logging the user out on a train tunnel.
  useEffect(() => {
    if (!hasStoredAuth()) {
      // Nothing to probe — the initial isRestoring guard was already false,
      // this is just defensive if the storage was mutated between reads.
      setIsRestoring(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await apiFetch<User>("/users/me");
        if (cancelled) return;
        setUser(me);
        writeStoredUser(me);
        setSentryUser({ id: me.id });
      } catch (err) {
        if (cancelled) return;
        // apiFetch has already tried refresh + clearTokens on hard 401.
        // If we still have tokens after the throw, it was a network error
        // (transient) — keep the cached user so the app boots offline.
        // If tokens are gone, drop the user too.
        if (!hasStoredAuth()) {
          setUser(null);
          writeStoredUser(null);
          setSentryUser(null);
        }
        // Deliberately swallow — a failed probe isn't a UI error.
        void err;
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    (accessToken: string, refreshToken: string, u: User, newUser = false) => {
      // Belt-and-braces for "same session, different account" on a shared
      // device (SVC-350). The logout path already clears, but a user can
      // reach this code without one — refresh-token loss, cold start into
      // AuthFlow after a wipe, or a stale cache that survived a prior
      // bug — and we would rather clear twice than ever leak once.
      clearSession(queryClient);
      setTokens(accessToken, refreshToken);
      setUser(u);
      writeStoredUser(u);
      setIsNewUser(newUser);
      setSentryUser({ id: u.id });
    },
    [queryClient],
  );

  const logout = useCallback(() => {
    // Wipe every user-scoped cache BEFORE touching auth state (SVC-350).
    //
    // Order matters: if we flipped `user` to null first, consumers that read
    // the auth context would re-render and some would unmount; a query hook
    // mid-flight can still land its response and re-populate `queryClient`
    // with user A's data under user B's eventual token. Clearing first makes
    // every subsequent write a no-op from the point of view of the signed-out
    // user — the only data the next route can see is what it fetches fresh.
    clearSession(queryClient);
    // Invalidate this device's push token — server-side and at FCM.
    //
    // The JWT is snapshotted BEFORE `clearTokens()` wipes it. The clear
    // endpoint identifies the row from the Authorization header alone, and
    // `clearFcmToken` awaits a dynamic import before it can reach `fetch`,
    // so it could never win a race against the next line. Handing it the
    // token makes the call correct regardless of ordering rather than
    // depending on it — get this wrong and logout still "works" while the
    // signed-out user's token silently lives on in the DB forever.
    //
    // Deliberately not awaited: logout must be instant and must still work
    // offline. `clearFcmToken` never throws; it reports its own failures.
    void clearFcmToken(getAccessToken());
    clearTokens();
    writeStoredUser(null);
    setUser(null);
    setIsNewUser(false);
    setSentryUser(null);
    // SVC-281: the location answer belongs to a session, not to the app
    // process. Without this the next person to sign in on this device inherits
    // the previous user's "yes, I'm here" and never sees the question — found
    // on device, where a provider logged in after a consumer and went straight
    // to their home screen with no location confirmed.
    resetLocationGate();
  }, [queryClient]);

  const updateUser = useCallback((data: Partial<User>) => {
    setUser((prev) => {
      const next = prev ? { ...prev, ...data } : null;
      writeStoredUser(next);
      return next;
    });
    // Once the profile has a name, setup is complete — drop the new-user gate.
    if (data.name) setIsNewUser(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isNewUser, isRestoring, login, logout, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
