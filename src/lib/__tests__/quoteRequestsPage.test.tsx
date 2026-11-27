// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import QuoteRequestsPage from '@/pages/QuoteRequestsPage';
import { canHandleQuoteRequests, listQuoteRequests, QUOTE_LIST_SIZE, updateQuoteRequest } from '@/lib/quoteRequests';
import type { QuoteRequestRow } from '@/lib/quoteRequests';
import { useNoticeStore } from '@/stores/noticeStore';
import type { User } from '@/types/user';

vi.mock('@/lib/quoteRequests', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/quoteRequests')>(),
  canHandleQuoteRequests: vi.fn(), listQuoteRequests: vi.fn(), updateQuoteRequest: vi.fn(),
}));

Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } },
  close: { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } },
});

const user: User = { id: 'sales', name: '销售', email: 'sales@example.invalid', createdAt: 0, role: 'sales' };
const pending: QuoteRequestRow = {
  id: 'pending', receipt: 'RFQ-PENDING', status: 'pending', assignee_id: null, follow_up_note: '',
  submitted_at: '2026-11-27T00:01:00Z', updated_at: '2026-11-27T00:01:00Z',
  payload: { name: '客户', company: '', phone: '', email: 'customer@example.invalid', demand: '需要线束', kind: '', files: [] },
};
const mine: QuoteRequestRow = { ...pending, id: 'mine', receipt: 'RFQ-MINE', status: 'following', assignee_id: user.id, follow_up_note: '已联系' };
const other: QuoteRequestRow = { ...mine, id: 'other', receipt: 'RFQ-OTHER', assignee_id: 'another-sales' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(canHandleQuoteRequests).mockResolvedValue(true);
  vi.mocked(listQuoteRequests).mockResolvedValue({ rows: [pending, mine, other], count: 3 });
});

afterEach(() => {
  cleanup();
  useNoticeStore.getState().clear();
  vi.restoreAllMocks();
});

const listItem = (receipt: string) => within(screen.getByRole('region', { name: '询价列表' })).getByRole('button', { name: new RegExp(receipt) });
const button = (name: string) => screen.getByRole('button', { name });
const details = () => screen.getByRole('region', { name: '询价详情' });

it('shows ownership in the list and queries the entire filtered set from the first page', async () => {
  render(<QuoteRequestsPage user={user} />);
  await screen.findByText(pending.receipt);
  expect(listItem(pending.receipt).textContent).toContain('待认领');
  expect(listItem(mine.receipt).textContent).toContain('我负责');
  expect(listItem(other.receipt).textContent).toContain('其他专员负责');

  vi.mocked(listQuoteRequests).mockResolvedValueOnce({ rows: [pending], count: 1 });
  fireEvent.click(button('待认领'));
  await screen.findByText('共 1 条询价');
  expect(screen.queryByText(mine.receipt)).toBeNull();
  expect(listQuoteRequests).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'unassigned', page: 0 }));

  vi.mocked(listQuoteRequests).mockResolvedValueOnce({ rows: [mine], count: 1 });
  fireEvent.click(button('我负责'));
  await screen.findByText(mine.receipt);
  expect(listQuoteRequests).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'mine', userId: user.id, page: 0 }));
  fireEvent.change(screen.getByRole('combobox', { name: '状态' }), { target: { value: 'following' } });
  await waitFor(() => expect(listQuoteRequests).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'mine', status: 'following' })));
});

