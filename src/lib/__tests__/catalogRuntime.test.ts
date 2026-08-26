import { describe, expect, it } from 'vitest';
import {
  getCatalogConnectors,
  getCatalogOvermolds,
  getCatalogWires,
} from '@/lib/catalogRuntime';
import type { CatalogSnapshot } from '@/types/catalog';

describe('catalog runtime selectors', () => {
  it('returns stable empty lists before the catalog loads', () => {
    expect(getCatalogConnectors(null)).toBe(getCatalogConnectors(null));
    expect(getCatalogWires(null)).toBe(getCatalogWires(null));
    expect(getCatalogOvermolds(null)).toBe(getCatalogOvermolds(null));
  });

  it('selects items from snapshot when loaded', () => {
    const mockSnapshot = {
      connectors: [{ id: 'c1' }],
      wires: [{ id: 'w1' }],
      overmolds: [{ id: 'o1' }],
    } as unknown as CatalogSnapshot;

    expect(getCatalogConnectors(mockSnapshot)).toEqual([{ id: 'c1' }]);
    expect(getCatalogWires(mockSnapshot)).toEqual([{ id: 'w1' }]);
    expect(getCatalogOvermolds(mockSnapshot)).toEqual([{ id: 'o1' }]);
  });
});

