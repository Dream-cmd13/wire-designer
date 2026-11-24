import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Edit3, FileImage, FileText, Loader2, Maximize2, Minus, Plus } from 'lucide-react';
import { PageHeaderActions } from '@/components/layout/PageHeaderActions';
import { DRAWING_FONT_FAMILY } from '@/lib/drawingFont';
import { DEFAULT_TECHNICAL_REQUIREMENTS, ensureDrawingFrame } from '@/lib/drawingFrameDefaults';
import {
  exportProductDrawingPdf,
  exportProductDrawingPng,
  getProductDrawingFilename,
} from '@/lib/productImageExport';
import { buildProductionBomRows } from '@/lib/productionBomRows';
import {
  calculateAssemblyUnscaledBounds,
  calculateUniformAssemblyScale,
  getScaledDisplayDimensions,
  type AssemblyUnscaledBounds,
  type ImageDimensions,
} from '@/lib/productionDrawingImageScale';
import {
  calculateCenteredGroupX,
  calculateEstimatedWireOffset,
  calculateProductionDrawingLayout,
} from '@/lib/productionDrawingLayout';
import { buildTwoDImageGroups, getElementX } from '@/lib/twoDImageGroups';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import { useCatalogStore } from '@/stores/catalogStore';
import { useHarnessStore } from '@/stores/harnessStore';
import { notify } from '@/stores/noticeStore';
import { useUserStore } from '@/stores/userStore';
import type { TwoDImage } from '@/types/harness';
import { AssemblyGroupRow } from './AssemblyGroupRow';
import { DrawingFrameEditDialog } from './DrawingFrameEditDialog';
import { ItemCalloutLayer } from './ItemCalloutLayer';
import { BOMTable } from './ProductionBomTable';
import { ProductionDrawingFrameSvg } from './ProductionDrawingFrameSvg';

