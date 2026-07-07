import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Crop,
  Download,
  Eraser,
  LassoSelect,
  Link2,
  Loader2,
  MousePointer2,
  RectangleHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { generateId } from '@/lib/commands';
import type { PdfDrawing } from '@/lib/pdfDrawings';
import { useHarnessStore } from '@/stores/harnessStore';
import type { TwoDImage } from '@/types/harness';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type CropMode = 'none' | 'rect' | 'lasso';
type Point = { x: number; y: number };
type CropSelection =
  | { type: 'rect'; start: Point; end: Point }
  | { type: 'lasso'; points: Point[] };

interface CropResult {
  url: string;
  filename: string;
  width: number;
  height: number;
}

interface PdfCropViewerProps {
  drawing: PdfDrawing;
}

const MIN_RECT_SIZE = 8;
const MIN_LASSO_POINTS = 3;
const ZOOM_STEP = 0.2;

function normalizeRect(selection: Extract<CropSelection, { type: 'rect' }>) {
  const left = Math.min(selection.start.x, selection.end.x);
  const top = Math.min(selection.start.y, selection.end.y);
  const width = Math.abs(selection.end.x - selection.start.x);
  const height = Math.abs(selection.end.y - selection.start.y);

  return { left, top, width, height };
}

function getLassoBounds(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function pointDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getSelectionSize(selection: CropSelection | null) {
  if (!selection) return null;
  if (selection.type === 'rect') {
    const rect = normalizeRect(selection);
    return rect.width >= MIN_RECT_SIZE && rect.height >= MIN_RECT_SIZE ? rect : null;
  }

  if (selection.points.length < MIN_LASSO_POINTS) return null;
  const bounds = getLassoBounds(selection.points);
  return bounds.width >= MIN_RECT_SIZE && bounds.height >= MIN_RECT_SIZE ? bounds : null;
}

function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function safeImageName(name: string) {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'pdf-crop';
}

export function PdfCropViewer({ drawing }: PdfCropViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const renderTokenRef = useRef(0);
  const dragStartRef = useRef<Point | null>(null);
  const lastLassoPointRef = useRef<Point | null>(null);
  const cropResultRef = useRef<CropResult | null>(null);

  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [containerWidth, setContainerWidth] = useState(900);
  const [zoom, setZoom] = useState(1);
  const [renderedSize, setRenderedSize] = useState({ width: 0, height: 0 });
  const [loadingMessage, setLoadingMessage] = useState('正在加载 PDF...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState<CropMode>('none');
  const [selection, setSelection] = useState<CropSelection | null>(null);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [cropResult, setCropResult] = useState<CropResult | null>(null);
  const [showAssocPicker, setShowAssocPicker] = useState(false);
  const [assocDone, setAssocDone] = useState<string | null>(null); // stores label after assoc

  const connectors = useHarnessStore((s) => s.config.connectors);
  const materials = useHarnessStore((s) => s.config.materials);
  const sleeves = useHarnessStore((s) => s.config.protectiveSleeves);
  const models = useHarnessStore((s) => s.config.models);
  const addTwoDImage = useHarnessStore((s) => s.addTwoDImage);
  const updateTwoDImageAssociation = useHarnessStore((s) => s.updateTwoDImageAssociation);

  const pageCount = pdfDocument?.numPages ?? 0;
  const canCrop = Boolean(getSelectionSize(selection));

  const selectionHint = useMemo(() => {
    if (cropMode === 'rect') return '拖拽矩形框选需要裁剪的区域';
    if (cropMode === 'lasso') return '点击多个点，或按住拖动画圈；松开后点击“裁剪选区”';
    return '开启裁剪工具后，在 PDF 页面上框选或圈选';
  }, [cropMode]);

  const clearCropResult = useCallback(() => {
    if (cropResultRef.current) {
      URL.revokeObjectURL(cropResultRef.current.url);
      cropResultRef.current = null;
    }
    setCropResult(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    dragStartRef.current = null;
    lastLassoPointRef.current = null;
    setIsPointerDown(false);
  }, []);

  const handleAssociate = useCallback(
    (elementKind: TwoDImage['elementKind'], elementId: string, label: string) => {
      const result = cropResultRef.current;
      if (!result) return;
      // Convert blob URL → dataURL for persistence
      fetch(result.url)
        .then((r) => r.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img: TwoDImage = {
              id: generateId(),
              name: result.filename.replace(/\.png$/, ''),
              dataUrl: ev.target?.result as string,
              source: 'upload',
            };
            addTwoDImage(img);
            updateTwoDImageAssociation(img.id, elementKind, elementId);
            setShowAssocPicker(false);
            setAssocDone(label);
          };
          reader.readAsDataURL(blob);
        });
    },
    [addTwoDImage, updateTwoDImageAssociation],
  );

  useEffect(() => () => clearCropResult(), [clearCropResult]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const updateWidth = () => {
      setContainerWidth(Math.max(320, stage.clientWidth - 32));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(stage);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument({ url: drawing.url });

    loadingTask.promise
      .then((loadedDocument) => {
        if (!cancelled) {
          setPdfDocument(loadedDocument);
          setLoadingMessage('');
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : 'PDF 加载失败');
        setLoadingMessage('');
      });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [drawing.url]);

  useEffect(() => {
    if (!pdfDocument) return undefined;

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    const renderToken = renderTokenRef.current + 1;
    renderTokenRef.current = renderToken;

    const renderPage = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      setLoadingMessage('正在渲染页面...');
      setErrorMessage(null);
      clearSelection();

      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled || renderTokenRef.current !== renderToken) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const fitScale = containerWidth / baseViewport.width;
        const scale = Math.max(0.25, Math.min(4, fitScale * zoom));
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('无法创建 PDF 渲染画布');
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${Math.ceil(viewport.width)}px`;
        canvas.style.height = `${Math.ceil(viewport.height)}px`;

        context.clearRect(0, 0, canvas.width, canvas.height);
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          background: 'rgb(255,255,255)',
        });
        await renderTask.promise;

        if (!cancelled && renderTokenRef.current === renderToken) {
          setRenderedSize({ width: canvas.width, height: canvas.height });
          setLoadingMessage('');
        }
      } catch (error) {
        if (cancelled || (error instanceof Error && error.name === 'RenderingCancelledException')) return;
        setErrorMessage(error instanceof Error ? error.message : 'PDF 页面渲染失败');
        setLoadingMessage('');
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [clearSelection, containerWidth, pageNumber, pdfDocument, zoom]);

  const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLDivElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (
      event.clientX < rect.left
      || event.clientX > rect.right
      || event.clientY < rect.top
      || event.clientY > rect.bottom
    ) {
      return null;
    }

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (cropMode === 'none') return;

    const point = getCanvasPoint(event);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    clearCropResult();
    setIsPointerDown(true);

    if (cropMode === 'rect') {
      dragStartRef.current = point;
      setSelection({ type: 'rect', start: point, end: point });
      return;
    }

    lastLassoPointRef.current = point;
    setSelection((current) => ({
      type: 'lasso',
      points: current?.type === 'lasso' ? [...current.points, point] : [point],
    }));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDown || cropMode === 'none') return;

    const point = getCanvasPoint(event);
    if (!point) return;

    if (cropMode === 'rect') {
      const start = dragStartRef.current;
      if (start) {
        setSelection({ type: 'rect', start, end: point });
      }
      return;
    }

    const lastPoint = lastLassoPointRef.current;
    if (!lastPoint || pointDistance(point, lastPoint) < 5) return;

    lastLassoPointRef.current = point;
    setSelection((current) => ({
      type: 'lasso',
      points: current?.type === 'lasso' ? [...current.points, point] : [point],
    }));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (cropMode === 'none') return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPointerDown(false);
    dragStartRef.current = null;
    lastLassoPointRef.current = null;
  };

  const handleCrop = useCallback(() => {
    const canvas = canvasRef.current;
    const size = getSelectionSize(selection);

    if (!canvas || !selection || !size) return;

    const outputCanvas = document.createElement('canvas');
    const outputContext = outputCanvas.getContext('2d');
    const width = Math.ceil(size.width);
    const height = Math.ceil(size.height);

    if (!outputContext || width <= 0 || height <= 0) return;

    outputCanvas.width = width;
    outputCanvas.height = height;

    if (selection.type === 'rect') {
      outputContext.drawImage(
        canvas,
        size.left,
        size.top,
        size.width,
        size.height,
        0,
        0,
        width,
        height,
      );
    } else {
      outputContext.save();
      outputContext.beginPath();
      selection.points.forEach((point, index) => {
        const x = point.x - size.left;
        const y = point.y - size.top;
        if (index === 0) {
          outputContext.moveTo(x, y);
        } else {
          outputContext.lineTo(x, y);
        }
      });
      outputContext.closePath();
      outputContext.clip();
      outputContext.drawImage(canvas, -size.left, -size.top);
      outputContext.restore();
    }

    outputCanvas.toBlob((blob) => {
      if (!blob) return;

      clearCropResult();
      const url = URL.createObjectURL(blob);
      const filename = `${safeImageName(drawing.name)}-第${pageNumber}页-裁剪.png`;
      const nextResult = { url, filename, width, height };
      cropResultRef.current = nextResult;
      setCropResult(nextResult);
    }, 'image/png');
  }, [clearCropResult, drawing.name, pageNumber, selection]);

  const selectionOverlay = useMemo(() => {
    if (!selection || renderedSize.width === 0 || renderedSize.height === 0) return null;

    if (selection.type === 'rect') {
      const rect = normalizeRect(selection);
      return (
        <rect
          x={rect.left}
          y={rect.top}
          width={rect.width}
          height={rect.height}
          rx="4"
          className="fill-blue-500/15 stroke-blue-500"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      );
    }

    const points = selection.points.map((point) => `${point.x},${point.y}`).join(' ');
    return (
      <>
        {selection.points.length > 2 && (
          <polygon
            points={points}
            className="fill-blue-500/15 stroke-blue-500"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polyline
          points={points}
          fill="none"
          className="stroke-blue-500"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {selection.points.map((point, index) => (
          <circle
            key={`${point.x}-${point.y}-${index}`}
            cx={point.x}
            cy={point.y}
            r="4"
            className="fill-white stroke-blue-500"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </>
    );
  }, [renderedSize, selection]);

  const showStageMask = cropMode !== 'none' && renderedSize.width > 0 && renderedSize.height > 0;

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
              disabled={pageNumber <= 1}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="上一页"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="min-w-20 text-center text-xs font-medium text-slate-600">
              {pageCount ? `${pageNumber} / ${pageCount}` : '- / -'}
            </span>
            <button
              type="button"
              onClick={() => setPageNumber((value) => Math.min(pageCount || value, value + 1))}
              disabled={!pageCount || pageNumber >= pageCount}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="下一页"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
            <span className="mx-1 h-6 w-px bg-slate-200" />
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.4, value - ZOOM_STEP))}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
              aria-label="缩小"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-14 text-center text-xs font-medium text-slate-600">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(3, value + ZOOM_STEP))}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
              aria-label="放大"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setCropMode('none');
                clearSelection();
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                cropMode === 'none'
                  ? 'bg-slate-800 text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <MousePointer2 className="h-3.5 w-3.5" />
              浏览
            </button>
            <button
              type="button"
              onClick={() => {
                setCropMode('rect');
                clearSelection();
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                cropMode === 'rect'
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <RectangleHorizontal className="h-3.5 w-3.5" />
              矩形裁剪
            </button>
            <button
              type="button"
              onClick={() => {
                setCropMode('lasso');
                clearSelection();
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                cropMode === 'lasso'
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <LassoSelect className="h-3.5 w-3.5" />
              圈选裁剪
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={!selection}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Eraser className="h-3.5 w-3.5" />
              清除
            </button>
            <button
              type="button"
              onClick={handleCrop}
              disabled={!canCrop}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Crop className="h-3.5 w-3.5" />
              裁剪选区
            </button>
          </div>
        </div>

        <div ref={stageRef} className="relative min-h-0 flex-1 overflow-auto bg-slate-100 p-4">
          <div
            className={`relative mx-auto w-fit ${cropMode === 'none' ? '' : 'touch-none select-none'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <canvas ref={canvasRef} className="block rounded-lg bg-white shadow" />

            {renderedSize.width > 0 && renderedSize.height > 0 && (
              <svg
                className={`absolute inset-0 ${showStageMask ? 'cursor-crosshair' : 'pointer-events-none'}`}
                width={renderedSize.width}
                height={renderedSize.height}
                viewBox={`0 0 ${renderedSize.width} ${renderedSize.height}`}
                aria-hidden="true"
              >
                {showStageMask && <rect width="100%" height="100%" className="fill-blue-500/5" />}
                {selectionOverlay}
              </svg>
            )}
          </div>

          {(loadingMessage || errorMessage) && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100/70 p-6">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                {errorMessage ? (
                  <span className="text-red-600">{errorMessage}</span>
                ) : (
                  <span className="flex items-center gap-2 text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {loadingMessage}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          {selectionHint}
        </div>
      </div>

      <aside className="flex w-72 shrink-0 flex-col rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">裁剪预览</h3>
          <p className="mt-1 text-xs text-slate-500">裁剪结果会临时显示在这里，可下载为 PNG。</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          {cropResult ? (
            <>
              {/* thumbnail */}
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                <img
                  src={cropResult.url}
                  alt="裁剪结果预览"
                  className="max-h-full max-w-full rounded bg-white shadow-sm"
                />
              </div>

              <div className="text-xs text-slate-500">
                {cropResult.width} × {cropResult.height}px
              </div>

              {/* save button */}
              <button
                type="button"
                onClick={() => downloadUrl(cropResult.url, cropResult.filename)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                <Download className="h-4 w-4" />
                保存 PNG
              </button>

              {/* associate button or success state */}
              {assocDone ? (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  已关联到「{assocDone}」
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAssocPicker((v) => !v)}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    showAssocPicker
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Link2 className="h-4 w-4" />
                  关联到设计图元素
                </button>
              )}

              {/* inline element picker */}
              {showAssocPicker && !assocDone && (
                <div className="flex max-h-52 flex-col overflow-y-auto rounded-lg border border-slate-200 bg-white text-xs shadow-sm">
                  {[
                    {
                      label: '连接器',
                      kind: 'connector' as const,
                      items: connectors.map((c) => ({
                        id: c.id,
                        name: c.label || c.id,
                      })),
                    },
                    {
                      label: '线材',
                      kind: 'material' as const,
                      items: materials.map((m) => ({ id: m.id, name: m.name })),
                    },
                    {
                      label: '保护套',
                      kind: 'sleeve' as const,
                      items: sleeves.map((s) => ({ id: s.id, name: s.id })),
                    },
                    {
                      label: '外模',
                      kind: 'model' as const,
                      items: models.map((mo) => ({ id: mo.id, name: mo.id })),
                    },
                  ]
                    .filter((group) => group.items.length > 0)
                    .map((group) => (
                      <div key={group.kind}>
                        <div className="sticky top-0 bg-slate-50 px-2.5 py-1 font-semibold text-slate-500">
                          {group.label}
                        </div>
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              handleAssociate(
                                group.kind,
                                item.id,
                                `${group.label}·${item.name}`,
                              )
                            }
                            className="flex w-full items-center px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    ))}
                  {connectors.length === 0 &&
                    materials.length === 0 &&
                    sleeves.length === 0 &&
                    models.length === 0 && (
                      <p className="px-3 py-4 text-center text-slate-400">
                        设计图中暂无元素
                      </p>
                    )}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
              <Crop className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">还没有裁剪结果</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                在左侧页面框选或圈选后，点击”裁剪选区”。
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
