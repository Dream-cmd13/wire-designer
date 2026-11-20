// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ModelViewerPage } from '@/pages/ModelViewerPage';
import { useUserStore } from '@/stores/userStore';

const mocks = vi.hoisted(() => ({ parse: vi.fn(), save: vi.fn(), list: vi.fn(), get: vi.fn(), download: vi.fn(), create: vi.fn(), pdf: vi.fn(), preview: vi.fn(), draw: vi.fn(), downloadBlob: vi.fn() }));
vi.mock('@/lib/models/modelThreeViewExport', async (actual) => ({
  ...await actual<typeof import('@/lib/models/modelThreeViewExport')>(),
  createModelThreeViewRenderer: mocks.preview,
}));
vi.mock('@/lib/drawingExport', () => ({ downloadBlob: mocks.downloadBlob }));
vi.mock('@/lib/models/modelParser', () => ({ parseModel: mocks.parse, validateModelFile: (f: File) => {
  if (!/\.(step|stp|stl)$/i.test(f.name)) throw new Error('请选择 STEP / STP / STL'); return /\.stl$/i.test(f.name) ? 'stl' : 'step';
} }));
vi.mock('@/repositories/modelRepository', () => ({ modelRepository: { configured: true, save: mocks.save, list: mocks.list, get: mocks.get, download: mocks.download }, createModelSaveSession: mocks.create }));
vi.mock('@/components/models/ModelViewer', () => ({ ModelViewer: ({ model, status }: { model: unknown; status: import('react').ReactNode }) => <><div data-testid="mesh">{model ? 'mesh ready' : 'no mesh'}</div>{status}</> }));
const model = { boundsMm: { min: [0,0,0], max: [1,2,3] }, triangleCount: 12, meshes: [] };
const id = '00000000-0000-4000-8000-000000000101';
const record = { id, owner_id: 'u1', original_name: 'a.stp', source_unit: 'mm', format: 'step', status: 'ready' };
// jsdom has the element but not the browser's modal behavior.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } },
  close: { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } },
});
function pick(name = 'part.stp') { fireEvent.change(screen.getByLabelText('选择模型文件'), { target: { files: [new File(['bytes'], name)] } }); }
beforeEach(() => {
  window.history.replaceState(null, '', '/model-viewer');
  useUserStore.setState({ currentUser: { id: 'u1', name: 'test', email: 'test@test', createdAt: 1, role: 'engineer' } });
  mocks.parse.mockResolvedValue(model); mocks.list.mockResolvedValue([]); mocks.get.mockResolvedValue(record);
  mocks.download.mockResolvedValue(new File(['bytes'], 'a.stp')); mocks.create.mockResolvedValue({ ...record, status: 'uploading' }); mocks.save.mockResolvedValue(record);
  mocks.preview.mockReturnValue({ draw: mocks.draw, dispose: vi.fn(), buildPdf: mocks.pdf, isContextLost: () => false });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function exportButton() { return screen.getByRole('button', { name: '导出三视图 PDF' }); }
function confirmExport() { return screen.getByRole('button', { name: '下载 PDF' }); }
async function readyConfirm() {
  const button = confirmExport();
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  return button;
}
const pdf = new Blob(['test'], { type: 'application/pdf' });

describe('model PDF export', () => {
  it('blocks download until the selected front has drawn successfully, and can retry a failed preview', async () => {
    mocks.draw.mockImplementationOnce(() => { throw new Error('WebGL unavailable'); });
    render(<ModelViewerPage />); pick(); await screen.findByText('预览就绪');
    fireEvent.click(exportButton());
    expect(confirmExport().hasAttribute('disabled')).toBe(true);
    await screen.findByText('前视预览未能绘制');
    fireEvent.click(confirmExport());
    expect(mocks.pdf).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '重试前视预览' }));
    await readyConfirm();
    fireEvent.change(screen.getByLabelText('前视方向'), { target: { value: '+Z' } });
    expect(confirmExport().hasAttribute('disabled')).toBe(true);
    await readyConfirm();
    expect(mocks.draw).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement), '+Z');
  });
  it('requires a ready preview and does not offer export during a quality change', async () => {
    render(<ModelViewerPage />);
    expect(screen.queryByRole('button', { name: '导出三视图 PDF' })).toBeNull();
    pick();
    expect(screen.queryByRole('button', { name: '导出三视图 PDF' })).toBeNull();
    await screen.findByText('包围盒尺寸（网格近似）');
    expect(exportButton().hasAttribute('disabled')).toBe(false);
    fireEvent.change(screen.getByLabelText('显示质量'), { target: { value: 'fine' } });
    expect(exportButton().hasAttribute('disabled')).toBe(true);
    await screen.findByText('精细已生效');
    expect(exportButton().hasAttribute('disabled')).toBe(false);
  });

  it('exports the current parsed model once, with the selected front, without saving', async () => {
    let finish!: (blob: Blob) => void;
    mocks.pdf.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<ModelViewerPage />); pick('part.stl'); await screen.findByText('预览就绪');
    fireEvent.click(exportButton());
    expect((screen.getByLabelText('前视方向') as HTMLSelectElement).value).toBe('-Y');
    fireEvent.change(screen.getByLabelText('前视方向'), { target: { value: '+Z' } });
    const button = await readyConfirm();
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.pdf).toHaveBeenCalledExactlyOnceWith('part.stl', '+Z', expect.any(AbortSignal));
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith(model);
    await act(async () => finish(pdf));
    expect(mocks.downloadBlob).toHaveBeenCalledExactlyOnceWith(pdf, 'part_三视图.pdf');
    expect(mocks.parse).toHaveBeenCalledOnce();
    expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each(['取消', '换模型', '退出'])('discards late results after %s', async (reason) => {
    let finish!: (blob: Blob) => void;
    mocks.pdf.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<ModelViewerPage />); pick(); await screen.findByText('预览就绪');
    fireEvent.click(exportButton()); fireEvent.click(await readyConfirm());
    const signal = mocks.pdf.mock.calls[0][2] as AbortSignal;
    if (reason === '取消') fireEvent.click(screen.getByRole('button', { name: '取消' }));
    if (reason === '换模型') pick('next.stl');
    if (reason === '退出') act(() => useUserStore.setState({ currentUser: null }));
    await act(async () => finish(pdf));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
  });

  it('does not download when dismissing confirmation, and can retry an export failure', async () => {
    mocks.pdf.mockRejectedValueOnce(new Error('编码失败')).mockResolvedValueOnce(pdf);
    render(<ModelViewerPage />); pick(); await screen.findByText('预览就绪');
    fireEvent.click(exportButton()); fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(mocks.pdf).not.toHaveBeenCalled();
    fireEvent.click(exportButton()); fireEvent.click(await readyConfirm());
    await screen.findByText(/编码失败/);
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
    fireEvent.click(confirmExport());
    await waitFor(() => expect(mocks.downloadBlob).toHaveBeenCalledOnce());
    expect(mocks.preview).toHaveBeenCalledTimes(1);
  });
});

