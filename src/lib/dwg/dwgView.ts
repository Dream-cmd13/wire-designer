import type { DwgBounds } from '@/lib/dwg/dwgTypes';

export interface DwgViewportSize {
  width: number;
  height: number;
}

export interface DwgView {
  /** 屏幕像素 / 图纸单位 */
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** 绝对缩放上下限，仅用于防止 0/Infinity 等异常值；实际缩放范围按适应比例计算。 */
export const DWG_MIN_SCALE = 1e-6;
export const DWG_MAX_SCALE = 1e6;

export function clampScale(scale: number, min = DWG_MIN_SCALE, max = DWG_MAX_SCALE): number {
  if (!Number.isFinite(scale)) return min;
  return Math.min(max, Math.max(min, scale));
}

/**
 * 相对适应比例计算缩放范围（适应窗口的 1/100 ~ 1000 倍），
 * 避免大坐标图纸（如场地坐标 1e6）被固定下限截断而无法完整显示。
 */
export function zoomLimitsFor(fitScale: number): { min: number; max: number } {
  const base = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;
  return {
    min: Math.max(DWG_MIN_SCALE, base / 100),
    max: Math.min(DWG_MAX_SCALE, base * 1000),
  };
}

export function worldToScreen(view: DwgView, point: { x: number; y: number }) {
  return {
    x: point.x * view.scale + view.offsetX,
    y: -point.y * view.scale + view.offsetY,
  };
}

export function fitView(bounds: DwgBounds, viewport: DwgViewportSize, padding = 24): DwgView {
  const width = Math.max(1e-6, bounds.maxX - bounds.minX);
  const height = Math.max(1e-6, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const scale = clampScale(Math.min(availableWidth / width, availableHeight / height));
  return {
    scale,
    offsetX: (viewport.width - width * scale) / 2 - bounds.minX * scale,
    offsetY: (viewport.height + height * scale) / 2 + bounds.minY * scale,
  };
}

export function zoomViewAt(
  view: DwgView,
  factor: number,
  anchorX: number,
  anchorY: number,
  min = DWG_MIN_SCALE,
  max = DWG_MAX_SCALE,
): DwgView {
  const scale = clampScale(view.scale * factor, min, max);
  const ratio = scale / view.scale;
  return {
    scale,
    offsetX: anchorX - (anchorX - view.offsetX) * ratio,
    offsetY: anchorY - (anchorY - view.offsetY) * ratio,
  };
}

export function panView(view: DwgView, deltaX: number, deltaY: number): DwgView {
  return {
    scale: view.scale,
    offsetX: view.offsetX + deltaX,
    offsetY: view.offsetY + deltaY,
  };
}
