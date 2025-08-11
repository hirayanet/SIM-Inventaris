import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@/shared/types';
import { supabase } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore session from Supabase and sync profile
    const init = async () => {
      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch {
            localStorage.removeItem('user');
          }
        }

        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authUser.id)
            .single();
          if (profile) {
            const appUser: User = {
              id: profile.id,
              username: profile.username,
              role: profile.role,
              full_name: profile.full_name,
              is_active: profile.is_active,
              created_at: profile.created_at,
              updated_at: profile.updated_at,
            };
            setUser(appUser);
            localStorage.setItem('user', JSON.stringify(appUser));
          }
        }
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      // gunakan email sintetik dari username agar tetap "login username"
      const email = `${username}@sim.local`;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Ambil profile berdasarkan auth user id
      const userId = data.user.id;
      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (pErr || !profile) throw pErr || new Error('Profil tidak ditemukan');

      const appUser: User = {
        id: profile.id,
        username: profile.username,
        role: profile.role,
        full_name: profile.full_name,
        is_active: profile.is_active,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      };
      setUser(appUser);
      localStorage.setItem('user', JSON.stringify(appUser));
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
