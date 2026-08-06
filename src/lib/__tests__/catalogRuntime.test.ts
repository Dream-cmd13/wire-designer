import { describe, expect, it } from 'vitest';
import { getCatalogConnectors } from '@/lib/catalogRuntime';

describe('catalog runtime selectors', () => {
  it('returns one stable empty connector list before the catalog loads', () => {
    expect(getCatalogConnectors(null)).toBe(getCatalogConnectors(null));
  });
});
