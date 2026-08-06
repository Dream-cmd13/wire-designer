import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dialogSource = readFileSync('src/components/canvas/WireMaterialDialog.tsx', 'utf8');

describe('WireMaterialDialog catalog defaults', () => {
  it('applies the selected catalog spec through the pure adapter', () => {
    expect(dialogSource).toContain("import { applyCatalogWireSpec } from '@/lib/wireCatalog'");
    expect(dialogSource).toContain('applyCatalogWireSpec(current, selected.spec)');
    expect(dialogSource).toContain('[catalogWires, selectedCatalogWireId]');
  });
});