it('protects a draft on refresh and switching, and keeps it on save failure', async () => {
  render(<QuoteRequestsPage user={user} />);
  await screen.findByText(mine.receipt);
  fireEvent.click(listItem(mine.receipt));
  const note = within(details()).getByRole('textbox', { name: '跟进与报价记录' }) as HTMLTextAreaElement;
  fireEvent.change(note, { target: { value: '待保存的备注' } });
  const beforeUnload = new Event('beforeunload', { cancelable: true });
  expect(window.dispatchEvent(beforeUnload)).toBe(false);
  for (const target of [button('刷新'), listItem(pending.receipt), button('关闭询价详情')]) {
    fireEvent.click(target);
    const confirmation = screen.getByRole('alertdialog');
    expect(confirmation.textContent).toContain('尚未保存');
    fireEvent.click(within(confirmation).getByRole('button', { name: '取消' }));
  }
  expect(listQuoteRequests).toHaveBeenCalledTimes(1);
  expect(note.value).toBe('待保存的备注');
  expect(details().textContent).toContain(mine.receipt);

  vi.mocked(updateQuoteRequest).mockRejectedValueOnce(new Error('保存询价失败，请重试。'));
  fireEvent.click(button('保存记录'));
  await within(details()).findByRole('alert');
  expect(note.value).toBe('待保存的备注');
  expect(useNoticeStore.getState().notices.at(-1)?.tone).toBe('danger');

  vi.mocked(updateQuoteRequest).mockResolvedValueOnce({ ...mine, updated_at: '2026-11-27T00:02:00Z', follow_up_note: note.value });
  await act(async () => { fireEvent.click(button('保存记录')); });
  expect(useNoticeStore.getState().notices.at(-1)?.title).toBe('记录已保存');
  expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true);
  fireEvent.click(button('刷新'));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.queryByRole('region', { name: '询价详情' })).toBeNull();
});

it('returns to the last available page when its only unassigned request is claimed', async () => {
  const previous = { ...pending, id: 'previous', receipt: 'RFQ-PREVIOUS' };
  const claimed = { ...pending, status: 'following' as const, assignee_id: user.id, updated_at: '2026-11-27T00:02:00Z' };
  render(<QuoteRequestsPage user={user} />);
  await screen.findByText(mine.receipt);

  vi.mocked(listQuoteRequests).mockResolvedValueOnce({ rows: [previous], count: QUOTE_LIST_SIZE + 1 });
  fireEvent.click(button('待认领'));
  await screen.findByText(previous.receipt);
  vi.mocked(listQuoteRequests).mockResolvedValueOnce({ rows: [pending], count: QUOTE_LIST_SIZE + 1 });
  fireEvent.click(button('下一页'));
  await screen.findByText(pending.receipt);

  vi.mocked(updateQuoteRequest).mockResolvedValueOnce(claimed);
  vi.mocked(listQuoteRequests).mockResolvedValueOnce({ rows: [previous], count: QUOTE_LIST_SIZE });
  fireEvent.click(listItem(pending.receipt));
  fireEvent.click(button('认领询价'));
  await screen.findByText(previous.receipt);
  expect(useNoticeStore.getState().notices.at(-1)?.title).toBe('询价已认领');
  expect(listQuoteRequests).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'unassigned', page: 0 }));
  expect(within(screen.getByRole('region', { name: '询价列表' })).queryByText(pending.receipt)).toBeNull();
  expect(details().textContent).toContain('跟进中 · 我负责');
});

it('marks a quote and confirms before closing with the current draft', async () => {
  const quoted = { ...mine, status: 'quoted' as const, updated_at: '2026-11-27T00:02:00Z' };
  vi.mocked(updateQuoteRequest).mockResolvedValueOnce(quoted)
    .mockResolvedValueOnce({ ...quoted, status: 'closed', follow_up_note: '报价后客户取消' });
  render(<QuoteRequestsPage user={user} />);
  await screen.findByText(mine.receipt);
  fireEvent.click(listItem(mine.receipt));
  await act(async () => { fireEvent.click(button('标记已报价')); });
  expect(useNoticeStore.getState().notices.at(-1)?.title).toBe('已标记为已报价');
  expect(details().textContent).toContain('已报价');

  const note = within(details()).getByRole('textbox', { name: '跟进与报价记录' }) as HTMLTextAreaElement;
  fireEvent.change(note, { target: { value: '报价后客户取消' } });
  fireEvent.click(button('关闭询价'));
  const confirmation = screen.getByRole('alertdialog');
  expect(confirmation.textContent).toContain('保存当前跟进记录');
  fireEvent.click(within(confirmation).getByRole('button', { name: '取消' }));
  expect(updateQuoteRequest).toHaveBeenCalledTimes(1);
  expect(note.value).toBe('报价后客户取消');

  fireEvent.click(button('关闭询价'));
  await act(async () => {
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '确认关闭' }));
  });
  expect(useNoticeStore.getState().notices.at(-1)?.title).toBe('询价已关闭');
  expect(updateQuoteRequest).toHaveBeenLastCalledWith(quoted, 'closed', '报价后客户取消');
  expect(details().textContent).toContain('已关闭');
});
