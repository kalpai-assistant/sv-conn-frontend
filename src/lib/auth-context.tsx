import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { setTokens, clearTokens } from "./api";
interface User {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = useCallback((accessToken: string, refreshToken: string, u: User) => {
    setTokens(accessToken, refreshToken);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);


  const updateUser = useCallback((data: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...data } : null));
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
