import type { DwgDrawing } from '@/lib/dwg/dwgTypes';

/**
 * 已解析图纸与预取字节的内存缓存：切换图纸时避免重复下载与 WASM 解析。
 * 超出上限按最久未使用淘汰，避免浏览大量图纸后内存无限增长。
 */
const MAX_CACHED_DRAWINGS = 3;
const MAX_CACHED_BUFFERS = 2;

const drawings = new Map<string, DwgDrawing>();
const buffers = new Map<string, ArrayBuffer>();

function setWithLimit<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export function getCachedDrawing(key: string): DwgDrawing | null {
  return drawings.get(key) ?? null;
}

export function setCachedDrawing(key: string, drawing: DwgDrawing): void {
  setWithLimit(drawings, key, drawing, MAX_CACHED_DRAWINGS);
}

export function getCachedBuffer(key: string): ArrayBuffer | null {
  return buffers.get(key) ?? null;
}

/** 取出预取字节并移除，解析完成后不再保留原始数据。 */
export function takeCachedBuffer(key: string): ArrayBuffer | null {
  const buffer = buffers.get(key) ?? null;
  if (buffer) buffers.delete(key);
  return buffer;
}

export function setCachedBuffer(key: string, buffer: ArrayBuffer): void {
  setWithLimit(buffers, key, buffer, MAX_CACHED_BUFFERS);
}

/** 登出或切换账号时调用，避免解析结果留在内存。 */
export function clearDwgCache(): void {
  drawings.clear();
  buffers.clear();
}
