import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { setTokens, clearTokens } from "./api";
import { setSentryUser } from "./sentry";
import { clearFcmToken } from "./fcm";
interface User {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isNewUser: boolean;
  login: (accessToken: string, refreshToken: string, user: User, isNewUser?: boolean) => void;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // True when verify-otp reports a fresh registration; gates the user to /profile
  // setup before home. In-memory only — the `!user.name` fallback covers reloads.
  const [isNewUser, setIsNewUser] = useState(false);

  const login = useCallback(
    (accessToken: string, refreshToken: string, u: User, newUser = false) => {
      setTokens(accessToken, refreshToken);
      setUser(u);
      setIsNewUser(newUser);
      setSentryUser({ id: u.id });
    },
    [],
  );

  const logout = useCallback(() => {
    // Invalidate this device's push token before dropping the JWT. Deliberately
    // not awaited — logout must be instant and must not fail if the device is
    // offline. `clearFcmToken` never throws; it reports its own failures.
    //
    // SVC-67 AC7: this clears the token *at FCM*, so pushes for the user who
    // just signed out stop reaching this handset. It does NOT clear
    // `users.fcm_token` in the DB — the endpoint rejects an empty value. That
    // needs SVC-164.
    void clearFcmToken();
    clearTokens();
    setUser(null);
    setIsNewUser(false);
    setSentryUser(null);
  }, []);

  const updateUser = useCallback((data: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...data } : null));
    // Once the profile has a name, setup is complete — drop the new-user gate.
    if (data.name) setIsNewUser(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isNewUser, login, logout, updateUser }}
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
