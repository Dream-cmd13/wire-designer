// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingWorkbenchPage } from '@/pages/DrawingWorkbenchPage';
import { createBlankDrawingDocument } from '@/lib/drawingDocument';
import { readWorkspaceDraft } from '@/lib/workspaceDraftCache';
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

  it('keeps anonymous edits under the guest owner and resumes the signed-in drawing before editing', async () => {
    await hydrateDrawingStore('engineer');
    const savedDrawing = useDrawingStore.getState().createDocument('工程师图纸');
    await useDrawingStore.getState().saveActiveDocument();
    resetDrawingStore();

    render(<DrawingWorkbenchPage />);
    await screen.findByRole('toolbar', { name: '绘图工具栏' });
    const guestId = useDrawingStore.getState().activeDocumentId!;
    fireEvent.click(screen.getByTitle('添加文字'));

    act(() => useUserStore.setState({
      currentUser: { id: 'engineer', name: '工程师', email: 'engineer@test', createdAt: 1, role: 'engineer' },
    }));
    await screen.findByRole('toolbar', { name: '绘图工具栏' });
    expect(useDrawingStore.getState().activeDocumentId).toBe(savedDrawing.id);
    fireEvent.click(screen.getByTitle('添加文字'));
    await act(async () => fireEvent.click(screen.getByTitle('保存')));

    const anonymous = readWorkspaceDraft('anonymous', 'drawing', guestId)?.document;
    const signedIn = readWorkspaceDraft('engineer', 'drawing', savedDrawing.id)?.document;
    expect(anonymous).toMatchObject({ objects: expect.arrayContaining([expect.objectContaining({ kind: 'text' })]) });
    expect(signedIn).toMatchObject({ objects: expect.arrayContaining([expect.objectContaining({ kind: 'text' })]) });
    expect(readWorkspaceDraft('engineer', 'drawing', guestId)).toBeNull();
    expect(readWorkspaceDraft('anonymous', 'drawing', savedDrawing.id)).toBeNull();
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
