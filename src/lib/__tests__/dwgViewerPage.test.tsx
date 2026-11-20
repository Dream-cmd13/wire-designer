// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DwgViewerPage } from '@/pages/DwgViewerPage';
import type { ParsedModel } from '@/lib/models/modelTypes';
import { useNoticeStore } from '@/stores/noticeStore';
import { useUserStore } from '@/stores/userStore';

const mocks = vi.hoisted(() => ({ parse: vi.fn(), list: vi.fn(), save: vi.fn(), download: vi.fn(), session: vi.fn() }));
vi.mock('@/lib/dwg/parseDwg', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/dwg/parseDwg')>(), parseDwg: mocks.parse,
}));
vi.mock('@/lib/dwg/renderDwg', () => ({ renderDwgToCanvas: vi.fn(), DEFAULT_FONT_FAMILY: 'sans-serif' }));
vi.mock('@/components/models/ModelViewer', () => ({ ModelViewer: ({ model }: { model: ParsedModel }) => (
  <div aria-label="三维模型画布">{model.boundsMm.max[0]} mm</div>
) }));
vi.mock('@/repositories/dwgRepository', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/repositories/dwgRepository')>(),
  dwgRepository: { configured: true, list: mocks.list, save: mocks.save, download: mocks.download },
  createDwgSaveSession: mocks.session,
}));

const owner = { id: 'owner', role: 'engineer' as const, name: 'test', email: 'test@example.com', createdAt: 1 };
const record = { id: 'drawing', original_name: 'cloud.dwg', owner_id: owner.id, status: 'ready' };
const drawing = { bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, units: 4, hiddenLayers: [], layers: [], entities: [], stats: { rendered: 1, text: 0, skipped: {} } };

// jsdom provides the element but not native modal behavior.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } },
  close: { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } },
});

function sample(name: string, read = async () => new ArrayBuffer(10)) {
  return Object.assign(new File(['AC1032 DWG'], name), { arrayBuffer: read });
}
function pick(...files: File[]) {
  fireEvent.change(screen.getByLabelText('选择 DWG 文件'), { target: { files } });
}
const saveButton = () => screen.getByRole('button', { name: '保存到云端' }) as HTMLButtonElement;

