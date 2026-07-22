// App-wide auth state, persisted to localStorage so a reload keeps the session.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearStoredAuth,
  loadStoredAuth,
  saveStoredAuth,
  setAuthExpiredHandler,
  type AuthUser,
  type GoogleLoginResponse,
} from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  signIn: (result: GoogleLoginResponse) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadStoredAuth()?.user ?? null);

  const signIn = useCallback((result: GoogleLoginResponse) => {
    saveStoredAuth(result);
    setUser(result.user);
  }, []);

  const signOut = useCallback(() => {
    clearStoredAuth();
    setUser(null);
  }, []);

  // When both tokens are rejected mid-session, drop back to the sign-in page.
  useEffect(() => {
    setAuthExpiredHandler(() => setUser(null));
    return () => setAuthExpiredHandler(null);
  }, []);

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}
