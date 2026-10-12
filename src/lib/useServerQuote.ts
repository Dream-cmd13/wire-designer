import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import type { HarnessConfig } from '@/types/harness';
import type { QuoteResult } from './pricing';
import { useUserStore } from '@/stores/userStore';

export function useServerQuote(config: HarnessConfig | null) {
  const user = useUserStore(s => s.currentUser);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([user?.id, user?.role, config, attempt]);
  const [response, setResponse] = useState<{ key: string; result?: QuoteResult; error?: string } | null>(null);
  const enabled = Boolean(user?.role && config);
  useEffect(() => {
    if (!enabled || !supabase) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void supabase!.functions.invoke('quote', { body: { config: JSON.parse(key)[2] } }).then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || !['ready', 'blocked', 'manual'].includes(data.status)) {
          setResponse({ key, error: '服务端报价失败，请重试或联系工程师。' });
        } else {
          setResponse({ key, result: data as QuoteResult });
        }
      }).catch(() => {
        if (!cancelled) setResponse({ key, error: '服务端报价失败，请重试。' });
      });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, enabled]);
  const current = response?.key === key ? response : null;
  return {
    result: enabled ? current?.result : undefined,
    loading: enabled && Boolean(supabase) && !current,
    error: user && !user.role ? '报价权限尚未就绪，请稍后重试。' : enabled ? (supabase ? current?.error : 'Supabase 尚未配置') : undefined,
    retry: () => setAttempt(n => n + 1),
  };
}