/** Stable empty array — prevents useSyncExternalStore from seeing a new ref each render */
const EMPTY_IMAGES: TwoDImage[] = [];

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.15;

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
  const updateMaterial = useHarnessStore((s) => s.updateMaterial);
  const patchDocument = useHarnessStore((s) => s.patchDocument);

  const [highlightedRowKey, setHighlightedRowKey] = useState<string | null>(null);
  const [showCallouts, setShowCallouts] = useState<boolean>(true);
  const [isFitted, setIsFitted] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const [activeDragGroupIdx, setActiveDragGroupIdx] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeDragGroupIdxRef = useRef(activeDragGroupIdx);
  const [groupDimensions, setGroupDimensions] = useState<Record<number, { w: number; h: number }>>({});
  const groupRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [wireOffsets, setWireOffsets] = useState<Record<number, number>>({});
  const topRowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const wireContainerRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const [naturalSizes, setNaturalSizes] = useState<Record<string, ImageDimensions>>({});
  const twoDImagesRef = useRef(twoDImages);
  useEffect(() => {
    twoDImagesRef.current = twoDImages;
  }, [twoDImages]);

  const handleNaturalSizeChange = useCallback(
    (id: string, url: string, size: { w: number; h: number }) => {
      const currentImg = twoDImagesRef.current.find((img) => img.id === id);
      if (!currentImg || currentImg.dataUrl !== url) return;

      setNaturalSizes((prev) => {
        if (prev[id]?.w === size.w && prev[id]?.h === size.h) return prev;
        return { ...prev, [id]: size };
      });
    },
    [],
  );

  useEffect(() => {
    if (typeof Image === 'undefined') return;
    let isCancelled = false;
    const probes: HTMLImageElement[] = [];

    twoDImages.forEach((img) => {
      if (!img.dataUrl) return;
      const targetUrl = img.dataUrl;
      const targetId = img.id;
      const probe = new Image();
      probes.push(probe);

      const handleLoad = () => {
        if (isCancelled) return;
        probe.onload = null;
        probe.onerror = null;
        handleNaturalSizeChange(targetId, targetUrl, {
          w: probe.naturalWidth,
          h: probe.naturalHeight,
        });
      };

      const handleError = () => {
        if (isCancelled) return;
        probe.onload = null;
        probe.onerror = null;
      };

      probe.onload = handleLoad;
      probe.onerror = handleError;
      probe.src = targetUrl;

      if (probe.complete && probe.naturalWidth > 0) {
        handleLoad();
      }
    });

    return () => {
      isCancelled = true;
      probes.forEach((probe) => {
        probe.onload = null;
        probe.onerror = null;
        try {
          probe.src = '';
        } catch {
          // ignore
        }
      });
    };
  }, [twoDImages, handleNaturalSizeChange]);

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

  const groups = useMemo(
    () => buildTwoDImageGroups(twoDImages, connectors, materials, sleeves, models),
    [twoDImages, connectors, materials, sleeves, models],
  );
  const hasWiringDiagram = useMemo(
    () => groups.some((group) => group.images.some((img) => img.elementKind === 'material')),
    [groups],
  );
  const bomRows = useMemo(
    () => buildProductionBomRows(config, catalogOvermolds ?? []),
    [config, catalogOvermolds],
  );
  const bomRowCount = bomRows.length;
  const productionLayout = useMemo(
    () => calculateProductionDrawingLayout({ bomRowCount, hasWiringDiagram }),
    [bomRowCount, hasWiringDiagram],
  );

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

  const maxCardHeight = productionLayout.maxImageHeight;

  const groupScalesAndDims = useMemo(() => {
    const result: Record<
      number,
      {
        scale: number;
        dims: Record<string, ImageDimensions>;
        unscaledBounds: AssemblyUnscaledBounds;
      }
    > = {};

    for (let idx = 0; idx < groups.length; idx++) {
      const g = groups[idx];
      const unscaledBounds = calculateAssemblyUnscaledBounds(g.images, {
        connectors,
        materials,
        sleeves,
        models,
        config,
        naturalSizes,
      });
      const scale = calculateUniformAssemblyScale({
        unscaledBounds,
        availableWidth: 1080,
        availableHeight: maxCardHeight,
        maxScale: 1.0,
      });
      const dims: Record<string, ImageDimensions> = {};
      for (const img of g.images) {
        dims[img.id] = getScaledDisplayDimensions(img, scale, naturalSizes);
      }
      result[idx] = { scale, dims, unscaledBounds };
    }
    return result;
  }, [groups, connectors, materials, sleeves, models, config, naturalSizes, maxCardHeight]);

  const getCardWidth = useCallback(
    (img: TwoDImage) => {
      for (const entry of Object.values(groupScalesAndDims)) {
        if (entry.dims[img.id]) {
          return entry.dims[img.id].w;
        }
      }
      return 80;
    },
    [groupScalesAndDims],
  );

  const getCardHeight = useCallback(
    (img: TwoDImage) => {
      for (const entry of Object.values(groupScalesAndDims)) {
        if (entry.dims[img.id]) {
          return entry.dims[img.id].h;
        }
      }
      return 60;
    },
    [groupScalesAndDims],
  );

  const getGroupWidth = useCallback(
    (groupIdx: number, g: { images: TwoDImage[] }) => {
      const measured = groupDimensions[groupIdx]?.w;
      if (measured && measured > 0) return measured;
      const hasWiring = g.images.some((img) => img.elementKind === 'material');
      const entry = groupScalesAndDims[groupIdx];
      const approxCardsWidth = entry
        ? Math.round(entry.unscaledBounds.totalWidth * entry.scale)
        : g.images.reduce((sum, img) => sum + getCardWidth(img), 0);
      return Math.max(approxCardsWidth, hasWiring ? productionLayout.wiringDiagram.width : 0, 400);
    },
    [groupDimensions, productionLayout.wiringDiagram.width, groupScalesAndDims, getCardWidth],
  );

  const getEstimatedWireOffset = useCallback(
    (g: { images: TwoDImage[] }) => {
      const wireMaterial = g.images.find((img) => img.elementKind === 'material');
      if (!wireMaterial) return 0;
      const matEntity = materials.find((m) => m.id === wireMaterial.elementId);
      const matCenterX = matEntity ? matEntity.position.x + matEntity.width / 2 : 0;

      const nonWireImgs = g.images.filter(
        (img) => img.elementKind !== 'material' && img.elementKind !== 'sleeve',
      );
      let leftW = 0;
      let rightW = 0;
      for (const img of nonWireImgs) {
        const elX = getElementX(img.elementKind, img.elementId, connectors, materials, sleeves, models);
        if (elX < matCenterX) {
          leftW += getCardWidth(img);
        } else {
          rightW += getCardWidth(img);
        }
      }
      return calculateEstimatedWireOffset({ leftWidth: leftW, rightWidth: rightW });
    },
    [materials, connectors, sleeves, models, getCardWidth],
  );

  const defaultGroupPositions = useMemo(() => {
    const positions: Record<number, { x: number; y: number }> = {};
    const groupSpacing = 32;
    const primaryWireGroupIdx = groups.findIndex((g) =>
      g.images.some((img) => img.elementKind === 'material'),
    );

    if (groups.length === 1 || primaryWireGroupIdx !== -1) {
      const targetGroupIdx = primaryWireGroupIdx !== -1 ? primaryWireGroupIdx : 0;
      const targetGroup = groups[targetGroupIdx];
      const targetWidth = getGroupWidth(targetGroupIdx, targetGroup);
      const hasWire = targetGroup.images.some((img) => img.elementKind === 'material');
      const offset = hasWire
        ? (wireOffsets[targetGroupIdx] ?? getEstimatedWireOffset(targetGroup))
        : 0;

      const targetX = calculateCenteredGroupX({
        canvasWidth: 1200,
        groupWidth: targetWidth,
        wireOffsetFromGroupCenter: offset,
      });

      positions[targetGroupIdx] = {
        x: targetX,
        y: productionLayout.assemblyTop,
      };

      let leftX = targetX;
      for (let i = targetGroupIdx - 1; i >= 0; i--) {
        const w = getGroupWidth(i, groups[i]);
        leftX -= w + groupSpacing;
        positions[i] = {
          x: leftX,
          y: productionLayout.assemblyTop,
        };
      }
      let rightX = targetX + targetWidth + groupSpacing;
      for (let i = targetGroupIdx + 1; i < groups.length; i++) {
        positions[i] = {
          x: rightX,
          y: productionLayout.assemblyTop,
        };
        rightX += getGroupWidth(i, groups[i]) + groupSpacing;
      }
    } else {
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
    }
    return positions;
  }, [
    groups,
    getGroupWidth,
    wireOffsets,
    getEstimatedWireOffset,
    productionLayout.assemblyTop,
  ]);

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
      return getGroupFallbackHeight(group);
    },
    [groupDimensions, getGroupFallbackHeight],
  );

  const clampGroupPosition = useCallback(
    (position: { x: number; y: number }, group: { images: TwoDImage[] }, groupIdx: number) => {
      const rawGroupWidth = getGroupWidth(groupIdx, group);
      const groupHeight = getGroupHeight(groupIdx, group);
      const exactOffset = wireOffsets[groupIdx] ?? getEstimatedWireOffset(group);

      const hasWiring = group.images.some((img) => img.elementKind === 'material');
      const diagramWidth = hasWiring ? productionLayout.wiringDiagram.width : 0;
      const minRelX = hasWiring
        ? Math.min(0, (rawGroupWidth - diagramWidth) / 2 + exactOffset)
        : 0;
      const maxRelX = hasWiring
        ? Math.max(rawGroupWidth, (rawGroupWidth + diagramWidth) / 2 + exactOffset)
        : rawGroupWidth;

      const minX = Math.max(26, 26 - minRelX);
      const maxX = Math.max(minX, 1174 - maxRelX);
      const clampedX = Math.max(minX, Math.min(position.x, maxX));

      const minY = 56;
      const safeGap = 12;
      const bomTop = productionLayout.bomRect.top;
      const visualLeft = clampedX + minRelX;
      const visualRight = clampedX + maxRelX;
      const overlapsBom = visualRight >= 530;
      const overlapsTechReq = visualLeft <= 550;

      let obstacleTop: number;
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
    [
      getGroupWidth,
      getGroupHeight,
      wireOffsets,
      getEstimatedWireOffset,
      productionLayout.wiringDiagram.width,
      productionLayout.bomRect.top,
      techRequirementsTop,
    ],
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

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const p = panningRef.current;
      if (p) {
        setPan({
          x: p.startPX + e.clientX - p.startMX,
          y: p.startPY + e.clientY - p.startMY,
        });
        return;
      }

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

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

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
      notify({
        tone: 'danger',
        title: '成品图导出失败',
        message: getUserErrorMessage(err, '成品图导出失败，请检查网络后重试。'),
        action: { label: '重试导出', onClick: () => void handleExport(format) },
        dedupeKey: 'product-drawing-export-failed',
      });
    } finally {
      setIsExporting(false);
    }
  };

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

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    setZoom((prevZoom) => {
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const nextZoom = clampZoom(parseFloat((prevZoom + delta).toFixed(2)));
      setPan((prevPan) => ({
        x: cx - (cx - prevPan.x) * (nextZoom / prevZoom),
        y: cy - (cy - prevPan.y) * (nextZoom / prevZoom),
      }));
      return nextZoom;
    });
  }, []);

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

  function handleGroupMouseDown(e: React.MouseEvent, groupIdx: number) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, button, [role="button"], table')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setActiveDragGroupIdx(groupIdx);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setDragOffset({ x: 0, y: 0 });
  }

  function handleImageMouseDown(e: React.MouseEvent, groupIdx: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setActiveDragGroupIdx(groupIdx);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setDragOffset({ x: 0, y: 0 });
  }

  const handleImageError = useCallback((imageId: string) => {
    if (retryingImagesRef.current.has(imageId)) return;
    retryingImagesRef.current.add(imageId);
    void reloadCatalog();
  }, [reloadCatalog]);

  return (
    <div className="relative flex h-full flex-col bg-white">
      <PageHeaderActions>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsEditDialogOpen(true)}
            className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 shadow-2xs transition-colors"
            title="编辑图纸图框及签审信息"
          >
            <Edit3 className="h-3.5 w-3.5 text-blue-600" />
            编辑图框
          </button>

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
      </PageHeaderActions>

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
              fontFamily: DRAWING_FONT_FAMILY,
              opacity: isFitted ? 1 : 0,
              transition: 'opacity 0.15s ease-in-out',
            }}
          >
            <ProductionDrawingFrameSvg
              frame={drawingFrame}
              onEdit={(field) => {
                setEditFocusField(field);
                setIsEditDialogOpen(true);
              }}
            />
            {groups.map((group, groupIdx) => {
              const isDraggingThis = activeDragGroupIdx === groupIdx;
              const basePos = getGroupPosition(groupIdx);
              const rawPos = {
                x: basePos.x + (isDraggingThis ? dragOffset.x : 0),
                y: basePos.y + (isDraggingThis ? dragOffset.y : 0),
              };
              const { x, y } = isDraggingThis
                ? clampGroupPosition(rawPos, group, groupIdx)
                : rawPos;
              const exactOffset = wireOffsets[groupIdx] ?? getEstimatedWireOffset(group);

              return (
                <AssemblyGroupRow
                  key={groupIdx}
                  group={group}
                  groupIdx={groupIdx}
                  x={x}
                  y={y}
                  isDraggingThis={isDraggingThis}
                  showCallouts={showCallouts}
                  productionLayout={productionLayout}
                  config={config}
                  connectors={connectors}
                  materials={materials}
                  sleeves={sleeves}
                  models={models}
                  exactOffset={exactOffset}
                  getCardWidth={getCardWidth}
                  getCardHeight={getCardHeight}
                  onGroupMouseDown={handleGroupMouseDown}
                  onImageMouseDown={handleImageMouseDown}
                  onImageError={handleImageError}
                  onNaturalSizeChange={handleNaturalSizeChange}
                  onUpdateMaterial={updateMaterial}
                  setGroupRef={(el) => { groupRefs.current[groupIdx] = el; }}
                  setTopRowRef={(el) => { topRowRefs.current[groupIdx] = el; }}
                  setWireContainerRef={(el) => { wireContainerRefs.current[groupIdx] = el; }}
                />
              );
            })}
            <ItemCalloutLayer
              bomRows={bomRows}
              worldRef={worldRef}
              highlightedRowKey={highlightedRowKey}
              onHoverRowKey={setHighlightedRowKey}
              onClickRowKey={(k) => setHighlightedRowKey(k)}
              visible={showCallouts}
              zoom={zoom}
              productionLayout={productionLayout}
              recalculateToken={`${activeDragGroupIdx ?? -1}_${dragOffset.x}_${dragOffset.y}_${twoDImages.length}_${bomRows.length}`}
            />

            <BOMTable
              rows={bomRows}
              layout={productionLayout}
              highlightedRowKey={highlightedRowKey}
              onHoverRowKey={setHighlightedRowKey}
              onClickRowKey={(k) => setHighlightedRowKey(k)}
              twoDImages={twoDImages}
            />
          </div>
        )}
      </div>

      {twoDImages.length > 0 && (
        <div role="group" aria-label="成品图画布工具" className="absolute right-2 bottom-2 z-30 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button type="button" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} aria-label="缩小" title="缩小"
            className="flex h-7 w-7 items-center justify-center rounded text-slate-600 hover:bg-slate-100 disabled:opacity-40">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={fitToCanvas} aria-label="居中适应整张图纸" title="居中适应整张图纸"
            className="flex h-7 items-center gap-1 rounded px-1.5 text-xs font-medium tabular-nums text-slate-600 hover:bg-slate-100">
            <Maximize2 className="h-3 w-3" />{Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} aria-label="放大" title="放大"
            className="flex h-7 w-7 items-center justify-center rounded text-slate-600 hover:bg-slate-100 disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-pressed={showCallouts} onClick={() => setShowCallouts((value) => !value)}
            className={`h-7 rounded px-2 text-xs font-medium ${showCallouts ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'text-slate-600 hover:bg-slate-100'}`}>
            件号标注
          </button>
        </div>
      )}

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
          <button
            type="button"
            onClick={() => {
              const nextImages = twoDImages.map((img) => {
                if (img.pos === undefined) return img;
                const copy = { ...img };
                delete copy.pos;
                return copy;
              });
              patchDocument({ twoDImages: nextImages });
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100"
          >
            重置图元居中
          </button>
        </div>
      )}
    </div>
  );
}
