import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dialogSource = readFileSync('src/components/canvas/WireMaterialDialog.tsx', 'utf8');

describe('WireMaterialDialog catalog defaults', () => {
  it('applies the selected catalog spec through the pure adapter', () => {
    expect(dialogSource).toContain("import { applyCatalogWireSpec } from '@/lib/wireCatalog'");
    expect(dialogSource).toContain('applyCatalogWireSpec(current, selected.spec)');
    expect(dialogSource).toContain('[catalogWires, selectedCatalogWireId]');
  });

  it('removes Supabase wording and supports bidirectional matching', () => {
    expect(dialogSource).not.toContain('Supabase');
    expect(dialogSource).not.toContain('请选择线材库中的物料');
    expect(dialogSource).toContain('findMatchingCatalogWire');
    expect(dialogSource).toContain('generateWireDefaultName');
    expect(dialogSource).toContain('请选择标准线材物料');
  });
});

