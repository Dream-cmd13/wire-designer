import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, EyeOff, FileUp, Layers, Loader2, Maximize2, Minus, Moon, Plus, Sun, X } from 'lucide-react';
import { fitView, panView, zoomLimitsFor, zoomViewAt, type DwgView } from '@/lib/dwg/dwgView';
import { exportDwgPdf, exportDwgPng } from '@/lib/dwg/dwgExport';
import { parseDwg, type DwgParsePhase } from '@/lib/dwg/parseDwg';
import { renderDwgToCanvas } from '@/lib/dwg/renderDwg';
import type { DwgDrawing } from '@/lib/dwg/dwgTypes';
import { notify } from '@/stores/noticeStore';

const SAMPLE_FILE_NAME = '线束设计器.dwg';
const SAMPLE_DWG_URL = `${import.meta.env.BASE_URL}dwg/${encodeURIComponent(SAMPLE_FILE_NAME)}`;
const WASM_BASE = `${import.meta.env.BASE_URL}libredwg`;
const VIEW_PADDING = 32;
const ZOOM_STEP = 1.2;
const BACKGROUNDS = { light: '#ffffff', dark: '#111827' } as const;

type LoadPhase = DwgParsePhase | 'ready' | 'error';
type BackgroundMode = keyof typeof BACKGROUNDS;

interface ViewerState {
  phase: LoadPhase;
  fileName: string;
  drawing: DwgDrawing | null;
  error: string | null;
}

const INITIAL_STATE: ViewerState = {
  phase: 'engine',
  fileName: SAMPLE_FILE_NAME,
  drawing: null,
  error: null,
};

const toolbarButtonClass =
  'flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50';
