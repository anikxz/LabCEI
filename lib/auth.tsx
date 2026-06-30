import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from './supabase';

type Role = 'admin' | 'technician' | 'viewer';

/** Shape returned by our API's auth endpoints */
type ApiUser = {
  id:        string;
  email:     string;
  role?:     Role;
  full_name?: string;
};

type AppUser = {
  id:       string;
  email:    string;
  role:     Role;
  fullName: string;
};

type AuthContextType = {
  user:           AppUser | null;
  login:          (email: string, password: string) => Promise<void>;
  logout:         () => Promise<void>;
  refreshProfile: () => Promise<void>;
  loading:        boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function getProfile(apiUser: ApiUser | null): Promise<AppUser | null> {
  if (!apiUser) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', apiUser.id)
    .maybeSingle();

  if (error) {
    console.warn('Profile fetch error:', error.message);
  }

  return {
    id:       apiUser.id,
    email:    apiUser.email ?? '',
    role:     (data?.role as Role) ?? (apiUser.role as Role) ?? 'viewer',
    fullName: apiUser.full_name ?? apiUser.email?.split('@')[0] ?? 'User',
  };
}

async function clearStaleSession() {
  try {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('signOut timeout')), 3000),
      ),
    ]);
  } catch {}
  // Clear any stored tokens
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('lab_')) localStorage.removeItem(key);
    });
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserId         = useRef<string | null>(null);

  const loadUser = async () => {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.warn('Session error:', error.message);
        await clearStaleSession();
        setUser(null);
        setLoading(false);
        return;
      }

      if (data.session?.user) {
        const profile = await getProfile(data.session.user as ApiUser);
        currentUserId.current = data.session.user.id;
        setUser(profile);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.warn('Session load error:', err);
      await clearStaleSession();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          currentUserId.current = null;
          setUser(null);
          return;
        }
        if (event === 'TOKEN_REFRESHED') return;
        if (session?.user && session.user.id === currentUserId.current) return;

        if (session?.user) {
          const profile = await getProfile(session.user as ApiUser);
          currentUserId.current = session.user.id;
          setUser(profile);
        }
      },
    );

    return () => { listener.subscription.unsubscribe(); };
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profile = await getProfile((data as any)?.user as ApiUser);
    currentUserId.current = (data as any)?.user?.id ?? null;
    setUser(profile);
  };

  const logout = async () => {
    currentUserId.current = null;
    setUser(null);        // Clear UI immediately
    await clearStaleSession();
  };

  const refreshProfile = async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.user) return;
      const profile = await getProfile(data.session.user as ApiUser);
      currentUserId.current = data.session.user.id;
      setUser(profile);
    } catch (err) {
      console.warn('refreshProfile error:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshProfile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export const canEdit   = (role?: Role) => role === 'admin' || role === 'technician';
export const canDelete = (role?: Role) => role === 'admin';
