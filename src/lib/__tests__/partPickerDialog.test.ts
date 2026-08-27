import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const partPickerSource = readFileSync('src/components/shared/PartPickerDialog.tsx', 'utf8');
const overmoldPickerSource = readFileSync('src/components/shared/OvermoldPickerDialog.tsx', 'utf8');
const wireDialogSource = readFileSync('src/components/canvas/WireMaterialDialog.tsx', 'utf8');

describe('Dialogs catalogStore integration contracts', () => {
  it('PartPickerDialog consumes catalogStore connectors and removes listConnectors network call', () => {
    expect(partPickerSource).toContain("import { useCatalogStore } from '@/stores/catalogStore'");
    expect(partPickerSource).toContain("import { getCatalogConnectors } from '@/lib/catalogRuntime'");
    expect(partPickerSource).toContain('const connectors = useCatalogStore((state) => getCatalogConnectors(state.snapshot))');
    expect(partPickerSource).not.toContain('catalogRepository.listConnectors()');
  });

  it('OvermoldPickerDialog consumes catalogStore overmolds and removes listOvermolds network call', () => {
    expect(overmoldPickerSource).toContain("import { useCatalogStore } from '@/stores/catalogStore'");
    expect(overmoldPickerSource).toContain("import { getCatalogOvermolds } from '@/lib/catalogRuntime'");
    expect(overmoldPickerSource).toContain('const overmolds = useCatalogStore((state) => getCatalogOvermolds(state.snapshot))');
    expect(overmoldPickerSource).not.toContain('catalogRepository.listOvermolds()');
    expect(overmoldPickerSource).toContain("type FilterKey = 'outerMaterial' | 'outerForm'");
    expect(overmoldPickerSource).toContain("const FIXED_OUTER_MATERIALS = ['黑色PVC 45P', '黑色TPE']");
    expect(overmoldPickerSource).toContain("const FIXED_OUTER_FORMS = ['直头', '弯头']");
    expect(overmoldPickerSource).toContain('const selectedOvermold = results.find');
    expect(overmoldPickerSource).toContain('包含内模');
  });

  it('WireMaterialDialog consumes catalogStore wires and removes listWires network call', () => {
    expect(wireDialogSource).toContain('getCatalogWires');
    expect(wireDialogSource).toContain('const catalogWires = useCatalogStore((state) => getCatalogWires(state.snapshot))');
    expect(wireDialogSource).not.toContain('catalogRepository.listWires()');
  });
});
