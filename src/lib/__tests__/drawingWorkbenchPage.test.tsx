// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingWorkbenchPage } from '@/pages/DrawingWorkbenchPage';
import { createBlankDrawingDocument } from '@/lib/drawingDocument';
import { hydrateDrawingStore, resetDrawingStore, useDrawingStore } from '@/stores/drawingStore';
import { useUserStore } from '@/stores/userStore';

vi.mock('@/components/drawings/standalone/StandaloneDrawingCanvas', () => ({ StandaloneDrawingCanvas: () => null }));

describe('local drawing workbench entry and import', () => {
  beforeEach(() => {
    localStorage.clear();
    resetDrawingStore();
    useUserStore.setState({ currentUser: null });
  });

  afterEach(() => { cleanup(); resetDrawingStore(); });

  it('opens an unused canvas without a discard prompt', async () => {
    render(<DrawingWorkbenchPage />);
    await screen.findByRole('toolbar', { name: '绘图工具栏' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('已保存到本地')).toBeTruthy();
  });

  it('does not complete a slow import after leaving the page and resetting the account', async () => {
    const document = createBlankDrawingDocument('此前选择的文件');
    let finishRead!: (text: string) => void;
    const reading = new Promise<string>((resolve) => { finishRead = resolve; });
    const view = render(<DrawingWorkbenchPage />);
    await screen.findByRole('toolbar', { name: '绘图工具栏' });
    fireEvent.change(screen.getByLabelText('导入图纸副本', { selector: 'input' }), { target: { files: [{ text: () => reading }] } });
    view.unmount();
    await hydrateDrawingStore('another-user');
    await act(async () => { finishRead(JSON.stringify({ document })); await reading; });
    expect(useDrawingStore.getState().documents).toEqual({});
    expect(localStorage.length).toBe(0);
  });
});
