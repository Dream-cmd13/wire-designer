import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PartPickerDialog } from '@/components/shared/PartPickerDialog';
import { useCatalogStore } from '@/stores/catalogStore';
import { setCatalogSnapshot } from '@/lib/catalogRuntime';

const partPickerSource = readFileSync('src/components/shared/PartPickerDialog.tsx', 'utf8');
const overmoldPickerSource = readFileSync('src/components/shared/OvermoldPickerDialog.tsx', 'utf8');
const wireDialogSource = readFileSync('src/components/canvas/WireMaterialDialog.tsx', 'utf8');

describe('Dialogs catalogStore integration contracts', () => {
  it('PartPickerDialog consumes catalogStore connectors and removes listConnectors network call', () => {
    expect(partPickerSource).toContain("import { useCatalogStore } from '@/stores/catalogStore'");
    expect(partPickerSource).toContain("getCatalogConnectors");
    expect(partPickerSource).toContain("useCatalogStore((state) => getCatalogConnectors(state.snapshot))");
    expect(partPickerSource).not.toContain('catalogRepository.listConnectors()');
    expect(partPickerSource).toContain("'series'");
    expect(partPickerSource).toContain("'shielded'");
    expect(partPickerSource).toContain("c.shielded === true");
    expect(partPickerSource).toContain("c.shielded === false");
    expect(partPickerSource).toContain('shieldLabel !== null');
    expect(partPickerSource).toContain('工程与电气规格');
    expect(partPickerSource).toContain("if (a === '万连') return -1");
    expect(partPickerSource).toContain("if (b === '万连') return 1");
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
    expect(wireDialogSource).toContain('useCatalogStore((state) => getCatalogWires(state.snapshot))');
    expect(wireDialogSource).not.toContain('catalogRepository.listWires()');
  });

  it('renders PartPickerDialog with connectors, series and engineering specs in detail panel', () => {
    const mockSnapshot = {
      connectors: [
        {
          id: 'm12-conn-1',
          resourceItemId: 'res-m12-1',
          name: 'M12 4芯公头连接器',
          model: 'M12A04-07-093',
          manufacturer: 'Binder',
          series: 'M12-A',
          type: 'male' as const,
          pinCount: 4,
          pitch: 2.5,
          shielded: true,
          ratedVoltageV: 250,
          ratedCurrentA: 4,
          temperatureRangeC: { min: -40, max: 85 },
          ingressProtection: 'IP67',
          flammabilityRating: 'UL94 V-0',
          matingCyclesMin: 500,
          housingMaterial: '黄铜镀镍',
          contactMaterial: '黄铜镀金',
          pinLabels: ['1', '2', '3', '4'],
        },
      ],
      wires: [],
      wireColors: [],
      overmolds: [],
      leadTimeOptions: [],
      protectionOptions: [],
      pricingRules: [],
      quantityDiscountRules: [],
      loadedAt: 0,
    };
    setCatalogSnapshot(mockSnapshot);
    useCatalogStore.setState({
      status: 'ready',
      snapshot: mockSnapshot,
    });
    useCatalogStore.getInitialState = () => useCatalogStore.getState();

    const html = renderToStaticMarkup(
      <PartPickerDialog
        isOpen={true}
        onClose={() => undefined}
        onSelect={() => undefined}
        currentConnectorId="m12-conn-1"
      />,
    );

    expect(html).toContain('选择连接器型号');
    expect(html).toContain('M12 4芯公头连接器');
    expect(html).toContain('M12A04-07-093');
    expect(html).toContain('Binder');
    expect(html).toContain('M12-A');
    expect(html).toContain('已屏蔽');
    expect(html).toContain('工程与电气规格');
    expect(html).toContain('250V');
    expect(html).toContain('4A');
    expect(html).toContain('-40 ~ 85 ℃');
    expect(html).toContain('IP67');
    expect(html).toContain('UL94 V-0');
    expect(html).toContain('500');
  });
});