beforeEach(() => {
  useUserStore.setState({ currentUser: owner });
  mocks.parse.mockResolvedValue(drawing);
  mocks.list.mockResolvedValue([]);
  mocks.session.mockResolvedValue({ ...record, status: 'uploading' });
  mocks.save.mockResolvedValue(record);
  mocks.download.mockResolvedValue(sample(record.original_name));
  vi.stubGlobal('ResizeObserver', class {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) { this.callback = callback; }
    observe() { this.callback([{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry], this); }
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => { cleanup(); useNoticeStore.getState().clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetAllMocks(); window.history.replaceState(null, '', '/'); });

describe('DWG 3D preview', () => {
  it('generates only after confirming private cloud drawing dimensions and never saves the model', async () => {
    const cloud = { ...record, original_name: 'M12A04-07-093-1-10-500.dwg' };
    mocks.list.mockResolvedValue([cloud]);
    mocks.download.mockResolvedValue(sample(cloud.original_name));
    mocks.parse.mockResolvedValueOnce({ ...drawing, entities: [{ kind: 'text', isDimension: true, lines: ['*500±10'] }] });
    render(<DwgViewerPage />);
    await screen.findByRole('option', { name: cloud.original_name });
    fireEvent.change(screen.getByRole('combobox', { name: '云端图纸' }), { target: { value: cloud.id } });
    await screen.findByText('已保存');
    fireEvent.click(screen.getByRole('button', { name: '生成 3D 示意' }));
    await screen.findByRole('dialog');
    expect((screen.getByLabelText('标称长度 (mm)') as HTMLInputElement).value).toBe('500');
    expect((screen.getByLabelText('长度基准') as HTMLSelectElement).value).toBe('cable');
    expect((screen.getByLabelText('线缆外径 (mm)') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: '确认并生成' }));
    expect(screen.queryByLabelText('三维模型画布')).toBeNull();
    fireEvent.change(screen.getByLabelText('线缆外径 (mm)'), { target: { value: '4.5' } });
    fireEvent.click(screen.getByRole('button', { name: '确认并生成' }));
    expect(screen.queryByLabelText('三维模型画布')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: '我已确认图纸为单段、单端 M12 线缆' }));
    fireEvent.click(screen.getByRole('button', { name: '确认并生成' }));
    expect((await screen.findByLabelText('三维模型画布')).textContent).toBe('526 mm');
    expect(screen.getByText(/线缆长度 500 mm/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '修改参数' }));
    expect((screen.getByLabelText('线缆外径 (mm)') as HTMLInputElement).value).toBe('4.5');
    fireEvent.change(screen.getByLabelText('长度基准'), { target: { value: 'overall' } });
    fireEvent.click(screen.getByRole('button', { name: '确认并生成' }));
    expect((await screen.findByLabelText('三维模型画布')).textContent).toBe('500 mm');
    expect(screen.getByText(/总成端到端 500 mm/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭 3D 示意' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.save).not.toHaveBeenCalled();

    pick(sample('M12A04-08-085-1-10-500.dwg'));
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '生成 3D 示意' }));
    expect((await screen.findByLabelText('线缆外径 (mm)') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('连接器占位') as HTMLSelectElement).value).toBe('female');
    expect(screen.queryByLabelText('三维模型画布')).toBeNull();
  });

  it('does not offer generation for a drawing without a single supported M12 part number', async () => {
    render(<DwgViewerPage />);
    pick(sample('other.dwg'));
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '生成 3D 示意' }));
    expect(await screen.findByText('未识别到唯一的 M12 料号，无法生成 3D 示意。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '确认并生成' })).toBeNull();
  });

  it('shows when a manually entered diameter differs from the drawing and carries that note into the preview', async () => {
    mocks.parse.mockResolvedValueOnce({ ...drawing, entities: [
      { kind: 'text', isDimension: true, lines: ['*500±10'] },
      { kind: 'text', lines: ['OD:5.50±0.15'] },
    ] });
    render(<DwgViewerPage />);
    pick(sample('M12A05-07-068-3-10-500.dwg'));
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '生成 3D 示意' }));
    const diameter = await screen.findByLabelText<HTMLInputElement>('线缆外径 (mm)');
    expect(diameter.value).toBe('5.5');
    fireEvent.change(diameter, { target: { value: '20' } });
    expect(screen.getByText(/图纸标称外径 5.5 mm.*当前输入 20 mm/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: '我已确认图纸为单段、单端 M12 线缆' }));
    fireEvent.click(screen.getByRole('button', { name: '确认并生成' }));
    expect(await screen.findByText(/线缆外径 20 mm（手工输入，图纸标称 5.5 mm）/)).toBeTruthy();
  });

  it('blocks two connector ends even when they use the same part number', async () => {
    mocks.parse.mockResolvedValueOnce({ ...drawing, entities: [
      { kind: 'text', lines: ['P1 M12A04-07-068', 'P2 M12A04-07-068'] },
    ] });
    render(<DwgViewerPage />);
    pick(sample('M12A04-07-068-3-10-500.dwg'));
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '生成 3D 示意' }));
    expect(await screen.findByText('图纸标注了多个连接器端头，当前仅支持单端 M12 线缆。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '确认并生成' })).toBeNull();
  });
});

