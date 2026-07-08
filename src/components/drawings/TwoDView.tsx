import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link2Off, Minus, Plus, RotateCw, Trash2, Upload } from 'lucide-react';
import { generateId } from '@/lib/commands';
import { buildTwoDImageGroups, getElementX } from '@/lib/twoDImageGroups';
import { useHarnessStore } from '@/stores/harnessStore';
import type { TwoDImage } from '@/types/harness';
import { TwoDImageCard } from './TwoDImageCard';

// ── constants ──────────────────────────────────────────────────────────────────
/** Stable empty array — prevents useSyncExternalStore from seeing a new ref each render */
const EMPTY_IMAGES: TwoDImage[] = [];

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.15;
const IMAGE_GAP = 8; // gap between images in flex row

// ── auto-layout ────────────────────────────────────────────────────────────────
function computeAutoLayout(
  groups: ReturnType<typeof buildTwoDImageGroups>,
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  let curX = CANVAS_PAD;
  const y = CANVAS_PAD;

  for (const group of groups) {
    for (let i = 0; i < group.images.length; i++) {
      positions[group.images[i].id] = { x: curX, y };
      curX += IMG_W + (i < group.images.length - 1 ? INNER_GAP : 0);
    }
    curX += GROUP_GAP;
  }

  return positions;
}

// ── helpers ────────────────────────────────────────────────────────────────────
function useElementLabel(
  elementKind: TwoDImage['elementKind'],
  elementId: string | undefined,
): string {
  const connectors = useHarnessStore((s) => s.config.connectors);
  const materials = useHarnessStore((s) => s.config.materials);

  if (!elementKind || !elementId) return '';
  if (elementKind === 'connector') {
    const c = connectors.find((x) => x.id === elementId);
    return c ? `连接器 · ${c.label || c.id}` : `连接器 · ${elementId}`;
  }
  if (elementKind === 'material') {
    const m = materials.find((x) => x.id === elementId);
    return m ? `线材 · ${m.name}` : `线材 · ${elementId}`;
  }
  if (elementKind === 'sleeve') return `保护套 · ${elementId}`;
  if (elementKind === 'model') return `外模 · ${elementId}`;
  return elementId;
}

