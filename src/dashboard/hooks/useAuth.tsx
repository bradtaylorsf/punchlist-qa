import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import * as api from '../api/client';

interface UserInfo {
  email: string;
  name: string;
  role: string;
}

interface AuthContextValue {
  user: UserInfo | null;
  loading: boolean;
  setupRequired: boolean;
  login: (token: string) => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  const refreshAuth = useCallback(async () => {
    const res = await api.getAuthStatus();
    setSetupRequired(res.data.setupRequired);
    setUser(res.data.user);
  }, []);

  useEffect(() => {
    refreshAuth()
      .catch(() => {
        setUser(null);
        setSetupRequired(false);
      })
      .finally(() => setLoading(false));
  }, [refreshAuth]);

  const login = useCallback(async (token: string) => {
    await api.login(token);
    await refreshAuth();
  }, [refreshAuth]);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    await api.loginWithPassword(email, password);
    await refreshAuth();
  }, [refreshAuth]);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setSetupRequired(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setupRequired, login, loginWithPassword, logout, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
