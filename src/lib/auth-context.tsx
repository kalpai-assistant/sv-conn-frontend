import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { setTokens, clearTokens } from "./api";
import { setSentryUser } from "./sentry";
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