// ── ImageInfoBox ───────────────────────────────────────────────────────────────
function ImageInfoBox({
  image,
  onRotate,
  onRemoveAssociation,
  onDelete,
}: {
  image: TwoDImage;
  onRotate: (id: string) => void;
  onRemoveAssociation: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const label = useElementLabel(image.elementKind, image.elementId);
  const rotation = image.rotation ?? 0;

  return (
    <div className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <p className="truncate text-xs font-semibold text-slate-700" title={image.name}>
        {image.name}
      </p>
      <div className="mt-1.5">
        {label ? (
          <span className="inline-block rounded bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            {label}
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">未关联元素</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onRotate(image.id)}
          className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          <RotateCw className="h-3 w-3" />
          旋转 {rotation}°
        </button>
        {image.elementKind && (
          <button
            type="button"
            onClick={() => onRemoveAssociation(image.id)}
            className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
          >
            <Link2Off className="h-3 w-3" />
            解除关联
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(image.id)}
          className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3 w-3" />
          删除
        </button>
      </div>
    </div>
  );
}

// ── main view ──────────────────────────────────────────────────────────────────
export function TwoDView() {
  const twoDImages = useHarnessStore((s) => s.config.twoDImages ?? EMPTY_IMAGES);
  const connectors = useHarnessStore((s) => s.config.connectors);
  const materials = useHarnessStore((s) => s.config.materials);
  const sleeves = useHarnessStore((s) => s.config.protectiveSleeves);
  const models = useHarnessStore((s) => s.config.models);
  const selection = useHarnessStore((s) => s.selection);
  const addTwoDImage = useHarnessStore((s) => s.addTwoDImage);
  const clearTwoDImageAssociation = useHarnessStore((s) => s.clearTwoDImageAssociation);
  const removeTwoDImage = useHarnessStore((s) => s.removeTwoDImage);
  const rotateTwoDImage = useHarnessStore((s) => s.rotateTwoDImage);
  const reorderTwoDImages = useHarnessStore((s) => s.reorderTwoDImages);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const highlightedRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // ── zoom & pan ───────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState<{
    startMX: number; startMY: number; startPX: number; startPY: number;
  } | null>(null);
  const panningRef = useRef(panning);
  panningRef.current = panning;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const hasInitializedPanRef = useRef(false);

  // ── drag-to-reorder state ─────────────────────────────────────────────────
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const dragIdxRef = useRef(dragIdx);
  dragIdxRef.current = dragIdx;

  // ── flatten groups into sorted display order ──────────────────────────────
  const groups = useMemo(
    () => buildTwoDImageGroups(twoDImages, connectors, materials, sleeves, models),
    [twoDImages, connectors, materials, sleeves, models],
  );

  // Sort all images by their element's x-position individually, ignoring group structure.
  // This ensures correct left-to-right order: ConnectorA | ModelLeft | Material | ModelRight | ConnectorB
  const flatImages = useMemo(() => {
    const allImages = groups.flatMap((g) => g.images);
    return allImages.sort((a, b) => {
      const ax = getElementX(a.elementKind, a.elementId, connectors, materials, sleeves, models);
      const bx = getElementX(b.elementKind, b.elementId, connectors, materials, sleeves, models);
      return ax - bx;
    });
  }, [groups, connectors, materials, sleeves, models]);

  // ── global mouse handlers ─────────────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: MouseEvent) {
      // canvas pan
      const p = panningRef.current;
      if (p) {
        setPan({
          x: p.startPX + e.clientX - p.startMX,
          y: p.startPY + e.clientY - p.startMY,
        });
      }
    }
    function onUp() {
      // complete drag-to-reorder
      const from = dragIdxRef.current;
      if (from !== null && dropIdx !== null && from !== dropIdx) {
        // map flatImages indices to twoDImages indices
        const fromImg = flatImages[from];
        const toImg = flatImages[dropIdx];
        const fromStoreIdx = twoDImages.findIndex((img) => img.id === fromImg.id);
        const toStoreIdx = twoDImages.findIndex((img) => img.id === toImg.id);
        if (fromStoreIdx !== -1 && toStoreIdx !== -1) {
          reorderTwoDImages(fromStoreIdx, toStoreIdx);
        }
      }
      setDragIdx(null);
      setDropIdx(null);
      setPanning(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dropIdx, flatImages, twoDImages, reorderTwoDImages]);

  // ── highlighted image (follows canvas selection) ─────────────────────────────
  const highlightedImageId =
    selection.kind !== 'none'
      ? (flatImages.find(
          (img) =>
            img.elementKind === selection.kind &&
            img.elementId === (selection as { id: string }).id,
        )?.id ?? null)
      : null;

  // ── zoom helpers ──────────────────────────────────────────────────────────────
  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

  const zoomIn = useCallback(() => {
    setZoom((z) => clampZoom(parseFloat((z + ZOOM_STEP).toFixed(2))));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => clampZoom(parseFloat((z - ZOOM_STEP).toFixed(2))));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  /** Wheel: zoom centered on cursor position inside viewport */
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    // cursor in viewport coords
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    setZoom((prevZoom) => {
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const nextZoom = clampZoom(parseFloat((prevZoom + delta).toFixed(2)));
      // adjust pan so the world point under cursor stays fixed
      setPan((prevPan) => ({
        x: cx - (cx - prevPan.x) * (nextZoom / prevZoom),
        y: cy - (cy - prevPan.y) * (nextZoom / prevZoom),
      }));
      return nextZoom;
    });
  }, []);

  /** Middle-mouse button starts canvas panning */
  const handleViewportMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 1) return; // middle button only
    e.preventDefault();
    setPanning({
      startMX: e.clientX,
      startMY: e.clientY,
      startPX: pan.x,
      startPY: pan.y,
    });
  }, [pan]);

  // ── drag-to-reorder mousedown ─────────────────────────────────────────────────
  function handleImageMouseDown(e: React.MouseEvent, idx: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragIdx(idx);
    setDropIdx(idx);
  }

  // ── upload ────────────────────────────────────────────────────────────────────
  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      addTwoDImage({
        id: generateId(),
        name: file.name.replace(/\.[^.]+$/, ''),
        dataUrl: ev.target?.result as string,
        source: 'upload',
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col bg-white">
      {/* toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="text-sm font-semibold text-slate-700">2D 图</span>
        <div className="flex items-center gap-3">
          {/* zoom controls */}
          {twoDImages.length > 0 && (
            <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3">
              <button
                type="button"
                onClick={zoomOut}
                disabled={zoom <= ZOOM_MIN}
                className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                title="缩小"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={resetZoom}
                className="min-w-[3.5rem] rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                title="重置缩放"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={zoom >= ZOOM_MAX}
                className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                title="放大"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {twoDImages.length > 0 && (
            <span className="text-xs text-slate-400">{twoDImages.length} 张图片</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
          >
            <Upload className="h-3.5 w-3.5" />
            添加图片
          </button>
        </div>
      </div>

      {/* canvas area */}
      <div
        ref={viewportRef}
        className="relative flex-1 overflow-hidden"
        style={{ cursor: panning ? 'grabbing' : 'default' }}
        onWheel={handleWheel}
        onMouseDown={handleViewportMouseDown}
      >
        {twoDImages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-xl bg-slate-100 p-6">
              <svg
                className="mx-auto h-10 w-10 text-slate-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M4.5 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500">暂无 2D 图片</p>
            <p className="text-xs text-slate-400">
              点击「添加图片」上传，或在设计图中右键元素选择「关联 2D 图」
            </p>
          </div>
        ) : (
          /* world layer: flex row, zoom+pan via transform */
          <div
            style={{
              position: 'absolute',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: IMAGE_GAP,
              padding: 32,
            }}
          >
            {flatImages.map((img, idx) => {
              const isHighlighted = img.id === highlightedImageId;
              const isSelected = img.id === selectedId;
              const isDragging = dragIdx === idx;
              const isDropTarget = dropIdx === idx && dragIdx !== null && dragIdx !== idx;

              return (
                <div
                  key={img.id}
                  ref={isHighlighted ? highlightedRef : undefined}
                  onMouseEnter={() => dragIdx !== null && setDropIdx(idx)}
                  style={{ opacity: isDragging ? 0.4 : 1, flexShrink: 0 }}
                >
                  {/* drop indicator: blue bar on the left edge */}
                  {isDropTarget && (
                    <div
                      style={{
                        position: 'absolute',
                        left: -5,
                        top: 0,
                        bottom: 0,
                        width: 3,
                        borderRadius: 2,
                        background: '#3b82f6',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  <TwoDImageCard
                    image={img}
                    highlighted={isHighlighted}
                    selected={isSelected}
                    isDragging={isDragging}
                    onClick={() => setSelectedId((p) => (p === img.id ? null : img.id))}
                    onMouseDown={(e) => handleImageMouseDown(e, idx)}
                  />
                  {isSelected && !isDragging && (
                    <ImageInfoBox
                      image={img}
                      onRotate={rotateTwoDImage}
                      onRemoveAssociation={clearTwoDImageAssociation}
                      onDelete={(id) => {
                        removeTwoDImage(id);
                        setSelectedId(null);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* hint when selected design element has no 2D image */}
      {selection.kind !== 'none' && highlightedImageId === null && (
        <div className="shrink-0 border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          当前选中的元素尚未关联任何 2D 图片。在设计图中右键该元素可进行关联。
        </div>
      )}
    </div>
  );
}