describe('DWG import and save', () => {
  it('uses the same validation for picker and canvas and does not auto-upload', async () => {
    render(<DwgViewerPage />);
    pick(sample('wrong.dxf'));
    expect(screen.getByRole('alert').textContent).toContain('.dwg');
    const drop = (files: File[]) => fireEvent.drop(screen.getByTestId('dwg-drop-zone'), { dataTransfer: { files, types: ['Files'] } });
    drop([sample('a.dwg'), sample('b.dwg')]);
    expect(screen.getByRole('alert').textContent).toContain('一个');
    expect(mocks.parse).not.toHaveBeenCalled();
    drop([sample('part.DWG')]);
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    expect(screen.getByText('仅本地预览')).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(useNoticeStore.getState().notices).toHaveLength(0);
  });

  it('ignores an older local file read that completes after a later selection', async () => {
    render(<DwgViewerPage />);
    let finish = () => {};
    pick(sample('old.dwg', () => new Promise((resolve) => { finish = () => resolve(new ArrayBuffer(15)); })));
    pick(sample('new.dwg'));
    await act(async () => finish());
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    expect(mocks.parse).toHaveBeenCalledOnce();
    expect(mocks.parse).toHaveBeenCalledWith(expect.any(ArrayBuffer), expect.objectContaining({ fileName: 'new.dwg' }));
  });

  it('retains the preview and save session on failure, then shows saved after retry', async () => {
    mocks.save.mockRejectedValueOnce(new Error('数据库确认失败'));
    render(<DwgViewerPage />);
    const file = sample('local.dwg');
    pick(file);
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(saveButton());
    await screen.findByText('数据库确认失败');
    expect(screen.getByRole('button', { name: '导出 PNG' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '重试保存' }));
    await screen.findByText('已保存');
    expect(useNoticeStore.getState().notices).toEqual([expect.objectContaining({ tone: 'success', title: '保存成功' })]);
    expect(mocks.session).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1][0]).toBe(mocks.save.mock.calls[0][0]);
  });

  it('reopens a private cloud drawing without allowing a duplicate save', async () => {
    mocks.list.mockResolvedValue([record]);
    render(<DwgViewerPage />);
    await screen.findByRole('option', { name: record.original_name });
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(mocks.list).toHaveBeenCalledWith(owner.id, expect.any(AbortSignal), 0);
    fireEvent.change(screen.getByRole('combobox', { name: '云端图纸' }), { target: { value: record.id } });
    await waitFor(() => expect(screen.getByRole('button', { name: '导出 PNG' }).hasAttribute('disabled')).toBe(false));
    expect(mocks.download).toHaveBeenCalledWith(record, expect.any(AbortSignal));
    expect(saveButton().disabled).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(useNoticeStore.getState().notices).toHaveLength(0);
  });

  it('adds the saved DWG to the same picker without reopening it', async () => {
    mocks.list.mockResolvedValueOnce([]).mockResolvedValueOnce([record]);
    render(<DwgViewerPage />);
    await screen.findByRole('option', { name: '暂无云端图纸' });
    pick(sample(record.original_name));
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(saveButton());
    await screen.findByRole('option', { name: record.original_name });
    expect((screen.getByRole('combobox', { name: '云端图纸' }) as HTMLSelectElement).value).toBe(record.id);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('requires an explicit recovery action for a pending drawing', async () => {
    mocks.list.mockResolvedValueOnce([{ ...record, status: 'uploading' }]).mockResolvedValueOnce([record]);
    render(<DwgViewerPage />);
    await screen.findByRole('option', { name: `${record.original_name}（保存未完成）` });
    fireEvent.change(screen.getByRole('combobox', { name: '云端图纸' }), { target: { value: record.id } });
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '恢复保存' }));
    await screen.findByText('已保存');
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ id: record.id }), undefined, expect.any(AbortSignal));
    expect(useNoticeStore.getState().notices).toHaveLength(1);
  });

  it('allows choosing the same cloud DWG after its download fails', async () => {
    mocks.list.mockResolvedValue([record]);
    mocks.download.mockRejectedValueOnce(new Error('云端未找到该 DWG 原文件。'));
    render(<DwgViewerPage />);
    await screen.findByRole('option', { name: record.original_name });
    const picker = screen.getByRole('combobox', { name: '云端图纸' }) as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: record.id } });
    await screen.findByText('云端未找到该 DWG 原文件。');
    expect(picker.value).toBe('');
    fireEvent.change(picker, { target: { value: record.id } });
    await screen.findByText('已保存');
    expect(mocks.download).toHaveBeenCalledTimes(2);
  });
});
