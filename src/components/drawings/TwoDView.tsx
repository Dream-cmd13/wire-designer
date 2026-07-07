import { useEffect, useMemo, useRef, useState } from 'react';
import { Link2Off, RotateCw, Trash2, Upload } from 'lucide-react';
import { generateId } from '@/lib/commands';
import { buildTwoDImageGroups } from '@/lib/twoDImageGroups';
import { useHarnessStore } from '@/stores/harnessStore';
import type { TwoDImage } from '@/types/harness';
import { TwoDImageCard } from './TwoDImageCard';

// ── constants ──────────────────────────────────────────────────────────────────
/** Stable empty array — prevents useSyncExternalStore from seeing a new ref each render */
const EMPTY_IMAGES: TwoDImage[] = [];

const IMG_SIZE = 160; // card width/height in px
const GROUP_GAP = 32; // horizontal gap between groups in auto-layout
const INNER_GAP = 4;  // gap between stitched images in auto-layout
const CANVAS_PAD = 24; // padding around content

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
      curX += IMG_SIZE + (i < group.images.length - 1 ? INNER_GAP : 0);
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
  const moveTwoDImage = useHarnessStore((s) => s.moveTwoDImage);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const highlightedRef = useRef<HTMLDivElement>(null);

  // ── drag state ───────────────────────────────────────────────────────────────
  /** What is currently being dragged */
  const [dragging, setDragging] = useState<{
    id: string;
    startMX: number;
    startMY: number;
    startPX: number;
    startPY: number;
  } | null>(null);
  /** Live position while dragging (not yet committed to store) */
  const [dragLive, setDragLive] = useState<{ x: number; y: number } | null>(null);

  // Keep refs in-sync so the effect closures always see latest values
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  const dragLiveRef = useRef(dragLive);
  dragLiveRef.current = dragLive;

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = draggingRef.current;
      if (!d) return;
      setDragLive({
        x: Math.max(0, d.startPX + e.clientX - d.startMX),
        y: Math.max(0, d.startPY + e.clientY - d.startMY),
      });
    }
    function onUp() {
      const d = draggingRef.current;
      const lp = dragLiveRef.current;
      if (d && lp) moveTwoDImage(d.id, lp.x, lp.y);
      setDragging(null);
      setDragLive(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally using refs

  // ── highlighted image (follows canvas selection) ─────────────────────────────
  const highlightedImageId =
    selection.kind !== 'none'
      ? (twoDImages.find(
          (img) =>
            img.elementKind === selection.kind &&
            img.elementId === (selection as { id: string }).id,
        )?.id ?? null)
      : null;

  useEffect(() => {
    if (highlightedImageId) {
      highlightedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightedImageId]);

  // ── auto-layout positions ─────────────────────────────────────────────────────
  const groups = useMemo(
    () => buildTwoDImageGroups(twoDImages, connectors, materials, sleeves, models),
    [twoDImages, connectors, materials, sleeves, models],
  );

  const autoLayout = useMemo(() => computeAutoLayout(groups), [groups]);

  /** Return the effective pixel position for a given image */
  function getPos(img: TwoDImage): { x: number; y: number } {
    if (dragging?.id === img.id && dragLive) return dragLive;
    return img.pos ?? autoLayout[img.id] ?? { x: CANVAS_PAD, y: CANVAS_PAD };
  }

  // ── canvas size: expand to fit all images ─────────────────────────────────────
  const { canvasW, canvasH } = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    for (const img of twoDImages) {
      const pos = img.pos ?? autoLayout[img.id] ?? { x: CANVAS_PAD, y: CANVAS_PAD };
      maxX = Math.max(maxX, pos.x + IMG_SIZE);
      maxY = Math.max(maxY, pos.y + IMG_SIZE + 120); // +120 for info box headroom
    }
    return {
      canvasW: Math.max(800, maxX + CANVAS_PAD),
      canvasH: Math.max(500, maxY + CANVAS_PAD),
    };
  }, [twoDImages, autoLayout]);

  // ── start drag on mousedown ───────────────────────────────────────────────────
  function handleCardMouseDown(e: React.MouseEvent, img: TwoDImage) {
    // Only primary button; let button click fall through
    if (e.button !== 0) return;
    e.preventDefault();
    const pos = getPos(img);
    setDragging({
      id: img.id,
      startMX: e.clientX,
      startMY: e.clientY,
      startPX: pos.x,
      startPY: pos.y,
    });
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
    <div className="flex h-full flex-col bg-slate-50">
      {/* toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="text-sm font-semibold text-slate-700">2D 图</span>
        <div className="flex items-center gap-2">
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
      <div className="flex-1 overflow-auto">
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
          /* free-canvas: images are absolutely positioned */
          <div
            className="relative"
            style={{ width: canvasW, height: canvasH }}
          >
            {twoDImages.map((img) => {
              const pos = getPos(img);
              const isHighlighted = img.id === highlightedImageId;
              const isSelected = img.id === selectedId;
              const isDragging = dragging?.id === img.id;

              return (
                <div
                  key={img.id}
                  ref={isHighlighted ? highlightedRef : undefined}
                  style={{
                    position: 'absolute',
                    left: pos.x,
                    top: pos.y,
                    width: IMG_SIZE,
                    // lift dragged card above others
                    zIndex: isDragging ? 50 : isSelected ? 10 : 1,
                    // no layout transition while dragging; smooth snap on release
                    transition: isDragging ? 'none' : 'left 0.15s, top 0.15s',
                  }}
                >
                  <TwoDImageCard
                    image={img}
                    highlighted={isHighlighted}
                    selected={isSelected}
                    isDragging={isDragging}
                    onClick={() => setSelectedId((p) => (p === img.id ? null : img.id))}
                    onMouseDown={(e) => handleCardMouseDown(e, img)}
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
