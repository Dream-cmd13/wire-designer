import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerQuote } from '@/lib/useServerQuote';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';

const harness = vi.hoisted(() => ({
  index: 0, states: [] as unknown[], refs: [] as { current: unknown }[],
  deps: undefined as unknown[] | undefined, cleanup: undefined as (() => void) | undefined,
  effect: undefined as (() => (() => void) | undefined) | undefined,
  user: { id: 'sales-1', role: 'sales' }, invoke: vi.fn(),
}));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = harness.index++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => {
      harness.states[index] = typeof value === 'function' ? value(harness.states[index]) : value;
    }];
  },
  useRef: (initial: unknown) => {
    const index = harness.index++;
    return harness.refs[index] ??= { current: initial };
  },
  useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
    if (!harness.deps || deps.some((value, index) => value !== harness.deps?.[index])) {
      harness.cleanup?.();
      harness.deps = deps;
      harness.effect = effect;
    }
  },
}));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { functions: { invoke: harness.invoke } } }));
vi.mock('@/stores/userStore', () => ({ useUserStore: (selector: (state: unknown) => unknown) => selector({ currentUser: harness.user }) }));

const ready = (unitPrice: string) => ({ data: { status: 'ready', price: { unitPrice, totalPrice: unitPrice }, settingsVersion: 2, calculatedAt: '2026-10-12T01:02:03Z' }, error: null });
function QuoteHook(config: ReturnType<typeof createFallbackConfig>) {
  return useServerQuote(config);
}
function renderQuote(config: ReturnType<typeof createFallbackConfig>) {
  harness.index = 0;
  const result = QuoteHook(config);
  if (harness.effect) {
    harness.cleanup = harness.effect();
    harness.effect = undefined;
  }
  return result;
}
beforeEach(() => {
  vi.useFakeTimers();
  harness.index = 0; harness.states = []; harness.refs = []; harness.deps = undefined;
  harness.cleanup = undefined; harness.effect = undefined;
  harness.user = { id: 'sales-1', role: 'sales' };
  harness.invoke.mockReset();
});
afterEach(() => { harness.cleanup?.(); vi.useRealTimers(); });

describe('quotation refresh', () => {
  it('hides old results during refresh, preserves comparison through failure, and compares only the same configuration', async () => {
    const config = createFallbackConfig();
    harness.invoke.mockResolvedValueOnce(ready('10.00'));
    expect(renderQuote(config).loading).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    const first = renderQuote(config);
    expect(first.result?.status).toBe('ready');
    first.retry();
    harness.invoke.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    expect(renderQuote(config).result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(300);
    const failed = renderQuote(config);
    expect(failed.error).toBeTruthy();
    failed.retry();
    harness.invoke.mockResolvedValueOnce(ready('12.00'));
    renderQuote(config);
    await vi.advanceTimersByTimeAsync(300);
    const refreshed = renderQuote(config);
    expect(refreshed.previousUnitPrice).toBe('10.00');
    expect(refreshed.result).toMatchObject({ price: { unitPrice: '12.00' }, calculatedAt: '2026-10-12T01:02:03Z', settingsVersion: 2 });
    refreshed.retry();
    harness.invoke.mockResolvedValueOnce(ready('12'));
    renderQuote(config);
    await vi.advanceTimersByTimeAsync(300);
    expect(renderQuote(config).previousUnitPrice).toBeUndefined();
    const other = { ...config, name: '另一配置' };
    harness.invoke.mockResolvedValueOnce(ready('20.00'));
    renderQuote(other);
    await vi.advanceTimersByTimeAsync(300);
    expect(renderQuote(other).previousUnitPrice).toBeUndefined();
    harness.invoke.mockResolvedValueOnce(ready('30.00'));
    renderQuote(config);
    await vi.advanceTimersByTimeAsync(300);
    expect(renderQuote(config).previousUnitPrice).toBeUndefined();
  });

  it('ignores a late response from the previous configuration', async () => {
    const config = createFallbackConfig();
    let resolveOld!: (value: ReturnType<typeof ready>) => void;
    harness.invoke.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    renderQuote(config);
    await vi.advanceTimersByTimeAsync(300);
    const other = { ...config, name: '另一配置' };
    harness.invoke.mockResolvedValueOnce(ready('20.00'));
    renderQuote(other);
    await vi.advanceTimersByTimeAsync(300);
    resolveOld(ready('10.00'));
    await Promise.resolve();
    expect(renderQuote(other).result).toMatchObject({ price: { unitPrice: '20.00' } });
  });
});
