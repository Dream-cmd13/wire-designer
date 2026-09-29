import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDwgCache,
  getCachedBuffer,
  getCachedDrawing,
  setCachedBuffer,
  setCachedDrawing,
  takeCachedBuffer,
} from '@/lib/dwg/dwgCache';
import type { DwgDrawing } from '@/lib/dwg/dwgTypes';

function fakeDrawing(fileName: string): DwgDrawing {
  return { fileName } as DwgDrawing;
}

describe('dwgCache', () => {
  beforeEach(() => {
    clearDwgCache();
  });

  it('keeps the most recent drawings and evicts the oldest', () => {
    setCachedDrawing('a', fakeDrawing('a'));
    setCachedDrawing('b', fakeDrawing('b'));
    setCachedDrawing('c', fakeDrawing('c'));
    setCachedDrawing('d', fakeDrawing('d'));

    expect(getCachedDrawing('a')).toBeNull();
    expect(getCachedDrawing('b')?.fileName).toBe('b');
    expect(getCachedDrawing('d')?.fileName).toBe('d');
  });

  it('refreshes recency when a drawing is stored again', () => {
    setCachedDrawing('a', fakeDrawing('a'));
    setCachedDrawing('b', fakeDrawing('b'));
    setCachedDrawing('c', fakeDrawing('c'));
    setCachedDrawing('a', fakeDrawing('a'));
    setCachedDrawing('d', fakeDrawing('d'));

    expect(getCachedDrawing('b')).toBeNull();
    expect(getCachedDrawing('a')).not.toBeNull();
    expect(getCachedDrawing('d')).not.toBeNull();
  });

  it('takes prefetched buffers once so parsing frees the raw bytes', () => {
    const buffer = new ArrayBuffer(8);
    setCachedBuffer('a', buffer);

    expect(getCachedBuffer('a')).toBe(buffer);
    expect(takeCachedBuffer('a')).toBe(buffer);
    expect(getCachedBuffer('a')).toBeNull();
    expect(takeCachedBuffer('a')).toBeNull();
  });
});
