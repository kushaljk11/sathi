import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, refreshSession, setAccessToken } from './api';

export interface User { id: string; email: string; role: 'YOUTH' | 'COUNSELOR' | 'ORGANIZATION' | 'ADMIN'; displayName: string; emailVerified: boolean; timezone?: string }
interface Ctx { user: User | null; loading: boolean; login: (e: string, p: string) => Promise<User>; logout: () => Promise<void>; refresh: () => Promise<void> }

const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshSession()
      .then(async (t) => { if (t) setUser((await api.get('/auth/me')).data.data); })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAccessToken(data.data.accessToken);
    setUser(data.data.user);
    return data.data.user as User;
  };
  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setAccessToken(null);
    setUser(null);
  };
  const refresh = async () => { setUser((await api.get('/auth/me')).data.data); };
  return <AuthCtx.Provider value={{ user, loading, login, logout, refresh }}>{children}</AuthCtx.Provider>;
}
