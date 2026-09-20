import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAILURE_NOTICE_DURATION_MS,
  SUCCESS_NOTICE_DURATION_MS,
  notify,
  useNoticeStore,
} from '@/stores/noticeStore';

describe('notice store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNoticeStore.getState().clear();
  });

  afterEach(() => {
    useNoticeStore.getState().clear();
    vi.useRealTimers();
  });

  it('auto closes success notices after about 3 seconds', () => {
    notify({ tone: 'success', message: '已保存。' });

    expect(useNoticeStore.getState().notices).toHaveLength(1);
    vi.advanceTimersByTime(SUCCESS_NOTICE_DURATION_MS - 1);
    expect(useNoticeStore.getState().notices).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useNoticeStore.getState().notices).toHaveLength(0);
  });

  it('keeps failure notices long enough to read and retry', () => {
    const retry = vi.fn();
    notify({
      tone: 'danger',
      message: '项目保存失败，已取消切换。',
      action: { label: '重试保存', onClick: retry },
    });

    vi.advanceTimersByTime(SUCCESS_NOTICE_DURATION_MS);
    const notice = useNoticeStore.getState().notices[0];
    expect(notice).toBeTruthy();
    expect(notice?.durationMs).toBe(FAILURE_NOTICE_DURATION_MS);
    expect(notice?.action?.label).toBe('重试保存');
    notice?.action?.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('keeps persistent notices visible until the user closes them', () => {
    notify({ tone: 'danger', message: '需要用户确认。', durationMs: null });

    vi.advanceTimersByTime(60_000);
    expect(useNoticeStore.getState().notices).toHaveLength(1);

    useNoticeStore.getState().dismiss(useNoticeStore.getState().notices[0]!.id);
    expect(useNoticeStore.getState().notices).toHaveLength(0);
  });

  it('deduplicates notices with the same key instead of stacking duplicates', () => {
    const firstId = notify({ tone: 'danger', message: '保存失败。', dedupeKey: 'save' });
    vi.advanceTimersByTime(FAILURE_NOTICE_DURATION_MS - 1000);
    const secondId = notify({ tone: 'danger', message: '仍然保存失败。', dedupeKey: 'save' });

    expect(secondId).toBe(firstId);
    expect(useNoticeStore.getState().notices).toHaveLength(1);
    expect(useNoticeStore.getState().notices[0]?.message).toBe('仍然保存失败。');

    vi.advanceTimersByTime(FAILURE_NOTICE_DURATION_MS);
    expect(useNoticeStore.getState().notices).toHaveLength(0);
  });
});