describe('model page sessions', () => {
  it('disables recovery while a file is loading and allows recovery after parsing finishes', async () => {
    mocks.list.mockResolvedValue([{ ...record, status: 'uploading' }]);
    let resolveParse: (value: typeof model) => void = () => {};
    mocks.parse.mockImplementationOnce(() => new Promise((resolve) => { resolveParse = resolve; }));
    render(<ModelViewerPage />); const recovery = await screen.findByRole('button', { name: '恢复保存' });
    pick();
    expect(recovery.hasAttribute('disabled')).toBe(true);
    fireEvent.click(recovery); expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => resolveParse(model));
    expect(recovery.hasAttribute('disabled')).toBe(false);
    fireEvent.click(recovery); await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  });
  it('changes saved STEP quality without changing cloud identity or starting any persistence', async () => {
    window.history.replaceState(null, '', `/model-viewer?modelId=${id}`);
    render(<ModelViewerPage />); await screen.findByText('包围盒尺寸（网格近似）');
    fireEvent.change(screen.getByLabelText('显示质量'), { target: { value: 'fine' } });
    await waitFor(() => expect(mocks.parse).toHaveBeenLastCalledWith(expect.any(File), expect.objectContaining({ quality: 'fine' })));
    await screen.findByText('精细已生效');
    expect(window.location.search).toBe(`?modelId=${id}`);
    expect(screen.getByText('已保存', { exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存到云端' }).hasAttribute('disabled')).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(['取消', '失败', '超预算'])('keeps the mesh and applied quality after quality task %s', async (outcome) => {
    render(<ModelViewerPage />); pick(); await screen.findByText('包围盒尺寸（网格近似）');
    let resolve: (value: typeof model) => void = () => {}; let reject: (error: Error) => void = () => {};
    mocks.parse.mockImplementationOnce(() => new Promise((a,b) => { resolve = a; reject = b; }));
    fireEvent.change(screen.getByLabelText('显示质量'), { target: { value: 'fine' } });
    expect(screen.getByTestId('mesh').textContent).toBe('mesh ready');
    expect(screen.getByRole('button', { name: '保存到云端' }).hasAttribute('disabled')).toBe(true);
    if (outcome === '取消') {
      fireEvent.click(screen.getByRole('button', { name: '取消质量生成' }));
      await act(async () => resolve({ ...model, triangleCount: 999 }));
    } else await act(async () => reject(new Error(outcome === '超预算' ? '三角形上限' : 'Worker 失败')));
    expect((screen.getByLabelText('显示质量') as HTMLSelectElement).value).toBe('standard');
    expect(screen.getByTestId('mesh').textContent).toBe('mesh ready');
    expect(screen.queryByText(/999 个三角形/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '保存到云端' }));
    await screen.findByText('已保存', { exact: true });
    expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.save).toHaveBeenCalledOnce();
  });
  it('isolates rapid quality switches, a new file and logout from late results', async () => {
    render(<ModelViewerPage />); pick(); await screen.findByText('包围盒尺寸（网格近似）');
    let resolveOld: (value: typeof model) => void = () => {};
    mocks.parse.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    fireEvent.change(screen.getByLabelText('显示质量'), { target: { value: 'fine' } });
    const signal = mocks.parse.mock.calls.at(-1)![1].signal;
    fireEvent.change(screen.getByLabelText('显示质量'), { target: { value: 'standard' } });
    expect(signal.aborted).toBe(true);
    pick('new.stp'); await screen.findByText('包围盒尺寸（网格近似）');
    await act(async () => resolveOld({ ...model, triangleCount: 999 }));
    expect(screen.queryByText(/999 个三角形/)).toBeNull();
    mocks.parse.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    fireEvent.change(screen.getByLabelText('显示质量'), { target: { value: 'fine' } });
    act(() => useUserStore.setState({ currentUser: null }));
    await act(async () => resolveOld(model)); expect(screen.queryByTestId('mesh')).toBeNull();
  });
  it('folds the cloud list without parsing or saving and hides quality selection for STL', async () => {
    render(<ModelViewerPage />); pick('part.stl'); await screen.findByText('包围盒尺寸（网格近似）');
    fireEvent.click(screen.getByRole('button', { name: '收起云端模型' }));
    expect(screen.queryByLabelText('显示质量')).toBeNull();
    expect(mocks.parse).toHaveBeenCalledOnce(); expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByTestId('mesh').textContent).toBe('mesh ready');
  });
  it('rejects multiple files and never auto uploads', async () => {
    render(<ModelViewerPage />);
    fireEvent.drop(screen.getByTestId('model-drop-zone'), { dataTransfer: { files: [new File(['a'],'a.stp'), new File(['b'],'b.stp')] } });
    expect(screen.getByRole('alert').textContent).toContain('一次请选择一个模型文件');
    pick(); await screen.findByText('包围盒尺寸（网格近似）');
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByTestId('mesh').textContent).toBe('mesh ready');
  });
  it('changes STL units explicitly, clears old modelId, and ignores stale parse results', async () => {
    render(<ModelViewerPage />);
    let resolveOld: (value: typeof model) => void = () => {};
    mocks.parse.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    pick('old.stl'); pick('new.stl');
    await screen.findByText('包围盒尺寸（网格近似）');
    await act(async () => resolveOld({ ...model, triangleCount: 999 }));
    expect(screen.queryByText(/999 个三角形/)).toBeNull();
    fireEvent.change(screen.getByLabelText('STL 用户指定单位'), { target: { value: 'inch' } });
    await waitFor(() => expect(mocks.parse).toHaveBeenLastCalledWith(expect.any(File), expect.objectContaining({ stlUnit: 'inch' })));
    expect(window.location.search).toBe('');
  });
  it('keeps preview after save failure, distinguishes finalize, and prevents duplicate saves', async () => {
    let rejectSave: (reason: Error) => void = () => {};
    mocks.save.mockImplementationOnce((_s, _f, _signal, phase) => { phase('finalizing'); return new Promise((_resolve, reject) => { rejectSave = reject; }); });
    render(<ModelViewerPage />); pick(); await screen.findByText('包围盒尺寸（网格近似）');
    fireEvent.click(screen.getByRole('button', { name: '保存到云端' }));
    await screen.findByText('原文件已上传，正在写入数据库确认…');
    fireEvent.click(screen.getByRole('button', { name: '保存到云端' })); expect(mocks.save).toHaveBeenCalledTimes(1);
    await act(async () => rejectSave(new Error('原文件已上传，但数据库确认失败')));
    expect(screen.getByTestId('mesh').textContent).toBe('mesh ready');
    expect(screen.getByText('保存失败，可重试')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重试保存' }));
    await screen.findByText('已保存'); expect(mocks.create).toHaveBeenCalledOnce();
    expect(window.location.search).toBe(`?modelId=${id}`);
  });
  it('clears the workspace on logout and does not accept late async results', async () => {
    render(<ModelViewerPage />); pick(); await screen.findByText('包围盒尺寸（网格近似）');
    act(() => { useUserStore.setState({ currentUser: null }); });
    expect(screen.queryByTestId('mesh')).toBeNull();
    expect(screen.getByText('请使用工程师或管理员账号登录。')).toBeTruthy();
  });
  it('opens deep links and cancels old downloads on modelId changes', async () => {
    window.history.replaceState(null, '', `/model-viewer?modelId=${id}`);
    render(<ModelViewerPage />);
    await screen.findByText('包围盒尺寸（网格近似）'); expect(mocks.get).toHaveBeenCalledWith(id, expect.any(AbortSignal));
    act(() => { window.history.pushState(null, '', '/model-viewer?modelId=00000000-0000-4000-8000-000000000102'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000102', expect.any(AbortSignal)));
  });
  it('keeps the saved cloud identity when parsing fails and is retried', async () => {
    window.history.replaceState(null, '', `/model-viewer?modelId=${id}`);
    mocks.parse.mockRejectedValueOnce(new Error('STEP 引擎暂时不可用'));
    render(<ModelViewerPage />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: '重试解析' }));
    await screen.findByText('包围盒尺寸（网格近似）');
    expect(screen.getByText('已保存', { exact: true })).toBeTruthy();
    const saveButton = screen.getByRole('button', { name: '保存到云端' });
    expect(saveButton.hasAttribute('disabled')).toBe(true);
    fireEvent.click(saveButton);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(window.location.search).toBe(`?modelId=${id}`);
  });
});
