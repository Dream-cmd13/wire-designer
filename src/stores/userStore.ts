import { create } from 'zustand';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@/types/user';

interface UserState {
  currentUser: User | null;
  authReady: boolean;
  initialize: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

function toAppUser(user: SupabaseAuthUser): User {
  const displayName = typeof user.user_metadata.display_name === 'string'
    ? user.user_metadata.display_name.trim()
    : '';
  const email = user.email ?? '';

  return {
    id: user.id,
    name: displayName || email.split('@')[0] || '用户',
    email,
    createdAt: Date.parse(user.created_at) || Date.now(),
  };
}

export const useUserStore = create<UserState>((set) => ({
  currentUser: null,
  authReady: false,

  initialize: () => {
    try {
      localStorage.removeItem('harness-user-passwords');
    } catch {
      // Ignore unavailable browser storage.
    }

    if (!supabase) {
      set({ currentUser: null, authReady: true });
      return () => {};
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ currentUser: session?.user ? toAppUser(session.user) : null, authReady: true });
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        set({ currentUser: null, authReady: true });
        return;
      }

      set({ currentUser: data.session?.user ? toAppUser(data.session.user) : null, authReady: true });
    });

    return () => subscription.unsubscribe();
  },

  signIn: async (email, password) => {
    if (!supabase) {
      throw new Error('Supabase 尚未配置，无法登录。');
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    set({ currentUser: data.user ? toAppUser(data.user) : null, authReady: true });
  },

  signOut: async () => {
    if (!supabase) {
      set({ currentUser: null, authReady: true });
      return;
    }

    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;

    set({ currentUser: null, authReady: true });
  },
}));
