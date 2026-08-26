import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Edit3, FileImage, FileText, Loader2, Minus, Plus, RotateCw } from 'lucide-react';
import { getJumperNetwork } from '@/lib/commands';
import { buildTwoDImageGroups, getElementX } from '@/lib/twoDImageGroups';
import { useHarnessStore } from '@/stores/harnessStore';
import type { TwoDImage, CanvasModel, CanvasWireMaterial, ConnectorInstance, HarnessConfig } from '@/types/harness';
import {
  getProductDrawingFilename,
  exportProductDrawingPng,
  exportProductDrawingPdf,
} from '@/lib/productImageExport';
import { TwoDImageCard } from './TwoDImageCard';
import { WireDimensionAnnotation } from './WireDimensionAnnotation';
import { ProductionDrawingFrameSvg } from './ProductionDrawingFrameSvg';
import { DrawingFrameEditDialog } from './DrawingFrameEditDialog';
import { ensureDrawingFrame } from '@/lib/drawingFrameDefaults';
import { useUserStore } from '@/stores/userStore';
import { getCatalogSnapshot } from '@/lib/catalogRuntime';
import { useCatalogStore } from '@/stores/catalogStore';
import { generateBOM } from '@/lib/bom';
import {
  resolveColor,
  getCanvasModelDisplayName,
  getProtectiveSleeveDisplayName,
} from '@/lib/canvasMaterials';
import {
  calculateProductionDrawingLayout,
  countProductionBomRows,
  type ProductionDrawingLayout,
} from '@/lib/productionDrawingLayout';
import { getWiringConnectorLabels } from '@/lib/connectorDesignation';

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

