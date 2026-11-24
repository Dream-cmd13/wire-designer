import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, ChevronDown, CloudUpload, Download, Eye, EyeOff, FileUp, Layers, Loader2, Maximize2, Minus, Moon, Plus, RefreshCw, Sun, Upload, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { DwgEditPanel } from '@/components/dwg/DwgEditPanel';
import { PageHeaderActions } from '@/components/layout/PageHeaderActions';
import { buildDwgViewerRoutePath, getDwgFileFromSearch } from '@/lib/appRoute';
import { fitView, panView, zoomLimitsFor, zoomViewAt, type DwgView } from '@/lib/dwg/dwgView';
import { exportDwgPdf, exportDwgPng } from '@/lib/dwg/dwgExport';
import { parseDwg, previewDwgOperations, type DwgParsePhase, type TextMeasure } from '@/lib/dwg/parseDwg';
import { hitDwgEditSources, updateDwgOperations, type DwgEditOperation } from '@/lib/dwg/dwgEdit';
import { downloadDwgRevision, generateDwgRevision } from '@/lib/dwg/dwgEditClient';
import { DEFAULT_FONT_FAMILY, renderDwgToCanvas } from '@/lib/dwg/renderDwg';
import { TEXT_SIZE_RATIO, textWidthOf } from '@/lib/dwg/textMetrics';
import type { DwgDrawing, DwgEditSource } from '@/lib/dwg/dwgTypes';
import { createDwgSaveSession, DWG_PAGE_SIZE, dwgRepository, dwgSha256, validateDwgFile, type DwgAsset } from '@/repositories/dwgRepository';
import { notify } from '@/stores/noticeStore';
import { useUserStore } from '@/stores/userStore';

const WASM_BASE = `${import.meta.env.BASE_URL}libredwg`;
const DWG_WRITEBACK_ENABLED = import.meta.env.VITE_DWG_WRITEBACK_ENABLED === 'true';
const VIEW_PADDING = 32;
const ZOOM_STEP = 1.2;
const BACKGROUNDS = { light: '#ffffff', dark: '#111827' } as const;
const DwgHarnessPreviewDialog = lazy(() => import('@/components/dwg/DwgHarnessPreviewDialog').then(({ DwgHarnessPreviewDialog }) => ({ default: DwgHarnessPreviewDialog })));

let canvasTextMeasurer: TextMeasure | null = null;

/**
 * 与渲染共用字体的文本测量：解析期 MTEXT 折行、Aligned/Fit 拉伸与文字包围盒
 * 都基于实际字形宽度，避免内置估算与画布字体度量不一致导致换行位置偏差。
 * Canvas 不可用时回落到内置估算。
 */
function measureDwgText(text: string, height: number): number {
  if (!canvasTextMeasurer) {
    const context = document.createElement('canvas').getContext('2d');
    canvasTextMeasurer = context
      ? (value, valueHeight) => {
        context.font = `${valueHeight * TEXT_SIZE_RATIO}px ${DEFAULT_FONT_FAMILY}`;
        return context.measureText(value).width;
      }
      : textWidthOf;
  }
  return canvasTextMeasurer(text, height);
}

type LoadPhase = DwgParsePhase | 'idle' | 'loading' | 'rendering' | 'ready' | 'error';
type BackgroundMode = keyof typeof BACKGROUNDS;
type SaveStatus = 'local' | 'saving' | 'saved' | 'error';
type EditConfirmation = 'generate' | 'discard';
const saveText: Record<SaveStatus, string> = { local: '仅本地预览', saving: '保存中…', saved: '已保存', error: '保存失败，可重试' };

interface ViewerState {
  phase: LoadPhase;
  fileName: string;
  drawing: DwgDrawing | null;
  error: string | null;
}

interface EditInput {
  file: File;
  sha256: string;
  parentId?: string;
}

interface Revision {
  file: File;
  drawing: DwgDrawing;
}

const NO_EDITS: DwgEditOperation[] = [];

/** 加载遮罩文案：签名/下载、引擎、解析与首次渲染四个阶段分别提示。 */
function loadPhaseText(phase: LoadPhase): string {
  if (phase === 'engine') return '正在加载 DWG 解析引擎…';
  if (phase === 'parsing') return '正在解析图纸…';
  if (phase === 'rendering') return '正在渲染图纸…';
  return '正在加载图纸…';
}

/** 等待两帧，确保加载遮罩完成绘制后再执行同步的解析/渲染，避免切换时界面看起来没有反应。 */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

const INITIAL_STATE: ViewerState = {
  phase: 'idle',
  fileName: '',
  drawing: null,
  error: null,
};

const toolbarButtonClass =
  'flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50';
