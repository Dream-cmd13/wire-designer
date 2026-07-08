import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RotateCw, Trash2, Upload } from 'lucide-react';
import { generateId } from '@/lib/commands';
import { buildTwoDImageGroups, getElementX } from '@/lib/twoDImageGroups';
import { useHarnessStore } from '@/stores/harnessStore';
import type { TwoDImage, CanvasWireMaterial, ConnectorInstance } from '@/types/harness';
import { TwoDImageCard } from './TwoDImageCard';
import { imageAssets } from '@/lib/imageAssets';
import { WIRE_COLORS } from '@/lib/data';

// ── constants ──────────────────────────────────────────────────────────────────
/** Stable empty array — prevents useSyncExternalStore from seeing a new ref each render */
const EMPTY_IMAGES: TwoDImage[] = [];

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.15;

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

function resolveChineseColorName(value: string): string {
  const byId = WIRE_COLORS.find((c) => c.id === value);
  if (byId) return byId.name;
  return value || '灰';
}

function WiringDiagram({
  materials,
  connectors,
}: {
  materials: CanvasWireMaterial[];
  connectors: ConnectorInstance[];
}) {
  const mat = materials[0];
  if (!mat) return null;

  const circuits = mat.circuits || [];
  if (circuits.length === 0) return null;

  // Resolve P1/P2 labels from connectors sorted by X position
  const sortedConns = [...connectors].sort((a, b) => a.position.x - b.position.x);
  const leftConn = sortedConns[0];
  const rightConn = sortedConns.length > 1 ? sortedConns[sortedConns.length - 1] : null;

  const p1Label = leftConn?.label || 'P1';
  const p2Label = rightConn?.label || 'P2';

  const rows = circuits.map((c) => {
    let leftText = '切断';
    let rightText = '切断';

    // Check start endpoint
    if (c.start) {
      if (leftConn && c.start.connectorId === leftConn.id) {
        leftText = String(c.start.pin);
      } else if (rightConn && c.start.connectorId === rightConn.id) {
        rightText = String(c.start.pin);
      }
    }
    // Check end endpoint
    if (c.end) {
      if (leftConn && c.end.connectorId === leftConn.id) {
        leftText = String(c.end.pin);
      } else if (rightConn && c.end.connectorId === rightConn.id) {
        rightText = String(c.end.pin);
      }
    }

    let name = resolveChineseColorName(c.color);
    if (name.endsWith('色')) {
      name = name.slice(0, -1);
    }

    return { leftText, rightText, color: name };
  });

  const allLeftCut = rows.every((r) => r.leftText === '切断');
  const allRightCut = rows.every((r) => r.rightText === '切断');

  const displayRows = rows.map((r) => ({
    ...r,
    leftText: allLeftCut ? r.leftText : (r.leftText === '切断' ? '' : r.leftText),
    rightText: allRightCut ? r.rightText : (r.rightText === '切断' ? '' : r.rightText),
  }));

  return (
    <div 
      className="w-[320px] h-[190px] border border-black bg-white flex flex-col font-sans text-black select-none shadow-sm rounded"
      onMouseDown={(e) => e.stopPropagation()} // prevent drag trigger on inside click
    >
      {/* Title Header */}
      <div className="h-[32px] border-b border-black flex items-center justify-center font-bold text-xs tracking-[0.2em] bg-slate-50">
        接线图
      </div>
      
      {/* Body Area */}
      <div className="flex-1 flex flex-col p-3 relative justify-between">
        {/* P1 and P2 Headers */}
        <div className="flex flex-row justify-between text-xs font-bold px-2 mb-1">
          <span>{p1Label}</span>
          <span>{p2Label}</span>
        </div>

        {/* Content Rows */}
        <div className="flex-1 flex flex-row items-center">
          {/* Left Status (if all cut) */}
          {allLeftCut && (
            <div className="w-[40px] flex flex-col items-center justify-center text-xs font-bold text-slate-900 border-r border-slate-200 h-full pr-2">
              <span className="leading-tight">切</span>
              <span className="leading-tight">断</span>
            </div>
          )}

          {/* Center Lines + Pins */}
          <div className="flex-1 flex flex-col justify-between h-full py-1">
            {displayRows.map((row, idx) => (
              <div key={idx} className="flex flex-row items-center h-[24px]">
                {/* Left Pin number (if not all cut) */}
                {!allLeftCut && (
                  <span className="w-[30px] text-right pr-2 text-xs font-semibold text-slate-800">
                    {row.leftText}
                  </span>
                )}
                
                {/* Line and Color Label */}
                <div className="flex-1 border-b border-black relative h-[12px] mx-1">
                  <span className="absolute left-1/2 -translate-x-1/2 -top-[14px] text-[11px] font-bold text-slate-900 bg-white px-1">
                    {row.color}
                  </span>
                </div>

                {/* Right Pin number (if not all cut) */}
                {!allRightCut && (
                  <span className="w-[30px] text-left pl-2 text-xs font-semibold text-slate-800">
                    {row.rightText}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Right Status (if all cut) */}
          {allRightCut && (
            <div className="w-[40px] flex flex-col items-center justify-center text-xs font-bold text-slate-900 border-l border-slate-200 h-full pl-2">
              <span className="leading-tight">切</span>
              <span className="leading-tight">断</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ImageInfoBox ───────────────────────────────────────────────────────────────
function ImageInfoBox({
  image,
  onRotate,
  onDelete,
  onCollapse,
}: {
  image: TwoDImage;
  onRotate: (id: string) => void;
  onDelete: (id: string) => void;
  onCollapse: () => void;
}) {
  const label = useElementLabel(image.elementKind, image.elementId);
  const rotation = image.rotation ?? 0;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
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
        <button
          type="button"
          onClick={onCollapse}
          className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:border-slate-300 hover:bg-slate-50"
        >
          收起
        </button>
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
  const frameAsset = imageAssets.find((a) => a.name === '图纸图框');
  const frameUrl = frameAsset?.url;

  const twoDImages = useHarnessStore((s) => s.config.twoDImages ?? EMPTY_IMAGES);
  const connectors = useHarnessStore((s) => s.config.connectors);
  const materials = useHarnessStore((s) => s.config.materials);
  const sleeves = useHarnessStore((s) => s.config.protectiveSleeves);
  const models = useHarnessStore((s) => s.config.models);
  const selection = useHarnessStore((s) => s.selection);
  const addTwoDImage = useHarnessStore((s) => s.addTwoDImage);
  const removeTwoDImage = useHarnessStore((s) => s.removeTwoDImage);
  const rotateTwoDImage = useHarnessStore((s) => s.rotateTwoDImage);
  const patchDocument = useHarnessStore((s) => s.patchDocument);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isFitted, setIsFitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // ── drag group position state ─────────────────────────────────────────────
  const [activeDragGroupIdx, setActiveDragGroupIdx] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeDragGroupIdxRef = useRef(activeDragGroupIdx);
  activeDragGroupIdxRef.current = activeDragGroupIdx;

  // ── zoom & pan ───────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const worldRef = useRef<HTMLDivElement>(null);
  const hasCenteredRef = useRef(false);
  const [panning, setPanning] = useState<{
    startMX: number; startMY: number; startPX: number; startPY: number;
  } | null>(null);
  const panningRef = useRef(panning);
  panningRef.current = panning;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // ── flatten groups into sorted display order ──────────────────────────────
  const groups = useMemo(
    () => buildTwoDImageGroups(twoDImages, connectors, materials, sleeves, models),
    [twoDImages, connectors, materials, sleeves, models],
  );

  // Sort all images by their element's x-position individually, ignoring group structure.
  const flatImages = useMemo(() => {
    const allImages = groups.flatMap((g) => g.images);
    return allImages.sort((a, b) => {
      const ax = getElementX(a.elementKind, a.elementId, connectors, materials, sleeves, models);
      const bx = getElementX(b.elementKind, b.elementId, connectors, materials, sleeves, models);
      return ax - bx;
    });
  }, [groups, connectors, materials, sleeves, models]);

  // ── Card and Group size helpers ──────────────────────────────────────────────
  const maxCardHeight = 360;
  const getWeight = (kind: TwoDImage['elementKind']) => {
    if (kind === 'material') return 3;
    if (kind === 'sleeve') return 2;
    return 1;
  };

  const totalWeight = useMemo(() => {
    return flatImages.reduce((sum, img) => sum + getWeight(img.elementKind), 0);
  }, [flatImages]);

  const getCardWidth = useCallback((img: TwoDImage) => {
    const weight = getWeight(img.elementKind);
    return Math.min(600, Math.floor(944 * (weight / Math.max(1, totalWeight))));
  }, [totalWeight]);

  const getGroupWidth = useCallback((g: { images: TwoDImage[] }) => {
    return g.images.reduce((sum, img, idx) => sum + getCardWidth(img) + (idx > 0 ? 4 : 0), 0);
  }, [getCardWidth]);

  const defaultGroupPositions = useMemo(() => {
    const positions: Record<number, { x: number; y: number }> = {};
    const groupSpacing = 32;
    const totalGroupsWidth = groups.reduce((sum, g, idx) => sum + getGroupWidth(g) + (idx > 0 ? groupSpacing : 0), 0);
    const startX = Math.max(64, (1200 - totalGroupsWidth) / 2);
    
    let currentX = startX;
    for (let i = 0; i < groups.length; i++) {
      positions[i] = {
        x: currentX,
        y: 110, 
      };
      currentX += getGroupWidth(groups[i]) + groupSpacing;
    }
    return positions;
  }, [groups, getGroupWidth]);

  const getGroupPosition = useCallback((groupIdx: number) => {
    const group = groups[groupIdx];
    const firstImg = group.images[0];
    if (firstImg && firstImg.pos) {
      return { x: firstImg.pos.x, y: firstImg.pos.y };
    }
    return defaultGroupPositions[groupIdx];
  }, [groups, defaultGroupPositions]);

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
        return;
      }

      // drag group
      const gIdx = activeDragGroupIdxRef.current;
      if (gIdx !== null && dragStartPos) {
        const dx = (e.clientX - dragStartPos.x) / zoomRef.current;
        const dy = (e.clientY - dragStartPos.y) / zoomRef.current;
        setDragOffset({ x: dx, y: dy });
      }
    }
    function onUp() {
      const gIdx = activeDragGroupIdxRef.current;
      if (gIdx !== null && dragStartPos && (dragOffset.x !== 0 || dragOffset.y !== 0)) {
        const group = groups[gIdx];
        const basePos = getGroupPosition(gIdx);
        const newX = basePos.x + dragOffset.x;
        const newY = basePos.y + dragOffset.y;

        // Update all images in this group with their new absolute pos, maintaining relative horizontal offset
        const nextImages = twoDImages.map((img) => {
          const imgInGroupIdx = group.images.findIndex((gImg) => gImg.id === img.id);
          if (imgInGroupIdx !== -1) {
            let offsetK = 0;
            for (let i = 0; i < imgInGroupIdx; i++) {
              offsetK += getCardWidth(group.images[i]) + 4;
            }
            return {
              ...img,
              pos: { x: newX + offsetK, y: newY },
            };
          }
          return img;
        });

        patchDocument({ twoDImages: nextImages });
      }
      setActiveDragGroupIdx(null);
      setDragStartPos(null);
      setDragOffset({ x: 0, y: 0 });
      setPanning(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragStartPos, dragOffset, groups, twoDImages, getGroupPosition, getCardWidth, patchDocument]);

  // ── highlighted image (follows canvas selection) ─────────────────────────────
  const highlightedImageId =
    selection.kind !== 'none'
      ? (flatImages.find(
          (img) =>
            img.elementKind === selection.kind &&
            img.elementId === (selection as { id: string }).id,
        )?.id ?? null)
      : null;

  // ── close context menu on click ───────────────────────────────────────────────
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

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

  const fitToCanvas = useCallback(() => {
    const vp = viewportRef.current;
    const world = worldRef.current;
    if (!vp || !world) return;
    const vpW = vp.offsetWidth;
    const vpH = vp.offsetHeight;
    const worldW = world.offsetWidth;
    const worldH = world.offsetHeight;
    if (worldW === 0 || worldH === 0) return;
    const scaleX = (vpW - 64) / worldW;
    const scaleY = (vpH - 64) / worldH;
    const newZoom = clampZoom(Math.min(scaleX, scaleY, 1));
    setZoom(newZoom);
    setPan({
      x: (vpW - worldW * newZoom) / 2,
      y: (vpH - worldH * newZoom) / 2,
    });
  }, []);

  // ── fit content to canvas when images first appear ───────────────────────────
  useEffect(() => {
    if (twoDImages.length === 0) {
      hasCenteredRef.current = false;
      setIsFitted(false);
      return;
    }
    if (hasCenteredRef.current) return;
    const timer = setTimeout(() => {
      fitToCanvas();
      hasCenteredRef.current = true;
      setIsFitted(true);
    }, 50);
    return () => clearTimeout(timer);
  }, [twoDImages.length, fitToCanvas]);

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

  /** Left or middle mouse button starts canvas panning on the viewport background */
  const handleViewportMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    setPanning({
      startMX: e.clientX,
      startMY: e.clientY,
      startPX: pan.x,
      startPY: pan.y,
    });
  }, [pan]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // ── drag group mousedown ──────────────────────────────────────────────────────
  function handleImageMouseDown(e: React.MouseEvent, groupIdx: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation(); // prevent viewport pan when dragging images
    setActiveDragGroupIdx(groupIdx);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setDragOffset({ x: 0, y: 0 });
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
        style={{ cursor: panning ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleViewportMouseDown}
        onContextMenu={handleContextMenu}
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
            ref={worldRef}
            style={{
              position: 'absolute',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              minWidth: 1200,
              minHeight: 800,
              maxWidth: 1200,
              maxHeight: 800,
              backgroundImage: frameUrl ? `url(${frameUrl})` : 'none',
              backgroundSize: '100% 100%',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              opacity: isFitted ? 1 : 0,
              transition: 'opacity 0.15s ease-in-out',
            }}
          >
            {(() => {
              return groups.map((group, groupIdx) => {
                const isDraggingThis = activeDragGroupIdx === groupIdx;
                const basePos = getGroupPosition(groupIdx);
                const x = basePos.x + (isDraggingThis ? dragOffset.x : 0);
                const y = basePos.y + (isDraggingThis ? dragOffset.y : 0);

                return (
                  <div
                    key={groupIdx}
                    style={{
                      position: 'absolute',
                      left: x,
                      top: y,
                      opacity: isDraggingThis ? 0.6 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 24,
                      border: '1px dashed transparent',
                      borderRadius: '8px',
                      padding: '4px',
                      cursor: isDraggingThis ? 'grabbing' : 'grab',
                    }}
                    className="group/assembly hover:border-slate-200 hover:bg-slate-50/30 transition-colors"
                  >
                    {/* Top Row: image cards */}
                    <div className="flex flex-row items-center gap-4">
                      {group.images.map((img) => {
                        const isHighlighted = img.id === highlightedImageId;
                        const isSelected = img.id === selectedId;

                        const cardWidth = getCardWidth(img);

                        return (
                          <div
                            key={img.id}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              position: 'relative',
                            }}
                          >
                            <TwoDImageCard
                              image={img}
                              highlighted={isHighlighted}
                              selected={isSelected}
                              onClick={() => setSelectedId((p) => (p === img.id ? null : img.id))}
                              onMouseDown={(e) => handleImageMouseDown(e, groupIdx)}
                              maxWidth={cardWidth}
                              maxHeight={maxCardHeight}
                            />
                            {isSelected && (
                              <div className="absolute top-full left-1/2 -translate-x-1/2 z-20 mt-2">
                                <ImageInfoBox
                                  image={img}
                                  onRotate={rotateTwoDImage}
                                  onCollapse={() => setSelectedId(null)}
                                  onDelete={(id) => {
                                    removeTwoDImage(id);
                                    setSelectedId(null);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom Row: Wiring Diagram */}
                    {(() => {
                      const groupMaterials = materials.filter(m => group.images.some(img => img.elementKind === 'material' && img.elementId === m.id));
                      const groupConnectors = connectors.filter(c => group.images.some(img => img.elementKind === 'connector' && img.elementId === c.id));
                      return groupMaterials.length > 0 ? (
                        <WiringDiagram materials={groupMaterials} connectors={groupConnectors} />
                      ) : null;
                    })()}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>


      {/* right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => { fitToCanvas(); setContextMenu(null); }}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            适配画布
          </button>
          <button
            type="button"
            onClick={() => { resetZoom(); setContextMenu(null); }}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            重置缩放
          </button>
        </div>
      )}
    </div>
  );
}