export function formatPinNetworkString(connector: ConnectorInstance, side: 'left' | 'right', pin: number): string {
  const network = getJumperNetwork(connector.jumpers, side, pin);
  const sorted = Array.from(network).sort((a, b) => a - b);
  return sorted.map((p) => `Pin${p}`).join(', ');
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
  const allRightCut = rows.every((r) => r.isCutEnd && numCols === 2);

  // Column constants for strictly uniform segment length and vertical alignment
  const PIN_COL_WIDTH = 78; // fixed width for every Pin column, comfortably fits 'Pin1, Pin2', 'Pin10, Pin11'
  const MIN_SEGMENT_WIDTH = 110;
  const CUT_COL_WIDTH = 45;
  const PADDING_H = 20;

  const leftCutWidth = allLeftCut ? CUT_COL_WIDTH : 0;
  const rightCutWidth = allRightCut ? CUT_COL_WIDTH : 0;
  const requiredContentWidth =
    leftCutWidth +
    numCols * PIN_COL_WIDTH +
    (numCols - 1) * MIN_SEGMENT_WIDTH +
    rightCutWidth +
    PADDING_H;

  const bodyHeight = layout.height - layout.headerHeight;
  const rowHeight = Math.max(22, Math.floor((bodyHeight - 38) / Math.max(1, rows.length)));
  const diagramWidth = Math.max(layout.width, requiredContentWidth);

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
          {allLeftCut && <div style={{ width: CUT_COL_WIDTH }} className="shrink-0" />}
          <div className="flex-1 flex flex-row items-center">
            {Array.from({ length: numCols }).map((_, idx) => {
              const conn = orderedConnectors[idx];
              const label = conn ? conn.label : (idx === 0 ? 'P1' : `P${idx + 1}`);
              const alignClass =
                idx === 0
                  ? 'text-right pr-2'
                  : idx === numCols - 1
                  ? 'text-left pl-2'
                  : 'text-center px-1';
              return (
                <React.Fragment key={idx}>
                  <span
                    style={{ width: PIN_COL_WIDTH }}
                    className={`shrink-0 ${alignClass} truncate`}
                    title={label}
                  >
                    {label}
                  </span>
                  {idx < numCols - 1 && <div className="flex-1 min-w-[20px]" />}
                </React.Fragment>
              );
            })}
          </div>
          {allRightCut && <div style={{ width: CUT_COL_WIDTH }} className="shrink-0" />}
        </div>

        {/* Content Rows */}
        <div className="flex-1 flex flex-row items-center">
          {/* Left Status (if all cut) */}
          {allLeftCut && (
            <div
              style={{ width: CUT_COL_WIDTH }}
              className="flex flex-col items-center justify-center text-xs font-bold text-black border-r border-black h-full pr-2 shrink-0"
            >
              <span className="leading-tight">切</span>
              <span className="leading-tight">断</span>
            </div>
          )}

          {/* Center Lines + Pins */}
          <div className="flex-1 flex flex-col justify-between h-full py-1">
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="flex flex-row items-center" style={{ height: rowHeight }}>
                {Array.from({ length: numCols }).map((_, colIdx) => {
                  const pinText = row.pins[colIdx] || '';
                  const alignClass =
                    colIdx === 0
                      ? 'text-right pr-2'
                      : colIdx === numCols - 1
                      ? 'text-left pl-2'
                      : 'text-center px-1';

                  return (
                    <React.Fragment key={colIdx}>
                      {/* Pin Column with fixed width */}
                      <span
                        style={{ width: PIN_COL_WIDTH }}
                        className={`shrink-0 text-xs font-bold text-black ${alignClass} whitespace-nowrap`}
                      >
                        {pinText}
                      </span>

                      {/* Segment Column (between colIdx and colIdx + 1) */}
                      {colIdx < numCols - 1 && (
                        <div className="flex-1 flex flex-col justify-end h-full px-1 relative pb-1 min-w-[20px]">
                          {row.segments[colIdx] ? (
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
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Right Status (if all cut) */}
          {allRightCut && (
            <div
              style={{ width: CUT_COL_WIDTH }}
              className="flex flex-col items-center justify-center text-xs font-bold text-black border-l border-black h-full pl-2 shrink-0"
            >
              <span className="leading-tight">切</span>
              <span className="leading-tight">断</span>
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
      className="relative h-[36px] flex items-center justify-center border-r border-black select-none"
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

function BOMTable({ config, layout }: { config: HarnessConfig; layout: ProductionDrawingLayout }) {
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
      const spec = m.spec;
      if (spec.kind === 'electronic') {
        return wi.description.includes(`${spec.awg}AWG`) && wi.description.includes(spec.color);
      } else {
        return wi.description.includes(`${spec.coreCount}芯`) && wi.description.includes(`${spec.awg}AWG`);
      }
    });

    if (matObj) {
      if (matObj.spec.kind === 'jacketed') {
        const s = matObj.spec;
        const sq = s.awg === 22 ? '0.3mm²' : s.awg === 24 ? '0.2mm²' : `${s.awg}AWG`;
        const colorsClean = s.coreColors.map((c: string) => {
          const r = resolveColor(c).name;
          return r.endsWith('色') ? r.slice(0, -1) : r;
        }).join('、');
        const shielding = s.shielded ? '屏蔽' : '非屏蔽';
        const jColor = s.jacketColor === 'black' ? '黑色' : s.jacketColor;
        wireSpec = `${s.coreCount}C*${sq} (39/0.10TC)*1.2+无纺布  OD: ${s.odMm.toFixed(2)}±0.15\n${colorsClean} ${shielding}${jColor}雾面${s.jacketMaterial}外被`;
      } else if (matObj.spec.kind === 'electronic') {
        const s = matObj.spec;
        const sq = s.awg === 22 ? '0.3mm²' : s.awg === 24 ? '0.2mm²' : `${s.awg}AWG`;
        const resolved = resolveColor(s.color).name;
        const colorsClean = resolved.endsWith('色') ? resolved.slice(0, -1) : resolved;
        wireSpec = `UL${s.ulNumber || '1007'} ${s.awg}AWG (${sq}) 电子线 L=${s.lengthMm}mm\n单芯 ${colorsClean}色`;
      }
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
    const specCode = ci.partNumber === 'm12a04-07-093' ? 'M12A04-07-093' : (ci.partNumber || ci.description);
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
    const modelCounts: Record<string, number> = {};
    config.models.forEach((m: CanvasModel) => {
      const specId = m.overmoldSpecId ?? 'default';
      modelCounts[specId] = (modelCounts[specId] || 0) + 1;
    });
    Object.entries(modelCounts).forEach(([specId, count]) => {
      const spec = getCatalogSnapshot()?.overmolds.find(s => s.id === specId);
      const specText = spec
        ? [spec.outerHardness, spec.outerMaterial].filter(Boolean).join(' ')
        : '45P 黑色PVC';
      rows.push({
        itemNo: 3,
        name: '外模料',
        spec: specText,
        unit: 'PCS',
        qty: count,
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
            className="flex flex-row border-b border-black items-center text-[11px] font-semibold"
            style={{ height: layout.bom.rowHeight }}
          >
            {/* ITEM No */}
            <div className="w-[50px] border-r border-black h-full flex items-center justify-center text-sm font-bold">
              {circledNums[row.itemNo - 1] || row.itemNo}
            </div>
            {/* NAME */}
            <div className="w-[70px] border-r border-black h-full flex items-center justify-center">
              {row.name}
            </div>
            {/* SPECIFICATION */}
            <div className="flex-1 border-r border-black h-full flex items-center px-3 whitespace-pre-line leading-tight text-[11px]">
              {row.spec}
            </div>
            {/* UNIT */}
            <div className="w-[50px] border-r border-black h-full flex items-center justify-center">
              {row.unit}
            </div>
            {/* QTY */}
            <div className="w-[50px] h-full flex items-center justify-center text-sm font-bold">
              {row.qty}
            </div>
          </div>
        ))}
        
        {/* Table Header (at the bottom) */}
        <div
          className="flex flex-row text-[10px] font-bold"
          style={{ height: layout.bom.headerHeight, backgroundColor: 'rgba(248, 250, 252, 0.5)' }}
        >
          <SlashHeaderCell topText="序号" bottomText="ITEM" width="50px" />
          <SlashHeaderCell topText="名称" bottomText="NAME" width="70px" />
          
          {/* SPECIFICATION Header */}
          <div className="flex-1 border-r border-black h-full flex items-center justify-center tracking-wider text-xs">
            规格/NAME&DESCRIPTION
          </div>
          
          <SlashHeaderCell topText="单位" bottomText="UNIT" width="50px" />
          <SlashHeaderCell topText="用量" bottomText="DSE" width="50px" />
        </div>
      </div>
    </div>
  );
}


// ── ImageInfoBox ───────────────────────────────────────────────────────────────
function ImageInfoBox({
  image,
  onRotate,
  onCollapse,
}: {
  image: TwoDImage;
  onRotate: (id: string) => void;
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
      </div>
    </div>
  );
}

// ── main view ──────────────────────────────────────────────────────────────────
export function TwoDView() {
  const reloadCatalog = useCatalogStore((state) => state.reload);
  const retryingImagesRef = useRef(new Set<string>());
  const currentUser = useUserStore((s) => s.currentUser);
  const config = useHarnessStore((s) => s.config);
  const updateDrawingFrame = useHarnessStore((s) => s.updateDrawingFrame);
  const drawingFrame = useMemo(
    () => ensureDrawingFrame(config.drawingFrame, currentUser, config),
    [config.drawingFrame, currentUser, config],
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
  const rotateTwoDImage = useHarnessStore((s) => s.rotateTwoDImage);
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

  // ── zoom & pan ───────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const worldRef = useRef<HTMLDivElement>(null);
  const hasCenteredRef = useRef(false);
  const [panning, setPanning] = useState<{
    startMX: number; startMY: number; startPX: number; startPY: number;
  } | null>(null);
  const panningRef = useRef(panning);
  const zoomRef = useRef(zoom);

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
  const bomRowCount = useMemo(() => countProductionBomRows(config), [config]);
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

  const getGroupWidth = useCallback((g: { images: TwoDImage[] }) => {
    return g.images.reduce((sum, img) => sum + getCardWidth(img), 0);
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
        y: productionLayout.assemblyTop,
      };
      currentX += getGroupWidth(groups[i]) + groupSpacing;
    }
    return positions;
  }, [groups, getGroupWidth, productionLayout.assemblyTop]);

  const getGroupReservedHeight = useCallback((group: { images: TwoDImage[] }) => {
    const groupHasWiring = group.images.some((img) => img.elementKind === 'material');
    return (
      maxCardHeight +
      (groupHasWiring ? productionLayout.assemblyGap + productionLayout.wiringDiagram.height : 0) +
      8
    );
  }, [maxCardHeight, productionLayout.assemblyGap, productionLayout.wiringDiagram.height]);

  const clampGroupPosition = useCallback((position: { x: number; y: number }, group: { images: TwoDImage[] }) => {
    const minY = 56;
    const maxY = Math.max(minY, productionLayout.bomRect.top - productionLayout.safeGap - getGroupReservedHeight(group));
    return {
      x: position.x,
      y: Math.max(minY, Math.min(position.y, maxY)),
    };
  }, [getGroupReservedHeight, productionLayout.bomRect.top, productionLayout.safeGap]);

  const getGroupPosition = useCallback((groupIdx: number) => {
    const group = groups[groupIdx];
    const firstImg = group.images[0];
    if (firstImg && firstImg.pos) {
      return clampGroupPosition({ x: firstImg.pos.x, y: firstImg.pos.y }, group);
    }
    return clampGroupPosition(defaultGroupPositions[groupIdx], group);
  }, [clampGroupPosition, groups, defaultGroupPositions]);

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
        const nextPos = clampGroupPosition({ x: newX, y: newY }, group);

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
      const timer = setTimeout(() => setIsFitted(false), 0);
      return () => clearTimeout(timer);
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
                      gap: productionLayout.assemblyGap,
                      border: '1px dashed transparent',
                      borderRadius: '8px',
                      padding: '4px',
                      cursor: isDraggingThis ? 'grabbing' : 'grab',
                    }}
                    className="group/assembly hover:border-[#e2e8f0] hover:bg-[#f8fafc]/30 transition-colors"
                  >
                    {/* Top Row: image cards */}
                    <div className="flex flex-row items-center gap-0">
                      {group.images.map((img) => {
                        const isHighlighted = img.id === highlightedImageId;
                        const isSelected = img.id === selectedId;

                        const cardWidth = getCardWidth(img);
                        const wireMaterial =
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
                            {wireMaterial && (
                              <WireDimensionAnnotation
                                material={wireMaterial}
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
                                  onRotate={rotateTwoDImage}
                                  onCollapse={() => setSelectedId(null)}
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
                        <WiringDiagram
                          materials={groupMaterials}
                          connectors={groupConnectors}
                          layout={productionLayout.wiringDiagram}
                        />
                      ) : null;
                    })()}
                  </div>
                );
              });
            })()}
            {/* BOM Table */}
            <BOMTable config={config} layout={productionLayout} />
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
