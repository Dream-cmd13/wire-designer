import { create } from 'zustand';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { clearCatalogImageCache } from '@/lib/catalogImageUrl';
import { clearDwgCache } from '@/lib/dwg/dwgCache';
import { clearStorageSignedUrlCache } from '@/lib/storageSignedUrl';
import type { User } from '@/types/user';
import { usePriceStore } from './priceStore';
import { useFinishedHarnessStore } from './finishedHarnessStore';
import type { AppRole } from '@/lib/permissions';

interface UserState {
  currentUser: User | null;
  authReady: boolean;
  refreshRole: () => Promise<void>;
  initialize: () => () => void;
  signIn: (emailOrUsername: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const LOCAL_EMAIL_DOMAIN = '@local.app';

function clearSignedAssetCaches(): void {
  clearCatalogImageCache();
  clearDwgCache();
  if (supabase) {
    // 清掉成品图纸与 DWG 图纸的签名 URL 缓存
    clearStorageSignedUrlCache(supabase);
  }
}

function normalizeLoginEmail(emailOrUsername: string): string {
  const identifier = emailOrUsername.trim();
  return identifier.includes('@') ? identifier : `${identifier}${LOCAL_EMAIL_DOMAIN}`;
}

function toAppUser(user: SupabaseAuthUser, previousUser?: User | null): User {
  const displayName = typeof user.user_metadata.display_name === 'string'
    ? user.user_metadata.display_name.trim()
    : '';
  const email = user.email ?? '';

  return {
    id: user.id,
    name: displayName || email.split('@')[0] || '用户',
    email,
    createdAt: Date.parse(user.created_at) || Date.now(),
    mustChangePassword: user.app_metadata?.must_change_password === true || (previousUser?.id === user.id && previousUser.mustChangePassword === true),
    passwordCheckComplete: previousUser?.id === user.id && (previousUser.passwordCheckComplete === true || Boolean(previousUser.role)),
    role: previousUser?.id === user.id ? previousUser.role : undefined,
  };
}

let roleEpoch = 0;
export const useUserStore = create<UserState>((set, get) => ({
  currentUser: null,
  authReady: false,

  refreshRole: async () => {
    const user = get().currentUser;
    if (!user || !supabase) return;
    const epoch = ++roleEpoch;
    const { data, error } = await Promise.resolve(supabase.rpc('current_app_role')).catch(() => ({ data: null, error: new Error('Role unavailable') }));
    if (epoch !== roleEpoch || get().currentUser?.id !== user.id) return;
    const role: AppRole | undefined = !error && ['sales', 'engineer', 'admin'].includes(data) ? data : undefined;
    const confirmed = !error && (Boolean(role) || data === 'password_required');
    const mustChangePassword = confirmed ? data === 'password_required' : user.mustChangePassword;
    if (get().currentUser?.role !== role || mustChangePassword !== user.mustChangePassword) {
      clearSignedAssetCaches();
      usePriceStore.getState().reset();
      useFinishedHarnessStore.getState().reset();
    }
    set({ currentUser: { ...user, role, mustChangePassword, passwordCheckComplete: confirmed || user.passwordCheckComplete } });
  },

  initialize: () => {
    if (!supabase) {
      set({ currentUser: null, authReady: true });
      return () => {};
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      roleEpoch++;
      const previousUser = get().currentUser;
      if (!session || previousUser?.id !== session.user.id) {
        usePriceStore.getState().reset();
        useFinishedHarnessStore.getState().reset();
        clearSignedAssetCaches();
      }
      set({ currentUser: session?.user ? toAppUser(session.user, previousUser) : null, authReady: true });
      // Leave the auth callback before querying PostgREST.
      setTimeout(() => { void get().refreshRole(); }, 0);
    });

    const sessionEpoch = roleEpoch;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (sessionEpoch !== roleEpoch) return;
      if (error) {
        clearSignedAssetCaches();
        set({ currentUser: null, authReady: true });
        return;
      }

      if (!data.session) {
        clearSignedAssetCaches();
      }
      set({ currentUser: data.session?.user ? toAppUser(data.session.user, get().currentUser) : null, authReady: true });
      void get().refreshRole();
    }).catch(() => {
      if (sessionEpoch !== roleEpoch) return;
      clearSignedAssetCaches();
      usePriceStore.getState().reset();
      useFinishedHarnessStore.getState().reset();
      set({ currentUser: null, authReady: true });
    });

    const timer = setInterval(() => { void get().refreshRole(); }, 30000);
    const refresh = () => { void get().refreshRole(); };
    window.addEventListener('focus', refresh);
    return () => { roleEpoch++; clearInterval(timer); window.removeEventListener('focus', refresh); subscription.unsubscribe(); };
  },

  signIn: async (emailOrUsername, password) => {
    if (!supabase) {
      throw new Error('Supabase 尚未配置，无法登录。');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeLoginEmail(emailOrUsername),
      password,
    });
    if (error) throw error;

    set({ currentUser: data.user ? toAppUser(data.user, get().currentUser) : null, authReady: true });
    await get().refreshRole();
  },

  signOut: async () => {
    roleEpoch++;
    usePriceStore.getState().reset();
    useFinishedHarnessStore.getState().reset();
    if (!supabase) {
      clearSignedAssetCaches();
      set({ currentUser: null, authReady: true });
      return;
    }

    const { error } = await supabase.auth.signOut({ scope: 'local' });
    clearSignedAssetCaches();
    if (error) throw error;

    set({ currentUser: null, authReady: true });
  },
}));