const iconButtonClass =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40';

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
  const [state, setState] = useState<ViewerState>(INITIAL_STATE);
  const [view, setView] = useState<DwgView | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [background, setBackground] = useState<BackgroundMode>('light');
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [layersOpen, setLayersOpen] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const drawingRef = useRef<DwgDrawing | null>(null);
  const viewRef = useRef<DwgView | null>(null);
  const loadTokenRef = useRef(0);
  const panRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

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

  const loadBuffer = useCallback(async (buffer: ArrayBuffer, fileName: string) => {
    const token = ++loadTokenRef.current;
    viewRef.current = null;
    setView(null);
    setHiddenLayers(new Set<string>());
    setLayersOpen(false);
    setState({ phase: 'engine', fileName, drawing: null, error: null });

    try {
      const drawing = await parseDwg(buffer, {
        fileName,
        wasmBase: WASM_BASE,
        onProgress: (phase) => setState((prev) => (
          token === loadTokenRef.current && prev.phase !== 'error' ? { ...prev, phase } : prev
        )),
      });
      if (token !== loadTokenRef.current) return;

      drawingRef.current = drawing;
      setHiddenLayers(new Set(drawing.hiddenLayers));
      const container = containerRef.current;
      if (container && container.clientWidth > 0) {
        applyView(fitView(drawing.bounds, { width: container.clientWidth, height: container.clientHeight }, VIEW_PADDING));
      }
      setState({ phase: 'ready', fileName, drawing, error: null });
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
  }, [applyView]);

  const loadFile = useCallback(async (file: File) => {
    try {
      await loadBuffer(await file.arrayBuffer(), file.name);
    } catch (error) {
      notify({
        tone: 'danger',
        title: '读取文件失败',
        message: error instanceof Error ? error.message : '无法读取所选文件',
        dedupeKey: 'dwg-file-read-failed',
      });
    }
  }, [loadBuffer]);

  // 首次进入加载内置示例图纸
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(SAMPLE_DWG_URL, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(response.status === 404
            ? '未找到内置示例图纸，请点击「打开 DWG 文件」选择本地文件'
            : `示例图纸加载失败（HTTP ${response.status}）`);
        }
        await loadBuffer(await response.arrayBuffer(), SAMPLE_FILE_NAME);
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          phase: 'error',
          fileName: SAMPLE_FILE_NAME,
          drawing: null,
          error: error instanceof Error ? error.message : '示例图纸加载失败',
        });
      }
    })();
    return () => controller.abort();
  }, [loadBuffer]);

  // 跟踪画布尺寸，并在首次测量后自动适配视图
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      setViewport({ width: rect.width, height: rect.height });
      if (!viewRef.current && drawingRef.current) {
        applyView(fitView(drawingRef.current.bounds, { width: rect.width, height: rect.height }, VIEW_PADDING));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [applyView]);

  // 绘制（用 rAF 合并连续的缩放/平移更新）
  useEffect(() => {
    const canvas = canvasRef.current;
    const drawing = state.drawing;
    if (!canvas || !drawing || !view || viewport.width <= 0 || viewport.height <= 0) return;

    const frame = requestAnimationFrame(() => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(viewport.width * ratio));
      const height = Math.max(1, Math.round(viewport.height * ratio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) return;
      renderDwgToCanvas(context, drawing, {
        scale: view.scale * ratio,
        offsetX: view.offsetX * ratio,
        offsetY: view.offsetY * ratio,
        lineWidth: Math.max(1, ratio),
        background: BACKGROUNDS[background],
        hiddenLayers,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [state.drawing, view, viewport, background, hiddenLayers]);

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
        fitToViewport();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomBy, fitToViewport]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (!viewRef.current) return;
    if (isInteractiveTarget(event.target)) return;
    event.preventDefault();
    panRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const current = viewRef.current;
    if (!pan || pan.pointerId !== event.pointerId || !current) return;
    const deltaX = event.clientX - pan.lastX;
    const deltaY = event.clientY - pan.lastY;
    pan.lastX = event.clientX;
    pan.lastY = event.clientY;
    applyView(panView(current, deltaX, deltaY));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    setIsPanning(false);
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
    const drawing = drawingRef.current;
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
  }, [exporting, background, hiddenLayers]);

  const isReady = state.phase === 'ready' && state.drawing !== null;
  const skippedCount = state.drawing
    ? Object.values(state.drawing.stats.skipped).reduce((sum, value) => sum + value, 0)
    : 0;
  const zoomPercent = zoomPercentOf(view, state.drawing, viewport.width, viewport.height);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">DWG 图纸</span>
          <span className="max-w-56 truncate rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600" title={state.fileName}>
            {state.fileName}
          </span>
          {isReady && (
            <span className="hidden text-xs text-slate-500 lg:inline">
              {state.drawing!.stats.rendered} 个图元 · {state.drawing!.stats.text} 处文字 · {state.drawing!.layers.length} 个图层
              {skippedCount > 0 ? ` · 跳过 ${skippedCount}` : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
            <button type="button" className={iconButtonClass} onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={!isReady} title="缩小 (-)">
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-11 select-none text-center text-xs tabular-nums text-slate-500">
              {zoomPercent !== null ? `${zoomPercent}%` : '—'}
            </span>
            <button type="button" className={iconButtonClass} onClick={() => zoomBy(ZOOM_STEP)} disabled={!isReady} title="放大 (+)">
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" className={iconButtonClass} onClick={fitToViewport} disabled={!isReady} title="适应窗口 (0/F)">
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={iconButtonClass}
              onClick={() => setBackground((mode) => (mode === 'light' ? 'dark' : 'light'))}
              disabled={!isReady}
              title={background === 'dark' ? '切换为白底' : '切换为黑底'}
            >
              {background === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          <button
            type="button"
            className={toolbarButtonClass}
            onClick={() => setLayersOpen((open) => !open)}
            disabled={!isReady}
            title="图层显示控制"
          >
            <Layers className="h-3.5 w-3.5" />
            图层{hiddenLayers.size > 0 ? ` (${hiddenLayers.size} 隐藏)` : ''}
          </button>
          <button type="button" className={toolbarButtonClass} onClick={() => fileInputRef.current?.click()}>
            <FileUp className="h-3.5 w-3.5" />
            打开 DWG 文件
          </button>
          <button
            type="button"
            className={toolbarButtonClass}
            onClick={() => void handleExport('png')}
            disabled={!isReady || exporting !== null}
            title="导出当前视图（含背景与图层显示）"
          >
            {exporting === 'png' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            导出 PNG
          </button>
          <button
            type="button"
            className={toolbarButtonClass}
            onClick={() => void handleExport('pdf')}
            disabled={!isReady || exporting !== null}
            title="导出 A4 横向 PDF（含背景与图层显示）"
          >
            {exporting === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            导出 PDF
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`relative min-h-0 flex-1 touch-none overflow-hidden ${
          background === 'dark' ? 'bg-slate-800' : 'bg-slate-200'
        } ${isReady ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={(event) => {
          if (isInteractiveTarget(event.target)) return;
          fitToViewport();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void loadFile(file);
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

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
            {state.phase === 'error' ? (
              <>
                <p className="max-w-md text-center text-sm">{state.error}</p>
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="h-4 w-4" />
                  打开 DWG 文件
                </button>
              </>
            ) : (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                <p className="text-sm">{state.phase === 'engine' ? '正在加载 DWG 解析引擎…' : '正在解析图纸…'}</p>
                <p className="text-xs text-slate-400">首次加载需下载约 9 MB 解析引擎，之后可离线使用</p>
              </>
            )}
          </div>
        )}

        {isDragging && (
          <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-400 bg-blue-50/70 text-sm font-medium text-blue-600">
            松开以打开 DWG 文件
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".dwg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void loadFile(file);
        }}
      />
    </div>
  );
}
