import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, User } from './api';

interface AuthState { user: User | null; ready: boolean; signIn: (token: string, user: User) => void; signOut: () => void }
const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api.me().then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const signIn = (token: string, u: User) => { setToken(token); setUser(u); };
  const signOut = () => { setToken(null); setUser(null); };
  return <Ctx.Provider value={{ user, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}
