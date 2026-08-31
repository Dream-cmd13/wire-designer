import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WireMaterialDialog } from '@/components/canvas/WireMaterialDialog';
import { useCatalogStore } from '@/stores/catalogStore';
import { setCatalogSnapshot } from '@/lib/catalogRuntime';
import type { CanvasWireMaterial } from '@/types/harness';

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
    expect(dialogSource).toContain('wire.model ? `(${wire.model})` :');
    expect(dialogSource).toContain('标准物料规格详情');
    expect(dialogSource).toContain('conductorStructure');
  });

  it('renders WireMaterialDialog with standard wire dropdown and full engineering specs details card', () => {
    const mockSnapshot = {
      connectors: [],
      wires: [
        {
          id: 'cw-1',
          resourceItemId: 'wire-real-001',
          name: '4芯屏蔽PUR电缆',
          model: 'PUR-4C-22AWG-SHIELD',
          spec: {
            kind: 'jacketed' as const,
            jacketMaterial: 'PUR' as const,
            jacketColor: 'black' as const,
            awg: 22,
            coreCount: 4,
            shielded: true,
            coreColors: ['black', 'brown', 'blue', 'white'],
            outerDiameterMm: 5.2,
            outerDiameterToleranceMm: 0.2,
            conductorStructure: '17/0.16TC',
            insulationDiameterMm: 1.3,
            braidStructure: '16*5/0.10TC',
            shieldCoverageRatio: 0.85,
            jacketHardnessP: 85,
            ratedVoltageV: 300,
            temperatureRangeC: { min: -40, max: 80 },
            flameTest: 'VW-1',
            rohsCompliant: true,
            conductorResistanceOhmPerKmAt20C: 59.4,
            insulationResistanceMOhmKm: 100,
            coreColorDescription: '黑色、棕色、蓝色、白色',
          },
        },
      ],
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

    const material: CanvasWireMaterial = {
      id: 'mat-1',
      name: '4芯屏蔽PUR电缆',
      resourceItemId: 'wire-real-001',
      position: { x: 0, y: 0 },
      width: 200,
      circuits: [],
      spec: {
        kind: 'jacketed',
        jacketMaterial: 'PUR',
        jacketColor: 'black',
        awg: 22,
        coreCount: 4,
        shielded: true,
        odMm: 5.2,
        outerDiameterToleranceMm: 0.2,
        coreColors: ['black', 'brown', 'blue', 'white'],
        endTreatment: {
          start: { stripped: false, termination: 'none' },
          end: { stripped: false, termination: 'none' },
        },
        lengthMm: 1000,
      },
    };

    const html = renderToStaticMarkup(
      <WireMaterialDialog
        material={material}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain('配置线材');
    expect(html).toContain('4芯屏蔽PUR电缆 (PUR-4C-22AWG-SHIELD)');
    expect(html).toContain('已关联标准物料');
    expect(html).toContain('标准物料规格详情');
    expect(html).toContain('17/0.16TC');
    expect(html).toContain('Φ1.3mm');
    expect(html).toContain('16*5/0.10TC');
    expect(html).toContain('85%');
    expect(html).toContain('5.2 ±0.2 mm');
    expect(html).toContain('85P');
    expect(html).toContain('300V');
    expect(html).toContain('最高 80℃');
    expect(html).toContain('VW-1');
    expect(html).toContain('符合 RoHS');
    expect(html).toContain('59.4 Ω/km');
  });
});