function ToolbarDetails({ label, tone, children }: { label: string; tone: string; children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    const panel = panelRef.current;
    const toolbar = details?.closest<HTMLElement>('[data-page-header], [data-dwg-toolbar]');
    if (!details || !panel || !toolbar) return;

    const placePanel = () => {
      if (!details.open || !details.getClientRects().length) return;
      const trigger = details.getBoundingClientRect();
      const boundary = toolbar.getBoundingClientRect();
      const gutter = parseFloat(getComputedStyle(toolbar).paddingLeft);
      const maxLeft = boundary.width - panel.getBoundingClientRect().width - gutter;
      const left = Math.max(gutter, Math.min(trigger.left - boundary.left, maxLeft));
      panel.style.setProperty('--dwg-detail-x', `${left}px`);
      panel.style.setProperty('--dwg-detail-y', `${trigger.bottom - boundary.top}px`);
    };

    details.addEventListener('toggle', placePanel);
    const observer = new ResizeObserver(placePanel);
    observer.observe(toolbar);
    observer.observe(details);
    if (details.parentElement) observer.observe(details.parentElement);
    return () => {
      observer.disconnect();
      details.removeEventListener('toggle', placePanel);
    };
  }, []);

  return <details ref={detailsRef} name="dwg-header-details">
    <summary className={`flex cursor-pointer list-none items-center gap-1 rounded px-2 py-0.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden ${tone}`}>
      {label} <ChevronDown className="h-3 w-3" />
    </summary>
    <div ref={panelRef} className="absolute left-[var(--dwg-detail-x)] top-[var(--dwg-detail-y)] z-50 mt-1 w-80 max-w-[calc(100%-2rem)] rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg">
      {children}
    </div>
  </details>;
}

function ToolbarError({ id, message }: { id: string; message: string | null }) {
  return message && <span id={id} role="alert" className="min-w-0 max-w-44 break-words rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">{message}</span>;
}

