'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, setAccessToken } from './api-client';

type AuthUser = {
  sub: string;
  companyId: string;
  roles: string[];
  permissions: string[];
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  hasPermission: (perm: string | null) => boolean;
  login: (email: string, password: string) => Promise<any>;
  completeMfaLogin: (mfaToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const restoreSession = useCallback(async () => {
    try {
      // relies on the httpOnly refresh cookie; api-client silently refreshes on 401
      const me = await api.me();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Returns the raw backend response: either a full session ({ accessToken })
  // or an MFA challenge ({ mfaRequired: true, mfaToken }) — the login page
  // decides what to render next based on which one comes back.
  async function login(email: string, password: string) {
    const result = await api.login(email, password);
    if ('accessToken' in result) {
      setAccessToken(result.accessToken);
      const me = await api.me();
      setUser(me);
    }
    return result;
  }

  async function completeMfaLogin(mfaToken: string, code: string) {
    const { accessToken } = await api.verifyMfaLogin(mfaToken, code);
    setAccessToken(accessToken);
    const me = await api.me();
    setUser(me);
  }

  async function logout() {
    await api.logout().catch(() => {});
    setAccessToken(null);
    setUser(null);
    router.push('/login');
  }

  // SUPER_ADMIN bypasses granular checks — mirrors backend PermissionsGuard exactly,
  // so the UI never shows something the API would refuse.
  function hasPermission(perm: string | null) {
    if (!perm) return true;
    if (!user) return false;
    if (user.roles.includes('SUPER_ADMIN')) return true;
    return user.permissions.includes(perm);
  }

  return (
    <AuthContext.Provider value={{ user, loading, hasPermission, login, completeMfaLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
