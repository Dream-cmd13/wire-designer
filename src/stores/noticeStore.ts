import { create } from 'zustand';

export type NoticeTone = 'default' | 'success' | 'danger';

export interface NoticeAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

export interface NoticeInput {
  message: string;
  title?: string;
  tone?: NoticeTone;
  /** 自动关闭时间；传 null 表示需用户手动关闭。 */
  durationMs?: number | null;
  action?: NoticeAction;
  /** 相同 key 的提示不会重复堆叠，只更新内容并重新计时。 */
  dedupeKey?: string;
}

export interface Notice {
  id: number;
  message: string;
  title?: string;
  tone: NoticeTone;
  durationMs: number | null;
  action?: NoticeAction;
  dedupeKey?: string;
}

export const SUCCESS_NOTICE_DURATION_MS = 3000;
export const FAILURE_NOTICE_DURATION_MS = 8000;

const DEFAULT_DURATIONS: Record<NoticeTone, number> = {
  success: SUCCESS_NOTICE_DURATION_MS,
  danger: FAILURE_NOTICE_DURATION_MS,
  default: 5000,
};

interface NoticeState {
  notices: Notice[];
  push: (input: NoticeInput) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextNoticeId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function scheduleDismiss(id: number, durationMs: number | null) {
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.delete(id);
  if (durationMs === null) return;
  timers.set(id, setTimeout(() => {
    timers.delete(id);
    useNoticeStore.getState().dismiss(id);
  }, durationMs));
}

export const useNoticeStore = create<NoticeState>((set, get) => ({
  notices: [],

  push: (input) => {
    const tone = input.tone ?? 'default';
    const durationMs = input.durationMs === undefined ? DEFAULT_DURATIONS[tone] : input.durationMs;
    const existing = input.dedupeKey
      ? get().notices.find((notice) => notice.dedupeKey === input.dedupeKey)
      : undefined;

    if (existing) {
      set((state) => ({
        notices: state.notices.map((notice) => (
          notice.id === existing.id
            ? { ...notice, ...input, tone, durationMs }
            : notice
        )),
      }));
      scheduleDismiss(existing.id, durationMs);
      return existing.id;
    }

    const id = nextNoticeId++;
    set((state) => ({
      notices: [...state.notices, {
        id,
        message: input.message,
        title: input.title,
        tone,
        durationMs,
        action: input.action,
        dedupeKey: input.dedupeKey,
      }],
    }));
    scheduleDismiss(id, durationMs);
    return id;
  },

  dismiss: (id) => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    set((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) }));
  },

  clear: () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    set({ notices: [] });
  },
}));

export function notify(input: NoticeInput): number {
  return useNoticeStore.getState().push(input);
}

export function dismissNotice(id: number): void {
  useNoticeStore.getState().dismiss(id);
}