function DwgEditConfirmation({ action, onCancel, onConfirm }: {
  action: EditConfirmation;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const discard = action === 'discard';

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={dialogRef} role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      className="fixed inset-0 m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-xl backdrop:bg-black/40">
      <h2 id={titleId} className="text-base font-semibold">{discard ? '放弃当前 DWG 草稿？' : '确认生成 DWG？'}</h2>
      <p id={descriptionId} className="mt-2 text-sm text-slate-600">
        {discard ? '退出编辑会丢弃本次草稿和预览。' : '当前原图将发送到本系统的转换服务，文件仅用于本次处理。'}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={toolbarButtonClass}>取消</button>
        <button type="button" onClick={onConfirm}
          className={`h-8 cursor-pointer rounded-md px-2.5 text-xs font-medium text-white ${discard ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {discard ? '放弃草稿' : '确认生成'}
        </button>
      </div>
    </dialog>
  );
}

function zoomPercentOf(view: DwgView | null, drawing: DwgDrawing | null, width: number, height: number): number | null {
  if (!view || !drawing || width <= 0 || height <= 0) return null;
  const fitScale = fitView(drawing.bounds, { width, height }, VIEW_PADDING).scale;
  if (!(fitScale > 0)) return null;
  return Math.round((view.scale / fitScale) * 100);
}

/**
 * 画布容器内的交互控件（图层面板、按钮等）不参与平移与滚轮缩放，
 * 否则容器会捕获指针导致控件的 click 无法触发。
 */
const INTERACTIVE_SELECTOR = 'button, input, textarea, select, a, [role="button"], [data-dwg-overlay]';

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
}

export function DwgViewerPage() {
  const user = useUserStore((state) => state.currentUser);
  const ownerId = user && (user.role === 'engineer' || user.role === 'admin') ? user.id : null;
  return <DwgWorkspace key={`${user?.id}:${user?.role}`} ownerId={ownerId} />;
}

function DwgWorkspace({ ownerId }: { ownerId: string | null }) {
  const [state, setState] = useState<ViewerState>(INITIAL_STATE);
  const [view, setView] = useState<DwgView | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [background, setBackground] = useState<BackgroundMode>('light');
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [layersOpen, setLayersOpen] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null);
  const [harnessPreviewOpen, setHarnessPreviewOpen] = useState(false);
  const harnessPreviewButton = useRef<HTMLButtonElement>(null);
  const [cloudId, setCloudId] = useState('');
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('local');
  const [saving, setSaving] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [originalSaveError, setOriginalSaveError] = useState<string | null>(null);
  const [recoveryFailure, setRecoveryFailure] = useState<{ id: string; message: string } | null>(null);
  const [cloudDrawings, setCloudDrawings] = useState<DwgAsset[]>([]);
  const [listLoading, setListLoading] = useState(Boolean(ownerId && dwgRepository.configured));
  const [listError, setListError] = useState<string | null>(null);
  const [editInput, setEditInput] = useState<EditInput | null>(null);
  const [editing, setEditing] = useState(false);
  const [hits, setHits] = useState<DwgEditSource[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [history, setHistory] = useState<DwgEditOperation[][]>([]);
  const [generating, setGenerating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [revisionSaved, setRevisionSaved] = useState(false);
  const [editConfirmation, setEditConfirmation] = useState<EditConfirmation | null>(null);
  const canEditDraft = state.drawing?.version === 'AC1018' && (!DWG_WRITEBACK_ENABLED || Boolean(editInput));
  const operations = history.at(-1) ?? NO_EDITS;
  const displayedDrawing = useMemo(() => state.drawing && (revision?.drawing ?? previewDwgOperations(state.drawing, operations, measureDwgText)),
    [state.drawing, operations, revision]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const drawingRef = useRef<DwgDrawing | null>(null);
  const viewRef = useRef<DwgView | null>(null);
  const loadTokenRef = useRef(0);
  const urlLoadRef = useRef<AbortController | null>(null);
  const saveTask = useRef<AbortController | null>(null);
  const listTask = useRef<AbortController | null>(null);
  const saveSession = useRef<DwgAsset | null>(null);
  const revisionSession = useRef<DwgAsset | null>(null);
  const generationTask = useRef<AbortController | null>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; lastX: number; lastY: number; moved: boolean; select: boolean } | null>(null);
  /** 加载后布局稳定前保持自动适应窗口，用户缩放/平移后交还控制权。 */
  const autoFitRef = useRef(true);
  /** 新图纸的首次画布绘制：先让遮罩绘制一帧，绘制完成后再撤下遮罩。 */
  const firstRenderRef = useRef(false);

  const resetEditing = useCallback(() => {
    generationTask.current?.abort();
    generationTask.current = null;
    revisionSession.current = null;
    setEditing(false);
    setHits([]);
    setSelectedKey('');
    setHistory([]);
    setGenerating(false);
    setEditError(null);
    setRevision(null);
    setRevisionSaved(false);
    setEditConfirmation(null);
  }, []);

  const applyView = useCallback((next: DwgView) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const fitToViewport = useCallback(() => {
    const drawing = drawingRef.current;
    const container = containerRef.current;
    if (!drawing || !container || container.clientWidth <= 0) return;
    applyView(fitView(drawing.bounds, { width: container.clientWidth, height: container.clientHeight }, VIEW_PADDING));
  }, [applyView]);

  const fitManually = useCallback(() => {
    autoFitRef.current = false;
    fitToViewport();
  }, [fitToViewport]);

  /** 缩放范围按当前图纸的适应比例计算，兼容大坐标图纸。 */
  const currentZoomLimits = useCallback(() => {
    const drawing = drawingRef.current;
    const container = containerRef.current;
    if (!drawing || !container || container.clientWidth <= 0) return null;
    const fitScale = fitView(
      drawing.bounds,
      { width: container.clientWidth, height: container.clientHeight },
      VIEW_PADDING,
    ).scale;
    return zoomLimitsFor(fitScale);
  }, []);

  /** 把解析结果或缓存图纸呈现到画布，并恢复自动适应窗口。 */
  const showDrawing = useCallback((drawing: DwgDrawing, fileName: string) => {
    autoFitRef.current = true;
    firstRenderRef.current = true;
    viewRef.current = null;
    setView(null);
    drawingRef.current = drawing;
    setHiddenLayers(new Set(drawing.hiddenLayers));
    setLayersOpen(false);
    const container = containerRef.current;
    if (container && container.clientWidth > 0) {
      applyView(fitView(drawing.bounds, { width: container.clientWidth, height: container.clientHeight }, VIEW_PADDING));
    }
    // 保持遮罩直到首次绘制完成，避免同步渲染期间界面看起来没有反应
    setState({ phase: 'rendering', fileName, drawing, error: null });
  }, [applyView]);

  const beginLoad = useCallback((fileName: string, assetId = '') => {
    resetEditing();
    setEditInput(null);
    urlLoadRef.current?.abort();
    const controller = new AbortController();
    urlLoadRef.current = controller;
    const token = ++loadTokenRef.current;
    saveSession.current = null;
    setCloudId(assetId);
    setLocalFile(null);
    setSaveStatus('local');
    setFileError(null);
    setOriginalSaveError(null);
    setRecoveryFailure(null);
    setHarnessPreviewOpen(false);
    autoFitRef.current = true;
    drawingRef.current = null;
    viewRef.current = null;
    setView(null);
    setHiddenLayers(new Set<string>());
    setLayersOpen(false);
    setState({ phase: 'loading', fileName, drawing: null, error: null });
    return { token, signal: controller.signal };
  }, [resetEditing]);

  const loadBuffer = useCallback(async (buffer: ArrayBuffer, file: File, token: number, asset?: DwgAsset) => {
    if (token !== loadTokenRef.current) return;
    const fileName = file.name;

    try {
      const drawing = await parseDwg(buffer, {
        fileName,
        wasmBase: WASM_BASE,
        measureText: measureDwgText,
        onProgress: async (phase) => {
          setState((prev) => (
            token === loadTokenRef.current && prev.phase !== 'error' ? { ...prev, phase } : prev
          ));
          // 让遮罩先绘制出来，再继续同步解析
          if (token === loadTokenRef.current) await nextPaint();
        },
      });
      if (token !== loadTokenRef.current) return;

      showDrawing(drawing, fileName);
      if (DWG_WRITEBACK_ENABLED && drawing.version === 'AC1018') {
        const sha256 = asset?.sha256 ?? await dwgSha256(buffer).catch(() => null);
        if (sha256 && token === loadTokenRef.current) setEditInput({ file, sha256, parentId: asset?.id });
      }
    } catch (error) {
      if (token !== loadTokenRef.current) return;
      drawingRef.current = null;
      setState({
        phase: 'error',
        fileName,
        drawing: null,
        error: error instanceof Error ? error.message : 'DWG 解析失败',
      });
    }
  }, [showDrawing]);

  function clearCloudLink() {
    if (getDwgFileFromSearch(window.location.search)) {
      window.history.replaceState(null, '', buildDwgViewerRoutePath(window.location.pathname));
    }
  }

  async function loadFile(files: FileList | readonly File[]) {
    if (saveTask.current || !files.length) return;
    if (files.length !== 1) {
      setFileError('一次只能打开一个 DWG 文件。');
      return;
    }
    const file = files[0];
    try {
      validateDwgFile(file);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : '无效的 DWG 文件。');
      return;
    }
    const { token, signal } = beginLoad(file.name);
    clearCloudLink();
    setLocalFile(file);
    try {
      await loadBuffer(await file.arrayBuffer(), file, token);
    } catch (error) {
      if (signal.aborted) return;
      setState({ phase: 'error', fileName: file.name, drawing: null, error: error instanceof Error ? error.message : '无法读取所选文件' });
    }
  }

  const openCloud = useCallback(async (asset: DwgAsset) => {
    if (saveTask.current) return;
    const { token, signal } = beginLoad(asset.original_name, asset.id);
    window.history.replaceState(null, '', buildDwgViewerRoutePath(window.location.pathname, asset.id));
    try {
      const source = await dwgRepository.download(asset, signal);
      const buffer = await source.arrayBuffer();
      if (signal.aborted) return;
      setSaveStatus('saved');
      await loadBuffer(buffer, new File([source], asset.original_name, { type: 'application/octet-stream' }), token, asset);
    } catch (error) {
      if (signal.aborted) return;
      setState({ phase: 'error', fileName: asset.original_name, drawing: null, error: error instanceof Error ? error.message : '云端图纸加载失败' });
    }
  }, [beginLoad, loadBuffer]);

  const refreshList = useCallback(async (restoreSelection = false) => {
    if (!ownerId || !dwgRepository.configured) return;
    listTask.current?.abort();
    const controller = new AbortController();
    listTask.current = controller;
    const token = loadTokenRef.current;
    try {
      const rows: DwgAsset[] = [];
      for (let page = 0; ; page += 1) {
        const batch = await dwgRepository.list(ownerId, controller.signal, page);
        if (controller.signal.aborted) return;
        rows.push(...batch.slice(0, DWG_PAGE_SIZE));
        if (batch.length <= DWG_PAGE_SIZE) break;
      }
      setCloudDrawings(rows);
      setListError(null);
      if (restoreSelection && loadTokenRef.current === token) {
        const requested = getDwgFileFromSearch(window.location.search);
        const asset = rows.find((row) => row.id === requested && row.status === 'ready');
        if (asset) void openCloud(asset);
      }
    } catch (error) {
      if (!controller.signal.aborted) setListError(error instanceof Error ? error.message : '读取云端图纸失败。');
    } finally {
      if (!controller.signal.aborted) setListLoading(false);
    }
  }, [ownerId, openCloud]);

  async function saveDrawing(recovery?: DwgAsset, revisedFile?: File) {
    if (!ownerId || saveTask.current || !dwgRepository.configured || (revisedFile && !DWG_WRITEBACK_ENABLED)) return;
    const file = revisedFile ?? (state.phase === 'ready' ? localFile ?? undefined : undefined);
    if (!recovery && (!file || (revisedFile ? revisionSaved : saveStatus === 'saved'))) return;
    const controller = new AbortController();
    saveTask.current = controller;
    setSaving(true);
    if (revisedFile) setEditError(null);
    else if (recovery) setRecoveryFailure(null);
    else {
      setOriginalSaveError(null);
      setSaveStatus('saving');
    }
    let recovered: DwgAsset | undefined;
    try {
      let session = recovery ?? (revisedFile ? revisionSession.current : saveSession.current);
      if (!session && file) {
        session = revisedFile ? await createDwgSaveSession(ownerId, file, editInput?.parentId) : await createDwgSaveSession(ownerId, file);
        if (controller.signal.aborted) return;
        if (revisedFile) revisionSession.current = session;
        else saveSession.current = session;
      }
      if (!session) return;
      const asset = await dwgRepository.save(session, file, controller.signal);
      if (controller.signal.aborted) return;
      if (recovery) recovered = asset;
      else if (revisedFile) setRevisionSaved(true);
      else {
        setSaveStatus('saved');
        setCloudId(asset.id);
        window.history.replaceState(null, '', buildDwgViewerRoutePath(window.location.pathname, asset.id));
      }
      listTask.current?.abort();
      setCloudDrawings((rows) => [asset, ...rows.filter((row) => row.id !== asset.id)]);
      setListLoading(true);
      void refreshList();
      notify({ tone: 'success', title: '保存成功', message: 'DWG 图纸已保存到云端。', dedupeKey: 'dwg-save-success' });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : '保存失败，请重试。';
      if (revisedFile) setEditError(message);
      else if (recovery) setRecoveryFailure({ id: recovery.id, message });
      else {
        setOriginalSaveError(message);
        setSaveStatus('error');
      }
    } finally {
      saveTask.current = null;
      if (!controller.signal.aborted) setSaving(false);
    }
    if (recovered) void openCloud(recovered);
  }

  async function generateRevision() {
    if (!DWG_WRITEBACK_ENABLED || !ownerId || !editInput || !operations.length || generationTask.current || saveTask.current) return;
    const controller = new AbortController();
    generationTask.current = controller;
    const timeout = AbortSignal.timeout(60_000);
    const signal = AbortSignal.any([controller.signal, timeout]);
    setGenerating(true);
    setEditError(null);
    try {
      const file = await generateDwgRevision(editInput.file, ownerId, editInput.sha256, operations, signal);
      const drawing = await parseDwg(await file.arrayBuffer(), { fileName: file.name, wasmBase: WASM_BASE, measureText: measureDwgText });
      signal.throwIfAborted();
      const result = new Map(drawing.entities.flatMap(({ editSource }) => editSource ? [[editSource.handle, editSource] as const] : []));
      if (drawing.version !== 'AC1018' || operations.some((item) => {
        const source = result.get(item.handle);
        return source?.kind !== item.kind || source.expectedText !== item.newText;
      })) throw new Error('写入文件的读回结果与草稿不一致。');
      setRevision({ file, drawing });
    } catch (error) {
      if (!controller.signal.aborted) setEditError(timeout.aborted ? 'DWG 生成超时，请重试。' : error instanceof Error ? error.message : 'DWG 生成失败。');
    } finally {
      if (generationTask.current === controller) {
        generationTask.current = null;
        setGenerating(false);
      }
    }
  }

  function applyEdit(target: DwgEditSource, value: string) {
    if (generationTask.current || saveTask.current || revision) return;
    try {
      setHistory([...history.slice(-100), updateDwgOperations(operations, target, value)]);
      setEditError(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : '无法应用文字修改。');
    }
  }

  function undoEdit() {
    if (generationTask.current || saveTask.current) return;
    setRevision(null);
    setRevisionSaved(false);
    revisionSession.current = null;
    setEditError(null);
    setHistory((previous) => previous.slice(0, -1));
  }

  useEffect(() => {
    const lifecycle = new AbortController();
    queueMicrotask(() => {
      if (!lifecycle.signal.aborted) void refreshList(true);
    });
    return () => {
      lifecycle.abort();
      urlLoadRef.current?.abort();
      loadTokenRef.current += 1;
      saveTask.current?.abort();
      listTask.current?.abort();
      generationTask.current?.abort();
    };
  }, [refreshList]);

  // 跟踪画布尺寸，并在首次测量后自动适配视图
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      setViewport({ width: rect.width, height: rect.height });
      if (drawingRef.current && (!viewRef.current || autoFitRef.current)) {
        applyView(fitView(drawingRef.current.bounds, { width: rect.width, height: rect.height }, VIEW_PADDING));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [applyView]);

  // 绘制（用 rAF 合并连续的缩放/平移更新）
  useEffect(() => {
    const canvas = canvasRef.current;
    const drawing = displayedDrawing;
    if (!canvas || !drawing || !view || viewport.width <= 0 || viewport.height <= 0) return;

    let cancelled = false;
    const draw = () => {
      if (cancelled) return;
      firstRenderRef.current = false;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(viewport.width * ratio));
      const height = Math.max(1, Math.round(viewport.height * ratio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const context = canvas.getContext('2d');
      if (context) {
        renderDwgToCanvas(context, drawing, {
          scale: view.scale * ratio,
          offsetX: view.offsetX * ratio,
          offsetY: view.offsetY * ratio,
          lineWidth: Math.max(1, ratio),
          background: BACKGROUNDS[background],
          hiddenLayers,
          selectedKey: editing && !revision ? selectedKey : undefined,
        });
      }
      // 首次绘制完成后再撤下遮罩，避免同步渲染期间界面看起来没有反应
      setState((prev) => (prev.phase === 'rendering' ? { ...prev, phase: 'ready' } : prev));
    };

    let frame = 0;
    if (firstRenderRef.current) {
      // 首次绘制多等一帧，让「正在渲染图纸…」遮罩先显示出来
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(draw);
      });
    } else {
      frame = requestAnimationFrame(draw);
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [displayedDrawing, view, viewport, background, hiddenLayers, editing, selectedKey, revision]);

  // 滚轮缩放（以光标为锚点，需非 passive 监听才能阻止默认滚动）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (event: WheelEvent) => {
      if (isInteractiveTarget(event.target)) return;
      event.preventDefault();
      const current = viewRef.current;
      if (!current) return;
      const limits = currentZoomLimits();
      if (!limits) return;
      autoFitRef.current = false;
      const rect = container.getBoundingClientRect();
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      applyView(zoomViewAt(
        current,
        factor,
        event.clientX - rect.left,
        event.clientY - rect.top,
        limits.min,
        limits.max,
      ));
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [applyView, currentZoomLimits]);

  const zoomBy = useCallback((factor: number) => {
    const current = viewRef.current;
    const container = containerRef.current;
    const limits = currentZoomLimits();
    if (!current || !container || !limits) return;
    autoFitRef.current = false;
    applyView(zoomViewAt(
      current,
      factor,
      container.clientWidth / 2,
      container.clientHeight / 2,
      limits.min,
      limits.max,
    ));
  }, [applyView, currentZoomLimits]);

  // 快捷键：+/- 缩放，0/F 适应窗口
  useEffect(() => {
    if (harnessPreviewOpen || editConfirmation) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomBy(ZOOM_STEP);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomBy(1 / ZOOM_STEP);
      } else if (event.key === '0' || event.key.toLowerCase() === 'f') {
        event.preventDefault();
        fitManually();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomBy, fitManually, harnessPreviewOpen, editConfirmation]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (!viewRef.current) return;
    if (isInteractiveTarget(event.target)) return;
    autoFitRef.current = false;
    event.preventDefault();
    panRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      lastX: event.clientX, lastY: event.clientY, moved: false, select: event.button === 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const current = viewRef.current;
    if (!pan || pan.pointerId !== event.pointerId || !current) return;
    if (!pan.moved && Math.hypot(event.clientX - pan.startX, event.clientY - pan.startY) < 4) return;
    pan.moved = true;
    const deltaX = event.clientX - pan.lastX;
    const deltaY = event.clientY - pan.lastY;
    pan.lastX = event.clientX;
    pan.lastY = event.clientY;
    applyView(panView(current, deltaX, deltaY));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan?.pointerId !== event.pointerId) return;
    panRef.current = null;
    setIsPanning(false);
    const current = viewRef.current;
    if (event.type !== 'pointerup' || !pan.select || pan.moved || !editing || !displayedDrawing || !current || revision || generating) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const next = hitDwgEditSources(displayedDrawing, current, { x: event.clientX - rect.left, y: event.clientY - rect.top }, hiddenLayers);
    setHits(next);
    setSelectedKey(next.length === 1 ? next[0].key : '');
    setEditError(null);
  };

  const toggleLayer = useCallback((name: string) => {
    setHiddenLayers((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const handleExport = useCallback(async (format: 'pdf' | 'png') => {
    const drawing = displayedDrawing;
    if (!drawing || exporting) return;
    setExporting(format);
    try {
      const options = { background: BACKGROUNDS[background], hiddenLayers };
      if (format === 'pdf') {
        await exportDwgPdf(drawing, options);
      } else {
        await exportDwgPng(drawing, options);
      }
    } catch (error) {
      notify({
        tone: 'danger',
        title: '导出失败',
        message: error instanceof Error ? error.message : 'DWG 导出失败，请重试。',
        dedupeKey: 'dwg-export-failed',
      });
    } finally {
      setExporting(null);
    }
  }, [displayedDrawing, exporting, background, hiddenLayers]);

  const isReady = state.phase === 'ready' && state.drawing !== null;
  const showCanvasPicker = state.phase === 'idle' || state.phase === 'error';
  const selectedCloudDrawing = cloudDrawings.find((asset) => asset.id === cloudId);
  const cloudPlaceholder = !dwgRepository.configured ? '云端尚未配置'
    : listLoading ? '正在读取云端图纸…' : listError ? '云端图纸读取失败'
    : cloudDrawings.length ? '选择云端图纸…' : '暂无云端图纸';
  const skippedCount = state.drawing
    ? Object.values(state.drawing.stats.skipped).reduce((sum, value) => sum + value, 0)
    : 0;
  const externalImages = state.drawing?.externalImages ?? [];
  const statistics = state.drawing && `${state.drawing.stats.rendered} 个图元 · ${state.drawing.stats.text} 处文字 · ${state.drawing.layers.length} 个图层${skippedCount > 0 ? ` · 跳过 ${skippedCount}` : ''}`;
  const recoveryError = recoveryFailure?.id === cloudId ? recoveryFailure.message : null;
  const zoomPercent = zoomPercentOf(view, state.drawing, viewport.width, viewport.height);
  const chooseFileButton = (primary = false) => (
    <button
      type="button"
      className={primary ? `${toolbarButtonClass} !border-blue-600 !bg-blue-600 !text-white hover:!bg-blue-700` : toolbarButtonClass}
      disabled={saving}
      aria-describedby={fileError ? 'dwg-file-error' : undefined}
      onClick={() => fileInputRef.current?.click()}
    >
      <Upload className="h-3.5 w-3.5" />
      选择文件
    </button>
  );

  const saveStatusBadgeClass = saving
    ? 'border-blue-200 bg-blue-50 text-blue-700'
    : saveStatus === 'saved'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : saveStatus === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-slate-100 text-slate-600';

  const subBarIconButtonClass =
    'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-transparent text-slate-600 transition-colors hover:border-slate-200 hover:bg-white hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40';
  const headerIconButtonClass =
    'flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40';
  const showCanvasSubBar = isReady || state.phase !== 'idle';

  return (
    <div className="flex h-full flex-col bg-white">
      <PageHeaderActions>
        <div className="flex min-w-0 max-w-full items-center gap-1.5">
          {state.fileName && (
            <span className="min-w-0 max-w-28 xl:max-w-36 truncate rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700" title={state.fileName}>
              {state.fileName}
            </span>
          )}
          {(saving || (isReady && (localFile || saveStatus === 'saved'))) && (
            <span className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${saveStatusBadgeClass}`} role="status">
              {saving ? saveText.saving : saveText[saveStatus]}
            </span>
          )}
        </div>

        {ownerId && (
          <div className="flex max-w-full min-w-0 items-center gap-1">
            <select
              className="h-8 w-32 sm:w-40 min-w-0 cursor-pointer truncate rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
              value={selectedCloudDrawing && (state.phase !== 'error' || selectedCloudDrawing.status === 'uploading') ? cloudId : ''}
              onChange={(event) => {
                const asset = cloudDrawings.find((item) => item.id === event.target.value);
                if (asset?.status === 'ready') void openCloud(asset);
                else setCloudId(asset?.id ?? '');
              }}
              disabled={saving || cloudDrawings.length === 0}
              aria-label="云端图纸"
              title={selectedCloudDrawing?.original_name ?? '我的云端图纸'}
            >
              <option value="" disabled>{cloudPlaceholder}</option>
              {cloudDrawings.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.original_name}{asset.parent_asset_id ? '（修订版）' : ''}{asset.status === 'uploading' ? '（保存未完成）' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={headerIconButtonClass}
              aria-label="刷新云端图纸"
              title="刷新云端图纸"
              aria-describedby={listError ? 'dwg-list-error' : undefined}
              disabled={saving || listLoading || !dwgRepository.configured}
              onClick={() => {
                setListLoading(true);
                void refreshList();
              }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
            <ToolbarError id="dwg-list-error" message={listError} />
            {selectedCloudDrawing?.status === 'uploading' && (
              <div className="flex max-w-full min-w-0 items-center gap-1">
                <button
                  type="button"
                  className={toolbarButtonClass}
                  disabled={saving}
                  onClick={() => void saveDrawing(selectedCloudDrawing)}
                  aria-describedby={recoveryError ? 'dwg-recovery-error' : undefined}
                >
                  <CloudUpload className="h-3.5 w-3.5" />
                  恢复保存
                </button>
                <ToolbarError id="dwg-recovery-error" message={recoveryError} />
              </div>
            )}
          </div>
        )}

        {(!showCanvasPicker || fileError) && (
          <div className="flex max-w-full min-w-0 items-center gap-1">
            {!showCanvasPicker && chooseFileButton()}
            <ToolbarError id="dwg-file-error" message={fileError} />
          </div>
        )}

        {ownerId && !editing && (
          <div className="flex max-w-full min-w-0 items-center gap-1">
            <button
              type="button"
              className="flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-blue-600 bg-blue-600 px-2 text-xs font-medium text-white shadow-2xs transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
              disabled={!localFile || !isReady || saving || saveStatus === 'saved' || !dwgRepository.configured}
              aria-describedby={originalSaveError ? 'dwg-save-error' : undefined}
              title={dwgRepository.configured ? '保存 DWG 原文件' : '云端尚未配置'}
              onClick={() => void saveDrawing()}
            >
              <CloudUpload className="h-3.5 w-3.5" />
              {saveStatus === 'error' ? '重试保存' : '保存到云端'}
            </button>
            <ToolbarError id="dwg-save-error" message={originalSaveError} />
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className={toolbarButtonClass}
            onClick={() => void handleExport('png')}
            disabled={!isReady || exporting !== null}
            aria-label="导出 PNG"
            title="导出 PNG（适应图纸范围，含背景与图层显示）"
          >
            {exporting === 'png' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            PNG
          </button>
          <button
            type="button"
            className={toolbarButtonClass}
            onClick={() => void handleExport('pdf')}
            disabled={!isReady || exporting !== null}
            aria-label="导出 PDF"
            title="导出 A4 横向 PDF（适应图纸范围，含背景与图层显示）"
          >
            {exporting === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            PDF
          </button>
          <button type="button" ref={harnessPreviewButton} className={toolbarButtonClass} disabled={!isReady} aria-label="生成 3D 示意"
            onClick={() => setHarnessPreviewOpen(true)} title="从 M12 单段线缆图纸生成 3D 示意">
            <Box className="h-3.5 w-3.5" />
            3D 示意
          </button>
        </div>
      </PageHeaderActions>

      {/* 画布顶部工具栏：图纸信息、缺失提示、编辑与视口控制，不遮挡图纸区域 */}
      {showCanvasSubBar && (
        <div
          data-dwg-toolbar
          className="relative flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-slate-200 bg-slate-50/80 px-3 py-1.5 sm:px-4"
        >
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
            {state.phase === 'error' ? (
              <span className="shrink-0 text-xs font-medium text-red-600">加载失败</span>
            ) : !isReady && state.phase !== 'idle' && (
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-blue-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                加载中
              </span>
            )}
            {isReady && (
              <ToolbarDetails label="图纸信息" tone="border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-100">
                {statistics}
              </ToolbarDetails>
            )}
            {isReady && externalImages.length > 0 && (
              <ToolbarDetails label={`外部图片缺失 ${externalImages.length} 张`} tone="border border-amber-200/80 bg-amber-50 text-amber-800 hover:bg-amber-100/70">
                <p>浏览器无法加载图纸引用的外部图片，当前仅显示占位框。</p>
                <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-4 [overflow-wrap:anywhere]">
                  {externalImages.map((image, index) => <li key={index}>{image.path ?? '未提供路径'}</li>)}
                </ul>
              </ToolbarDetails>
            )}
          </div>

          {isReady && (
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {ownerId && (
                <>
                  <button
                    type="button"
                    className={
                      editing
                        ? 'flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-blue-300 bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50'
                        : 'flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50'
                    }
                    disabled={!canEditDraft || saving}
                    title={state.drawing?.version === 'AC1018' ? undefined : '当前仅支持编辑 AC1018 图纸。'}
                    onClick={() => {
                      if (!editing) setEditing(true);
                      else if (!operations.length || revisionSaved) resetEditing();
                      else setEditConfirmation('discard');
                    }}
                  >
                    {editing ? '退出编辑' : DWG_WRITEBACK_ENABLED ? '编辑图纸' : '编辑草稿'}
                  </button>
                  <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden="true" />
                </>
              )}
              <button type="button" className={subBarIconButtonClass} onClick={() => zoomBy(1 / ZOOM_STEP)} title="缩小 (-)" aria-label="缩小">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-10 select-none text-center text-xs font-medium tabular-nums text-slate-600">
                {zoomPercent !== null ? `${zoomPercent}%` : '—'}
              </span>
              <button type="button" className={subBarIconButtonClass} onClick={() => zoomBy(ZOOM_STEP)} title="放大 (+)" aria-label="放大">
                <Plus className="h-3.5 w-3.5" />
              </button>
              <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden="true" />
              <button type="button" className={subBarIconButtonClass} onClick={fitManually} title="适应窗口 (0/F)" aria-label="适应窗口">
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={subBarIconButtonClass}
                onClick={() => setBackground((mode) => (mode === 'light' ? 'dark' : 'light'))}
                title={background === 'dark' ? '切换为白底' : '切换为黑底'}
                aria-label={background === 'dark' ? '切换为白底' : '切换为黑底'}
              >
                {background === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
              <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden="true" />
              <button
                type="button"
                className={`flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs font-medium transition-colors ${
                  layersOpen
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-blue-600'
                }`}
                onClick={() => setLayersOpen((open) => !open)}
                aria-pressed={layersOpen}
                title="图层显示控制"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>图层{hiddenLayers.size > 0 ? ` (${hiddenLayers.size} 隐藏)` : ''}</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        data-testid="dwg-drop-zone"
        className={`relative min-h-0 flex-1 touch-none overflow-hidden ${
          background === 'dark' ? 'bg-slate-800' : 'bg-slate-200'
        } ${isReady ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={(event) => {
          if (editing || isInteractiveTarget(event.target)) return;
          fitManually();
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = saveTask.current ? 'none' : 'copy';
        }}
        onDrop={(event) => {
          event.preventDefault();
          void loadFile(event.dataTransfer.files);
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {editing && <DwgEditPanel hits={hits} selection={hits.find((target) => target.key === selectedKey)} operations={operations}
          writebackEnabled={DWG_WRITEBACK_ENABLED} busy={generating} generated={Boolean(revision)} parent={Boolean(editInput?.parentId)} canSave={dwgRepository.configured}
          saving={saving} saved={revisionSaved} error={editError} onSelect={setSelectedKey} onApply={applyEdit} onUndo={undoEdit}
          onGenerate={() => setEditConfirmation('generate')} onCancel={() => generationTask.current?.abort()}
          onDownload={() => { if (revision) downloadDwgRevision(revision.file); }}
          onSave={() => { if (revision) void saveDrawing(undefined, revision.file); }} />}

        {isReady && layersOpen && (
          <div
            data-dwg-overlay
            className="absolute right-3 top-3 z-10 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-xs font-semibold text-slate-700">图层</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setHiddenLayers(new Set<string>())}
                  disabled={hiddenLayers.size === 0}
                >
                  全部显示
                </button>
                <button
                  type="button"
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => setLayersOpen(false)}
                  title="关闭"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              {state.drawing!.layers.map((layer) => {
                const hidden = hiddenLayers.has(layer.name);
                return (
                  <li key={layer.name}>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-50"
                      onClick={() => toggleLayer(layer.name)}
                      title={hidden ? '点击显示该图层' : '点击隐藏该图层'}
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm border border-slate-300"
                        style={{ backgroundColor: layer.color }}
                      />
                      <span className={`flex-1 truncate ${hidden ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {layer.name}
                      </span>
                      {hidden
                        ? <EyeOff className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        : <Eye className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {!isReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-100/90 px-6 text-slate-600">
            {showCanvasPicker ? (
              <div className="flex flex-col items-center gap-2 text-center text-sm">
                {state.error && <p className="max-w-md">{state.error}</p>}
                <FileUp size={28} className="mb-1 text-slate-400" />
                {chooseFileButton(true)}
                <p className="text-slate-500">也可拖入 DWG 文件（最大 20 MiB）</p>
              </div>
            ) : (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                <p className="text-sm">{loadPhaseText(state.phase)}</p>
                {state.phase === 'engine' && (
                  <p className="text-xs text-slate-400">首次加载需下载约 9 MB 解析引擎，之后可离线使用</p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {editConfirmation && <DwgEditConfirmation action={editConfirmation} onCancel={() => setEditConfirmation(null)} onConfirm={() => {
        if (editConfirmation === 'discard') resetEditing();
        else {
          setEditConfirmation(null);
          void generateRevision();
        }
      }} />}

      {harnessPreviewOpen && displayedDrawing && (
        <ErrorBoundary fallback={
          <div className="flex items-center gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p role="alert">3D 预览未能加载。保存未完成的工作后，可刷新页面再试。</p>
            <button type="button" className={toolbarButtonClass} onClick={() => {
              setHarnessPreviewOpen(false);
              harnessPreviewButton.current?.focus();
            }}>关闭提示</button>
          </div>
        }>
          <Suspense fallback={<span role="status" className="text-sm text-slate-600">正在加载 3D 预览…</span>}>
            <DwgHarnessPreviewDialog drawing={displayedDrawing} fileName={state.fileName} onClose={() => setHarnessPreviewOpen(false)} />
          </Suspense>
        </ErrorBoundary>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".dwg"
        aria-label="选择 DWG 文件"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void loadFile(files);
        }}
      />
    </div>
  );
}
