import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Edit3, FileImage, FileText, Loader2, Maximize2, Minus, Plus } from 'lucide-react';
import { buildTwoDImageGroups, getElementX } from '@/lib/twoDImageGroups';
import { useHarnessStore } from '@/stores/harnessStore';
import type {
  TwoDImage,
  CanvasWireMaterial,
  ConnectorInstance,
  HarnessConfig,
  OvermoldSpec,
} from '@/types/harness';
import {
  getProductDrawingFilename,
  exportProductDrawingPng,
  exportProductDrawingPdf,
} from '@/lib/productImageExport';
import { TwoDImageCard } from './TwoDImageCard';
import { WireDimensionAnnotation } from './WireDimensionAnnotation';
import { ProductionDrawingFrameSvg } from './ProductionDrawingFrameSvg';
import { DrawingFrameEditDialog } from './DrawingFrameEditDialog';
import { ensureDrawingFrame, DEFAULT_TECHNICAL_REQUIREMENTS } from '@/lib/drawingFrameDefaults';
import { useUserStore } from '@/stores/userStore';
import { getCatalogSnapshot } from '@/lib/catalogRuntime';
import { useCatalogStore } from '@/stores/catalogStore';
import { generateBOM, formatWireBomSpecification } from '@/lib/bom';
import {
  getCanvasModelDisplayName,
  getProtectiveSleeveDisplayName,
  getMoldLinkage,
} from '@/lib/canvasMaterials';
import {
  calculateProductionDrawingLayout,
  countProductionBomRows,
  type ProductionDrawingLayout,
} from '@/lib/productionDrawingLayout';
import { getWiringConnectorLabels } from '@/lib/connectorDesignation';
import { buildOvermoldBomEntries } from '@/lib/overmoldSpec';
import {
  formatPinNetworkString,
  getWiringDiagramColumns,
  calculateWiringDiagramWidth,
} from '@/lib/wiringDiagramLayout';

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
  const models = useHarnessStore((s) => s.config.models);
  const sleeves = useHarnessStore((s) => s.config.protectiveSleeves);

  if (!elementKind || !elementId) return '';
  if (elementKind === 'connector') {
    const c = connectors.find((x) => x.id === elementId);
    return c ? `连接器 · ${c.label || c.id}` : `连接器 · ${elementId}`;
  }
  if (elementKind === 'material') {
    const m = materials.find((x) => x.id === elementId);
    return m ? `线材 · ${m.name}` : `线材 · ${elementId}`;
  }
  if (elementKind === 'sleeve') {
    const s = sleeves.find((x) => x.id === elementId);
    return s ? getProtectiveSleeveDisplayName(s) : `保护套 · ${elementId}`;
  }
  if (elementKind === 'model') {
    const m = models.find((x) => x.id === elementId);
    return m ? getCanvasModelDisplayName(m) : `外模 · ${elementId}`;
  }
  return elementId;
}

function resolveChineseColorName(value: string): string {
  const byId = getCatalogSnapshot()?.wireColors.find((c) => c.id === value);
  if (byId) return byId.name;
  return value || '灰';
}

function WiringDiagram({
  materials,
  connectors,
  layout,
}: {
  materials: CanvasWireMaterial[];
  connectors: ConnectorInstance[];
  layout: ProductionDrawingLayout['wiringDiagram'];
}) {
  const mat = materials[0];
  if (!mat) return null;

  const circuits = mat.circuits || [];
  if (circuits.length === 0) return null;

  const { orderedConnectors } = getWiringConnectorLabels(connectors, materials);
  const numCols = Math.max(2, orderedConnectors.length);

  const rows = circuits.map((c) => {
    let name = resolveChineseColorName(c.color);
    if (name.endsWith('色')) {
      name = name.slice(0, -1);
    }

    const startConnId = c.start?.connectorId;
    const endConnId = c.end?.connectorId;

    const startIdx = startConnId ? orderedConnectors.findIndex((x) => x.id === startConnId) : -1;
    const endIdx = endConnId ? orderedConnectors.findIndex((x) => x.id === endConnId) : -1;

    // Pin strings for each column
    const pins: string[] = [];
    for (let i = 0; i < numCols; i++) {
      const connInfo = orderedConnectors[i];
      if (!connInfo) {
        pins.push('');
        continue;
      }
      if (startIdx === i && c.start) {
        pins.push(formatPinNetworkString(connInfo.connector, c.start.connectorSide, c.start.pin));
      } else if (endIdx === i && c.end) {
        pins.push(formatPinNetworkString(connInfo.connector, c.end.connectorSide, c.end.pin));
      } else {
        pins.push('');
      }
    }

    // Active segments between adjacent connector columns (total numCols - 1 segments)
    let minIdx = -1;
    let maxIdx = -1;
    if (startIdx !== -1 && endIdx !== -1) {
      minIdx = Math.min(startIdx, endIdx);
      maxIdx = Math.max(startIdx, endIdx);
    } else if (startIdx !== -1) {
      minIdx = startIdx;
      maxIdx = Math.min(numCols - 1, startIdx + 1);
    } else if (endIdx !== -1) {
      maxIdx = endIdx;
      minIdx = Math.max(0, endIdx - 1);
    }

    const segments: boolean[] = [];
    for (let k = 0; k < numCols - 1; k++) {
      segments.push(minIdx !== -1 && maxIdx !== -1 && k >= minIdx && k < maxIdx);
    }

    return {
      pins,
      segments,
      color: name,
      isCutStart: !c.start,
      isCutEnd: !c.end,
    };
  });

  const allLeftCut = rows.every((r) => r.isCutStart);
  const allRightCut = rows.every((r) => r.isCutEnd);

  const columns = getWiringDiagramColumns({
    numCols,
    orderedConnectors,
    allLeftCut,
    allRightCut,
  });

  const { diagramWidth } = calculateWiringDiagramWidth({
    numCols,
    allLeftCut,
    allRightCut,
    baseWidth: layout.width,
  });

  const bodyHeight = layout.height - layout.headerHeight;
  const rowHeight = Math.max(22, Math.floor((bodyHeight - 38) / Math.max(1, rows.length)));

  return (
    <div 
      className="border border-black bg-white flex flex-col font-serif text-black select-none shadow-sm rounded overflow-hidden"
      style={{
        fontFamily: 'SimSun, STSong, "Songti SC", serif',
        width: diagramWidth,
        height: layout.height,
        boxSizing: 'border-box',
      }}
      onMouseDown={(e) => e.stopPropagation()} // prevent drag trigger on inside click
    >
      {/* Title Header */}
      <div
        className="shrink-0 border-b border-black flex items-center justify-center font-bold text-xs tracking-[0.25em]"
        style={{ height: layout.headerHeight, backgroundColor: 'rgba(248, 250, 252, 0.5)' }}
      >
        接线图
      </div>
      
      {/* Body Area */}
      <div className="flex-1 flex flex-col p-2 relative justify-between overflow-hidden">
        {/* P1, P2, P3... Headers aligned exactly with Pin columns below */}
        <div className="flex flex-row items-center text-[10px] leading-tight font-bold mb-1">
          <div className="flex-1 flex flex-row items-center">
            {columns.map((col, idx) => (
              <React.Fragment key={idx}>
                <span
                  style={{ width: col.width }}
                  className={`shrink-0 ${col.alignClass} truncate`}
                  title={col.label}
                >
                  {col.label}
                </span>
                {idx < numCols - 1 && <div className="flex-1 min-w-[20px]" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content Rows */}
        <div className="flex-1 flex flex-row items-center">
          {/* Left Status (if all cut) */}
          {allLeftCut && (
            <div style={{ width: 70 }} className="flex flex-row h-full shrink-0">
              <div
                style={{ width: 35 }}
                className="flex flex-col items-center justify-center text-xs font-bold text-black border-r border-black h-full pr-1 shrink-0"
              >
                <span className="leading-tight">切</span>
                <span className="leading-tight">断</span>
              </div>
              <div style={{ width: 35 }} className="shrink-0" />
            </div>
          )}

          {/* Center Lines + Pins */}
          <div className="flex-1 flex flex-col justify-between h-full py-1">
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="flex flex-row items-center" style={{ height: rowHeight }}>
                {/* Column 0 Pin (only if not left cut) */}
                {!allLeftCut && (
                  <span
                    style={{ width: 70 }}
                    className="shrink-0 text-xs font-bold text-black text-center whitespace-nowrap"
                  >
                    {row.pins[0] || ''}
                  </span>
                )}

                {/* Segments and subsequent columns */}
                {Array.from({ length: numCols - 1 }).map((_, segIdx) => {
                  const targetColIdx = segIdx + 1;
                  const isLastCol = targetColIdx === numCols - 1;
                  const showPin = !(isLastCol && allRightCut);
                  const targetCol = columns[targetColIdx];

                  return (
                    <React.Fragment key={segIdx}>
                      {/* Segment Column (between segIdx and segIdx + 1) */}
                      <div className="flex-1 flex flex-col justify-end h-full relative pb-1 min-w-[20px] px-0">
                        {row.segments[segIdx] ? (
                          <>
                            <span className="text-center text-[11px] font-bold text-black mb-0.5 whitespace-nowrap">
                              {row.color}
                            </span>
                            <div className="w-full border-b border-black" />
                          </>
                        ) : (
                          <div className="w-full h-[1px]" />
                        )}
                      </div>

                      {/* Pin Column (if not right cut) */}
                      {showPin && (
                        <span
                          style={{ width: targetCol?.width ?? 70 }}
                          className={`shrink-0 text-xs font-bold text-black ${targetCol?.alignClass ?? 'text-center px-1'} whitespace-nowrap`}
                        >
                          {row.pins[targetColIdx] || ''}
                        </span>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Right Status (if all cut) */}
          {allRightCut && (
            <div style={{ width: 70 }} className="flex flex-row h-full shrink-0">
              <div style={{ width: 35 }} className="shrink-0" />
              <div
                style={{ width: 35 }}
                className="flex flex-col items-center justify-center text-xs font-bold text-black border-l border-black h-full pl-1 shrink-0"
              >
                <span className="leading-tight">切</span>
                <span className="leading-tight">断</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SlashHeaderCell({
  topText,
  bottomText,
  width,
}: {
  topText: string;
  bottomText: string;
  width: string;
}) {
  return (
    <div 
      className="relative h-[36px] flex items-center justify-center border-r border-black select-none shrink-0"
      style={{ width }}
    >
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <line x1="0" y1="100%" x2="100%" y2="0" stroke="black" strokeWidth="1" />
      </svg>
      <span className="absolute top-[2px] left-[4px] text-[9px] font-bold leading-none scale-90 origin-top-left">
        {topText}
      </span>
      <span className="absolute bottom-[2px] right-[4px] text-[8px] font-bold leading-none scale-90 origin-bottom-right">
        {bottomText}
      </span>
    </div>
  );
}

function BOMTable({
  config,
  layout,
  overmolds,
}: {
  config: HarnessConfig;
  layout: ProductionDrawingLayout;
  overmolds: readonly OvermoldSpec[];
}) {
  const bomItems = generateBOM(config);
  
  interface BOMTableRow {
    itemNo: number;
    name: string;
    spec: string;
    unit: string;
    qty: number;
  }
  
  const rows: BOMTableRow[] = [];
  
  // 1. Add wires
  const wireItems = bomItems.filter(i => i.type === 'wire');
  wireItems.forEach((wi) => {
    let wireSpec = wi.description;
    const matObj = config.materials.find((m: CanvasWireMaterial) => {
      if (wi.resourceItemId) return m.resourceItemId === wi.resourceItemId;
      const spec = m.spec;
      if (spec.kind === 'electronic') {
        return wi.description.includes(`${spec.awg}AWG`) && wi.description.includes(spec.color);
      } else {
        return wi.description.includes(`${spec.coreCount}芯`) && wi.description.includes(`${spec.awg}AWG`);
      }
    });

    if (matObj) {
      wireSpec = formatWireBomSpecification(matObj, getCatalogSnapshot());
    }

    rows.push({
      itemNo: 1,
      name: '线材',
      spec: wireSpec,
      unit: 'PCS',
      qty: wi.quantity,
    });
  });

  // 2. Add connectors
  const connItems = bomItems.filter(i => i.type === 'connector');
  connItems.forEach((ci) => {
    const specCode = ci.model || ci.partNumber || ci.description;
    rows.push({
      itemNo: 2,
      name: '连接器',
      spec: specCode,
      unit: 'PCS',
      qty: ci.quantity,
    });
  });

  // 3. Add overmolds
  if (config.models && config.models.length > 0) {
    const overmoldEntries = buildOvermoldBomEntries(config.models, overmolds);
    overmoldEntries.forEach((entry) => {
      rows.push({
        itemNo: 3,
        name: entry.kind === 'outer' ? '外模料' : '内模料',
        spec: entry.specification,
        unit: 'PCS',
        qty: entry.quantity,
      });
    });
  }

  // 4. Add heat shrink tubes or other accessories
  const sleeveItems = bomItems.filter(i => i.type === 'accessory');
  sleeveItems.forEach((si) => {
    let name = '保护套管';
    if (si.description.includes('波纹管')) {
      name = '波纹管';
    } else if (si.description.includes('网管') || si.description.includes('braided')) {
      name = '编织网管';
    } else if (si.description.includes('热缩管') || si.description.includes('heat-shrink')) {
      name = '热缩管';
    } else if (si.description.includes('胶带')) {
      name = '胶带';
    }

    rows.push({
      itemNo: 4,
      name,
      spec: si.description,
      unit: 'PCS',
      qty: si.quantity,
    });
  });

  // Assign final sequential item numbers
  rows.forEach((r, idx) => {
    r.itemNo = idx + 1;
  });

  const circledNums = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

  // Table rows rendered in reverse order (bottom-to-top)
  const sortedRows = [...rows].sort((a, b) => b.itemNo - a.itemNo);

  return (
    <div 
      className="absolute bg-white border border-black text-black select-none shadow-sm font-serif"
      style={{
        bottom: layout.bom.bottom,
        right: layout.bom.right,
        width: layout.bom.width,
        fontFamily: 'SimSun, STSong, "Songti SC", serif',
        boxSizing: 'border-box',
      }}
      onMouseDown={(e) => e.stopPropagation()} // prevent viewport drag
    >
      {/* Items (stacked upwards) */}
      <div className="flex flex-col">
        {sortedRows.map((row) => (
          <div
            key={row.itemNo}
            className="flex flex-row border-b border-black items-stretch text-[10px] font-semibold min-h-[34px]"
          >
            {/* ITEM No */}
            <div className="w-[45px] border-r border-black flex items-center justify-center text-xs font-bold shrink-0 self-stretch">
              {circledNums[row.itemNo - 1] || row.itemNo}
            </div>
            {/* NAME */}
            <div className="w-[65px] border-r border-black flex items-center justify-center text-[11px] shrink-0 self-stretch">
              {row.name}
            </div>
            {/* SPECIFICATION */}
            <div className="flex-1 border-r border-black flex items-center px-3 py-1.5 whitespace-pre-line leading-[14px] text-[10px] break-words self-stretch">
              {row.spec}
            </div>
            {/* UNIT */}
            <div className="w-[45px] border-r border-black flex items-center justify-center text-[11px] shrink-0 self-stretch">
              {row.unit}
            </div>
            {/* QTY */}
            <div className="w-[45px] flex items-center justify-center text-xs font-bold shrink-0 self-stretch">
              {row.qty}
            </div>
          </div>
        ))}
        
        {/* Table Header (at the bottom) */}
        <div
          className="flex flex-row text-[10px] font-bold"
          style={{ height: layout.bom.headerHeight, backgroundColor: 'rgba(248, 250, 252, 0.5)' }}
        >
          <SlashHeaderCell topText="序号" bottomText="ITEM" width="45px" />
          <SlashHeaderCell topText="名称" bottomText="NAME" width="65px" />
          
          {/* SPECIFICATION Header */}
          <div className="flex-1 border-r border-black h-full flex items-center justify-center tracking-wider text-xs">
            规格/NAME&DESCRIPTION
          </div>
          
          <SlashHeaderCell topText="单位" bottomText="UNIT" width="45px" />
          <SlashHeaderCell topText="用量" bottomText="DSE" width="45px" />
        </div>
      </div>
    </div>
  );
}


// ── ImageInfoBox ───────────────────────────────────────────────────────────────
function ImageInfoBox({
  image,
  onCollapse,
}: {
  image: TwoDImage;
  onCollapse: () => void;
}) {
  const label = useElementLabel(image.elementKind, image.elementId);

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
          onClick={onCollapse}
          className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
        >
          收起
        </button>
      </div>
    </div>
  );
}

// ── main view ──────────────────────────────────────────────────────────────────
export function TwoDView() {
  const reloadCatalog = useCatalogStore((state) => state.reload);
  const catalogOvermolds = useCatalogStore((state) => state.snapshot?.overmolds);
  const retryingImagesRef = useRef(new Set<string>());
  const currentUser = useUserStore((s) => s.currentUser);
  const config = useHarnessStore((s) => s.config);
  const updateDrawingFrame = useHarnessStore((s) => s.updateDrawingFrame);
  const drawingFrame = useMemo(
    () => ensureDrawingFrame(config.drawingFrame, currentUser, config),
    [currentUser, config],
  );
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editFocusField, setEditFocusField] = useState<string | undefined>();
  const twoDImages = useHarnessStore((s) => s.config.twoDImages ?? EMPTY_IMAGES);
  const connectors = useHarnessStore((s) => s.config.connectors);
  const materials = useHarnessStore((s) => s.config.materials);
  const sleeves = useHarnessStore((s) => s.config.protectiveSleeves);
  const models = useHarnessStore((s) => s.config.models);
  const selection = useHarnessStore((s) => s.selection);
  const updateMaterial = useHarnessStore((s) => s.updateMaterial);
  const patchDocument = useHarnessStore((s) => s.patchDocument);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isFitted, setIsFitted] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // ── drag group position state ─────────────────────────────────────────────
  const [activeDragGroupIdx, setActiveDragGroupIdx] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeDragGroupIdxRef = useRef(activeDragGroupIdx);
  const [groupDimensions, setGroupDimensions] = useState<Record<number, { w: number; h: number }>>({});
  const groupRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [wireOffsets, setWireOffsets] = useState<Record<number, number>>({});
  const topRowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const wireContainerRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // ── zoom & pan ───────────────────────────────────────────────────────────────
  const savedTwoDViewport = useHarnessStore.getState().twoDViewport;
  const [zoom, setZoom] = useState(savedTwoDViewport?.zoom ?? 1);
  const [pan, setPan] = useState(savedTwoDViewport?.pan ?? { x: 0, y: 0 });
  const worldRef = useRef<HTMLDivElement>(null);
  const hasCenteredRef = useRef(Boolean(savedTwoDViewport));
  const [panning, setPanning] = useState<{
    startMX: number; startMY: number; startPX: number; startPY: number;
  } | null>(null);
  const panningRef = useRef(panning);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    useHarnessStore.getState().setTwoDViewport({ zoom, pan });
  }, [zoom, pan]);

  useEffect(() => {
    activeDragGroupIdxRef.current = activeDragGroupIdx;
  }, [activeDragGroupIdx]);

  useEffect(() => {
    panningRef.current = panning;
  }, [panning]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // ── flatten groups into sorted display order ──────────────────────────────
  const groups = useMemo(
    () => buildTwoDImageGroups(twoDImages, connectors, materials, sleeves, models),
    [twoDImages, connectors, materials, sleeves, models],
  );
  const hasWiringDiagram = useMemo(
    () => groups.some((group) => group.images.some((img) => img.elementKind === 'material')),
    [groups],
  );
  const bomRowCount = useMemo(
    () => countProductionBomRows(config, catalogOvermolds ?? []),
    [config, catalogOvermolds],
  );
  const productionLayout = useMemo(
    () => calculateProductionDrawingLayout({ bomRowCount, hasWiringDiagram }),
    [bomRowCount, hasWiringDiagram],
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

  // ── measure exact DOM dimensions and wire offset (in local unscaled layout coordinates) ──
  const measureGroupDimensions = useCallback(() => {
    for (let idx = 0; idx < groups.length; idx++) {
      const groupEl = groupRefs.current[idx];
      if (groupEl) {
        const w = groupEl.offsetWidth;
        const h = groupEl.offsetHeight;
        if (w > 0 && h > 0) {
          setGroupDimensions((prev) => {
            if (prev[idx]?.w === w && prev[idx]?.h === h) return prev;
            return { ...prev, [idx]: { w, h } };
          });
        }
      }

      const topRowEl = topRowRefs.current[idx];
      const wireEl = wireContainerRefs.current[idx];
      if (topRowEl && wireEl) {
        let exactOffset = 0;
        if (wireEl.offsetParent === topRowEl) {
          const wireCenter = wireEl.offsetLeft + wireEl.offsetWidth / 2;
          const topRowCenter = topRowEl.offsetWidth / 2;
          exactOffset = Math.round(wireCenter - topRowCenter);
        } else {
          const topRowRect = topRowEl.getBoundingClientRect();
          const wireRect = wireEl.getBoundingClientRect();
          const currentZoom = zoomRef.current || 1;
          if (topRowRect.width > 0 && wireRect.width > 0) {
            const wireCenter = (wireRect.left + wireRect.width / 2) / currentZoom;
            const topRowCenter = (topRowRect.left + topRowRect.width / 2) / currentZoom;
            exactOffset = Math.round(wireCenter - topRowCenter);
          }
        }

        setWireOffsets((prev) => {
          if (prev[idx] === exactOffset) return prev;
          return { ...prev, [idx]: exactOffset };
        });
      }
    }
  }, [groups]);

  useLayoutEffect(() => {
    measureGroupDimensions();

    const ro = new ResizeObserver(() => {
      measureGroupDimensions();
    });

    for (let idx = 0; idx < groups.length; idx++) {
      const groupEl = groupRefs.current[idx];
      const topRowEl = topRowRefs.current[idx];
      const wireEl = wireContainerRefs.current[idx];
      if (groupEl) ro.observe(groupEl);
      if (topRowEl) ro.observe(topRowEl);
      if (wireEl) ro.observe(wireEl);
    }

    return () => {
      ro.disconnect();
    };
  }, [groups, measureGroupDimensions]);

  // ── Card and Group size helpers ──────────────────────────────────────────────
  const maxCardHeight = productionLayout.maxImageHeight;
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

  const getGroupWidth = useCallback(
    (groupIdx: number, g: { images: TwoDImage[] }) => {
      const measured = groupDimensions[groupIdx]?.w;
      if (measured && measured > 0) return measured;
      const domNode = groupRefs.current[groupIdx];
      if (domNode && domNode.offsetWidth > 0) return domNode.offsetWidth;
      // Fallback estimate based on realistic card widths
      const hasWiring = g.images.some((img) => img.elementKind === 'material');
      const approxCardsWidth = g.images.reduce((sum, img) => sum + (img.elementKind === 'material' ? 240 : 80), 0);
      return Math.max(approxCardsWidth, hasWiring ? productionLayout.wiringDiagram.width : 0, 400);
    },
    [groupDimensions, productionLayout.wiringDiagram.width],
  );

  const defaultGroupPositions = useMemo(() => {
    const positions: Record<number, { x: number; y: number }> = {};
    const groupSpacing = 32;
    const totalGroupsWidth = groups.reduce(
      (sum, g, idx) => sum + getGroupWidth(idx, g) + (idx > 0 ? groupSpacing : 0),
      0,
    );
    const startX = Math.max(64, (1200 - totalGroupsWidth) / 2);

    let currentX = startX;
    for (let i = 0; i < groups.length; i++) {
      positions[i] = {
        x: currentX,
        y: productionLayout.assemblyTop,
      };
      currentX += getGroupWidth(i, groups[i]) + groupSpacing;
    }
    return positions;
  }, [groups, getGroupWidth, productionLayout.assemblyTop]);

  const techRequirementsTop = useMemo(() => {
    const rawReqs = drawingFrame.technicalRequirements ?? DEFAULT_TECHNICAL_REQUIREMENTS;
    const lines = rawReqs
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l, idx, arr) => l.length > 0 || idx < arr.length - 1);
    if (lines.length === 0) return 667;
    const lineHeight = 23;
    const totalHeight = (lines.length - 1) * lineHeight;
    const baselineBottom = 650;
    const startY = Math.min(520, baselineBottom - totalHeight);
    return startY - 18;
  }, [drawingFrame.technicalRequirements]);

  const getGroupFallbackHeight = useCallback(
    (group: { images: TwoDImage[] }) => {
      const groupHasWiring = group.images.some((img) => img.elementKind === 'material');
      const approxImageRowHeight = Math.min(130, maxCardHeight > 0 ? maxCardHeight : 130);
      const wiringHeight = groupHasWiring
        ? productionLayout.assemblyGap + productionLayout.wiringDiagram.height
        : 0;
      return approxImageRowHeight + wiringHeight + 16;
    },
    [maxCardHeight, productionLayout.assemblyGap, productionLayout.wiringDiagram.height],
  );

  const getGroupHeight = useCallback(
    (groupIdx: number, group: { images: TwoDImage[] }) => {
      const measured = groupDimensions[groupIdx]?.h;
      if (measured && measured > 0) return measured;
      const domNode = groupRefs.current[groupIdx];
      if (domNode && domNode.offsetHeight > 0) return domNode.offsetHeight;
      return getGroupFallbackHeight(group);
    },
    [groupDimensions, getGroupFallbackHeight],
  );

  const clampGroupPosition = useCallback(
    (position: { x: number; y: number }, group: { images: TwoDImage[] }, groupIdx: number) => {
      const rawGroupWidth = getGroupWidth(groupIdx, group);
      const groupHeight = getGroupHeight(groupIdx, group);
      const exactOffset = wireOffsets[groupIdx] ?? 0;

      // Calculate relative horizontal bounds of the group (including top row and shifted wiring diagram)
      const hasWiring = group.images.some((img) => img.elementKind === 'material');
      const diagramWidth = hasWiring ? productionLayout.wiringDiagram.width : 0;
      const minRelX = hasWiring
        ? Math.min(0, (rawGroupWidth - diagramWidth) / 2 + exactOffset)
        : 0;
      const maxRelX = hasWiring
        ? Math.max(rawGroupWidth, (rawGroupWidth + diagramWidth) / 2 + exactOffset)
        : rawGroupWidth;

      // Horizontal boundaries (inside drawing border x: 22..1176)
      // Visual left: position.x + minRelX >= 26 => position.x >= 26 - minRelX
      // Visual right: position.x + maxRelX <= 1174 => position.x <= 1174 - maxRelX
      const minX = Math.max(26, 26 - minRelX);
      const maxX = Math.max(minX, 1174 - maxRelX);
      const clampedX = Math.max(minX, Math.min(position.x, maxX));

      // Vertical boundaries:
      // Top boundary (below top border / compliance note box at y: 22..46)
      const minY = 56;

      // Bottom obstacle detection:
      // - Technical requirements (bottom-left): x: ~26..560
      // - BOM table (bottom-right): x: ~536..1176
      const safeGap = 12;
      const bomTop = productionLayout.bomRect.top;
      const visualLeft = clampedX + minRelX;
      const visualRight = clampedX + maxRelX;
      const overlapsBom = visualRight >= 530;
      const overlapsTechReq = visualLeft <= 550;

      let obstacleTop = 667;
      if (overlapsBom && overlapsTechReq) {
        obstacleTop = Math.min(bomTop, techRequirementsTop);
      } else if (overlapsBom) {
        obstacleTop = bomTop;
      } else if (overlapsTechReq) {
        obstacleTop = techRequirementsTop;
      } else {
        obstacleTop = 667;
      }

      const maxY = Math.max(minY, obstacleTop - safeGap - groupHeight);
      const clampedY = Math.max(minY, Math.min(position.y, maxY));

      return {
        x: clampedX,
        y: clampedY,
      };
    },
    [getGroupWidth, getGroupHeight, wireOffsets, productionLayout.wiringDiagram.width, productionLayout.bomRect.top, techRequirementsTop],
  );

  const getGroupPosition = useCallback(
    (groupIdx: number) => {
      const group = groups[groupIdx];
      if (!group) return { x: 64, y: productionLayout.assemblyTop };
      const firstImg = group.images[0];
      if (firstImg && firstImg.pos) {
        return clampGroupPosition({ x: firstImg.pos.x, y: firstImg.pos.y }, group, groupIdx);
      }
      return clampGroupPosition(
        defaultGroupPositions[groupIdx] || { x: 64, y: productionLayout.assemblyTop },
        group,
        groupIdx,
      );
    },
    [clampGroupPosition, groups, defaultGroupPositions, productionLayout.assemblyTop],
  );

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
        if (group) {
          const basePos = getGroupPosition(gIdx);
          const newX = basePos.x + dragOffset.x;
          const newY = basePos.y + dragOffset.y;
          const nextPos = clampGroupPosition({ x: newX, y: newY }, group, gIdx);

          // Update all images in this group with their new absolute pos, maintaining relative horizontal offset
          const nextImages = twoDImages.map((img) => {
            const imgInGroupIdx = group.images.findIndex((gImg) => gImg.id === img.id);
            if (imgInGroupIdx !== -1) {
              let offsetK = 0;
              for (let i = 0; i < imgInGroupIdx; i++) {
                offsetK += getCardWidth(group.images[i]);
              }
              return {
                ...img,
                pos: { x: nextPos.x + offsetK, y: nextPos.y },
              };
            }
            return img;
          });

          patchDocument({ twoDImages: nextImages });
        }
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
  }, [dragStartPos, dragOffset, groups, twoDImages, getGroupPosition, getCardWidth, patchDocument, clampGroupPosition]);

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

  // ── close export menu on click outside ────────────────────────────────────────
  useEffect(() => {
    if (!isExportMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isExportMenuOpen]);

  const handleExport = async (format: 'png' | 'pdf') => {
    if (isExporting || !worldRef.current) return;
    setIsExportMenuOpen(false);
    setSelectedId(null);
    setIsExporting(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 60));
      const filename = getProductDrawingFilename(config, drawingFrame, format);
      if (format === 'png') {
        await exportProductDrawingPng(worldRef.current, filename);
      } else {
        await exportProductDrawingPdf(worldRef.current, filename);
      }
    } catch (err) {
      console.error('导出成品图失败', err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`导出成品图失败: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  };

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
    if (!vp) return;
    const vpW = vp.offsetWidth;
    const vpH = vp.offsetHeight;
    if (vpW <= 0 || vpH <= 0) return;
    const worldW = 1200;
    const worldH = 800;
    const paddingX = 32;
    const paddingY = 24;
    const scaleX = (vpW - paddingX * 2) / worldW;
    const scaleY = (vpH - paddingY * 2) / worldH;
    const newZoom = clampZoom(parseFloat(Math.min(scaleX, scaleY, 1).toFixed(3)));
    const newPan = {
      x: Math.round((vpW - worldW * newZoom) / 2),
      y: Math.round((vpH - worldH * newZoom) / 2),
    };
    setZoom(newZoom);
    setPan(newPan);
    setIsFitted(true);
  }, []);

  // ── Auto-fit when viewport size is established or restored from hidden ────────
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          if (!hasCenteredRef.current) {
            hasCenteredRef.current = true;
            fitToCanvas();
          }
        }
      }
    });
    observer.observe(vp);
    return () => observer.disconnect();
  }, [fitToCanvas]);

  // ── fit content to canvas when images first appear or project changes ──────────
  useEffect(() => {
    if (twoDImages.length === 0) {
      hasCenteredRef.current = false;
      const timer = setTimeout(() => setIsFitted(false), 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      const vp = viewportRef.current;
      if (vp && vp.offsetWidth > 0 && vp.offsetHeight > 0) {
        if (!hasCenteredRef.current) {
          fitToCanvas();
          hasCenteredRef.current = true;
        }
        setIsFitted(true);
      }
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

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // ── drag group mousedown ──────────────────────────────────────────────────────
  function handleGroupMouseDown(e: React.MouseEvent, groupIdx: number) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, button, [role="button"], table')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation(); // prevent viewport pan when dragging group
    setActiveDragGroupIdx(groupIdx);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setDragOffset({ x: 0, y: 0 });
  }

  function handleImageMouseDown(e: React.MouseEvent, groupIdx: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation(); // prevent viewport pan when dragging images
    setActiveDragGroupIdx(groupIdx);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setDragOffset({ x: 0, y: 0 });
  }

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col bg-white">
      {/* toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="text-sm font-semibold text-slate-700">成品图</span>
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
                onClick={fitToCanvas}
                className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                title="居中适应整张图纸"
              >
                <Maximize2 className="h-3 w-3" />
                <span>{Math.round(zoom * 100)}%</span>
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
          <button
            type="button"
            onClick={() => setIsEditDialogOpen(true)}
            className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 shadow-2xs transition-colors"
            title="编辑图纸图框及签审信息"
          >
            <Edit3 className="h-3.5 w-3.5 text-blue-600" />
            编辑图框
          </button>

          {/* Export dropdown button */}
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              disabled={isExporting || twoDImages.length === 0}
              onClick={() => setIsExportMenuOpen((p) => !p)}
              className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 shadow-2xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              title="导出成品图为图片或 PDF"
            >
              {isExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
              ) : (
                <Download className="h-3.5 w-3.5 text-slate-600" />
              )}
              <span>{isExporting ? '导出中...' : '导出'}</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => handleExport('png')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileImage className="h-3.5 w-3.5 text-blue-600" />
                  导出为图片 (PNG)
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5 text-rose-600" />
                  导出为 PDF 文档
                </button>
              </div>
            )}
          </div>
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
              请先在目录中为连接器、线材或外模配置图片。
            </p>
          </div>
        ) : (
          /* world layer: flex row, zoom+pan via transform */
          <div
            ref={worldRef}
            data-drawing-world="true"
            style={{
              position: 'absolute',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              minWidth: 1200,
              minHeight: 800,
              maxWidth: 1200,
              maxHeight: 800,
              backgroundColor: '#ffffff',
              opacity: isFitted ? 1 : 0,
              transition: 'opacity 0.15s ease-in-out',
            }}
          >
            {/* SVG Vector Drawing Frame */}
            <ProductionDrawingFrameSvg
              frame={drawingFrame}
              onEdit={(field) => {
                setEditFocusField(field);
                setIsEditDialogOpen(true);
              }}
            />
            {(() => {
              return groups.map((group, groupIdx) => {
                const isDraggingThis = activeDragGroupIdx === groupIdx;
                const basePos = getGroupPosition(groupIdx);
                const rawPos = {
                  x: basePos.x + (isDraggingThis ? dragOffset.x : 0),
                  y: basePos.y + (isDraggingThis ? dragOffset.y : 0),
                };
                const { x, y } = isDraggingThis
                  ? clampGroupPosition(rawPos, group, groupIdx)
                  : rawPos;

                return (
                  <div
                    key={groupIdx}
                    ref={(el) => {
                      groupRefs.current[groupIdx] = el;
                    }}
                    onMouseDown={(e) => handleGroupMouseDown(e, groupIdx)}
                    style={{
                      position: 'absolute',
                      left: x,
                      top: y,
                      opacity: isDraggingThis ? 0.75 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: productionLayout.assemblyGap,
                      border: '1px dashed transparent',
                      borderRadius: '8px',
                      padding: '4px',
                      cursor: isDraggingThis ? 'grabbing' : 'grab',
                    }}
                    className="group/assembly hover:border-[#e2e8f0] hover:bg-[#f8fafc]/30 transition-colors"
                  >
                    {/* Top Row: image cards with straight horizontal / bent bottom-attachment layout */}
                    {(() => {
                      const wireImgs = group.images.filter((img) => img.elementKind === 'material' || img.elementKind === 'sleeve');
                      const wireMaterial = wireImgs.find((img) => img.elementKind === 'material');
                      const matEntity = wireMaterial ? materials.find((m) => m.id === wireMaterial.elementId) : undefined;
                      const matCenterX = matEntity ? matEntity.position.x + matEntity.width / 2 : 0;

                      // Split non-wire images into left and right by relative x-position to wire
                      const nonWireImgs = group.images.filter((img) => img.elementKind !== 'material' && img.elementKind !== 'sleeve');
                      const leftImgs: TwoDImage[] = [];
                      const rightImgs: TwoDImage[] = [];

                      if (wireImgs.length > 0) {
                        for (const img of nonWireImgs) {
                          const elX = getElementX(img.elementKind, img.elementId, connectors, materials, sleeves, models);
                          if (elX < matCenterX) {
                            leftImgs.push(img);
                          } else {
                            rightImgs.push(img);
                          }
                        }
                      } else {
                        leftImgs.push(...nonWireImgs);
                      }

                      const renderCard = (img: TwoDImage) => {
                        const isHighlighted = img.id === highlightedImageId;
                        const isSelected = img.id === selectedId;
                        const cardWidth = getCardWidth(img);
                        const wireMat =
                          img.elementKind === 'material'
                            ? materials.find((m) => m.id === img.elementId)
                            : undefined;

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
                            {wireMat && (
                              <WireDimensionAnnotation
                                material={wireMat}
                                width={cardWidth}
                                onUpdate={updateMaterial}
                              />
                            )}
                            <TwoDImageCard
                              image={img}
                              highlighted={isHighlighted}
                              selected={isSelected}
                              onClick={() => setSelectedId((p) => (p === img.id ? null : img.id))}
                              onMouseDown={(e) => handleImageMouseDown(e, groupIdx)}
                              onImageError={() => {
                                if (retryingImagesRef.current.has(img.id)) return;
                                retryingImagesRef.current.add(img.id);
                                void reloadCatalog();
                              }}
                              maxWidth={cardWidth}
                              maxHeight={maxCardHeight}
                            />
                            {isSelected && (
                              <div className="absolute top-full left-1/2 -translate-x-1/2 z-20 mt-2">
                                <ImageInfoBox
                                  image={img}
                                  onCollapse={() => setSelectedId(null)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      };

                      const renderEnd = (endImgs: TwoDImage[], side: 'left' | 'right') => {
                        if (endImgs.length === 0) return null;

                        const connectorIds = Array.from(
                          new Set(
                            endImgs
                              .filter((img) => img.elementKind === 'connector' && img.elementId)
                              .map((img) => img.elementId!),
                          ),
                        );

                        const renderedImageIds = new Set<string>();

                        const connectorUnits = connectorIds.map((cId) => {
                          const connImg = endImgs.find(
                            (img) => img.elementKind === 'connector' && img.elementId === cId && img.imageRole !== 'connector-pin-map',
                          );
                          const pinMapImg = endImgs.find(
                            (img) => img.elementKind === 'connector' && img.elementId === cId && img.imageRole === 'connector-pin-map',
                          );
                          const modelImg = endImgs.find((img) => {
                            if (img.elementKind !== 'model' || !img.elementId) return false;
                            const modelEntity = models.find((m) => m.id === img.elementId);
                            if (!modelEntity) return false;
                            const linkage = getMoldLinkage(modelEntity, config);
                            return linkage?.connector.id === cId;
                          });

                          if (connImg) renderedImageIds.add(connImg.id);
                          if (pinMapImg) renderedImageIds.add(pinMapImg.id);
                          if (modelImg) renderedImageIds.add(modelImg.id);

                          return {
                            cId,
                            connImg,
                            pinMapImg,
                            modelImg,
                            isBent: connImg?.orientation === 'bottom' || connImg?.rotation === -90,
                          };
                        });

                        const unassignedImgs = endImgs.filter((img) => !renderedImageIds.has(img.id));

                        return (
                          <div key={`end-${side}`} className="flex flex-row items-center gap-0">
                            {side === 'left' && unassignedImgs.map(renderCard)}

                            {connectorUnits.map((unit) => {
                              const physicalItems = side === 'left'
                                ? [unit.connImg, unit.modelImg].filter((item): item is TwoDImage => Boolean(item))
                                : [unit.modelImg, unit.connImg].filter((item): item is TwoDImage => Boolean(item));

                              if (unit.isBent) {
                                return (
                                  <div key={`unit-${unit.cId}`} className="flex flex-row items-center">
                                    {side === 'left' && unit.pinMapImg && (
                                      <div className="mr-4">
                                        {renderCard(unit.pinMapImg)}
                                      </div>
                                    )}
                                    {(unit.modelImg || unit.connImg) && (
                                      <div className="flex flex-col items-center gap-0">
                                        {unit.modelImg && renderCard(unit.modelImg)}
                                        {unit.connImg && renderCard(unit.connImg)}
                                      </div>
                                    )}
                                    {side === 'right' && unit.pinMapImg && (
                                      <div className="ml-4">
                                        {renderCard(unit.pinMapImg)}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              return (
                                <div key={`unit-${unit.cId}`} className="flex flex-row items-center">
                                  {side === 'left' && unit.pinMapImg && (
                                    <div className="mr-4">
                                      {renderCard(unit.pinMapImg)}
                                    </div>
                                  )}
                                  {physicalItems.length > 0 && (
                                    <div className="flex flex-row items-center gap-0">
                                      {physicalItems.map(renderCard)}
                                    </div>
                                  )}
                                  {side === 'right' && unit.pinMapImg && (
                                    <div className="ml-4">
                                      {renderCard(unit.pinMapImg)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {side === 'right' && unassignedImgs.map(renderCard)}
                          </div>
                        );
                      };

                      return (
                        <>
                          <div
                            ref={(el) => {
                              topRowRefs.current[groupIdx] = el;
                            }}
                            className="relative flex flex-row items-center gap-0"
                          >
                            {renderEnd(leftImgs, 'left')}
                            <div
                              ref={(el) => {
                                wireContainerRefs.current[groupIdx] = el;
                              }}
                              className="flex flex-row items-center gap-0"
                            >
                              {wireImgs.map(renderCard)}
                            </div>
                            {renderEnd(rightImgs, 'right')}
                          </div>

                          {/* Bottom Row: Wiring Diagram (pixel-perfect centered with wire materials) */}
                          {(() => {
                            const groupMaterials = materials.filter(m => group.images.some(img => img.elementKind === 'material' && img.elementId === m.id));
                            const groupConnectors = connectors.filter(c => group.images.some(img => img.elementKind === 'connector' && img.elementId === c.id));
                            const exactOffset = wireOffsets[groupIdx] ?? 0;
                            return groupMaterials.length > 0 ? (
                              <div
                                style={{
                                  transform: exactOffset !== 0 ? `translateX(${exactOffset}px)` : undefined,
                                }}
                              >
                                <WiringDiagram
                                  materials={groupMaterials}
                                  connectors={groupConnectors}
                                  layout={productionLayout.wiringDiagram}
                                />
                              </div>
                            ) : null;
                          })()}
                        </>
                      );
                    })()}
                  </div>
                );
              });
            })()}
            {/* BOM Table */}
            <BOMTable
              config={config}
              layout={productionLayout}
              overmolds={catalogOvermolds ?? []}
            />
          </div>
        )}
      </div>


      {/* Drawing Frame Edit Dialog */}
      {isEditDialogOpen && (
        <DrawingFrameEditDialog
          isOpen={isEditDialogOpen}
          onClose={() => {
            setIsEditDialogOpen(false);
            setEditFocusField(undefined);
          }}
          frame={drawingFrame}
          initialFocusField={editFocusField}
          onSave={(updated) => updateDrawingFrame(updated)}
        />
      )}

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
