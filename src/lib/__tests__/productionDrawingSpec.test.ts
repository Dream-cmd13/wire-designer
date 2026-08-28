import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatWireBomSpecification } from '../bom';
import type { CanvasWireMaterial } from '@/types/harness';
import type { CatalogSnapshot } from '@/types/catalog';

const twoDViewSource = readFileSync('src/components/drawings/TwoDView.tsx', 'utf8');
const bomPanelSource = readFileSync('src/components/panels/BomPanel.tsx', 'utf8');

describe('Production Drawing & BOM specifications formatting', () => {
  const mockCatalog: CatalogSnapshot = {
    connectors: [],
    wires: [
      {
        id: 'wire-real-001',
        resourceItemId: 'wire-real-001',
        name: '4芯屏蔽PUR电缆',
        model: 'PUR-4C-22AWG-SHIELD',
        spec: {
          kind: 'jacketed',
          jacketMaterial: 'PUR',
          jacketColor: 'black',
          awg: 22,
          coreCount: 4,
          shielded: true,
          coreColors: ['black', 'brown', 'blue', 'white'],
          outerDiameterMm: 5.2,
          outerDiameterToleranceMm: 0.2,
          conductorStructure: '17/0.16TC',
          insulationDiameterMm: 1.3,
          braidStructure: '16*5/0.10TC',
          coreColorDescription: '黑色、棕色、蓝色、白色',
        },
      },
    ],
    overmolds: [],
    pricingRules: [],
    wireColors: [],
    leadTimeOptions: [],
    protectionOptions: [],
    quantityDiscountRules: [],
    loadedAt: 0,
  };

  it('formats catalog jacketed wire spec with conductor, insulation, braid and tolerance', () => {
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
        lengthMm: 1500,
      },
    };

    const formatted = formatWireBomSpecification(material, mockCatalog);
    expect(formatted).toContain('4C*0.3mm²');
    expect(formatted).toContain('(17/0.16TC)*1.3+编织(16*5/0.10TC)');
    expect(formatted).toContain('OD: 5.20±0.2');
    expect(formatted).toContain('屏蔽黑色雾面PUR外被');
  });

  it('formats electronic wire spec cleanly', () => {
    const material: CanvasWireMaterial = {
      id: 'mat-2',
      name: '电子线',
      position: { x: 0, y: 0 },
      width: 200,
      circuits: [],
      spec: {
        kind: 'electronic',
        awg: 22,
        color: 'red',
        ulNumber: '1007',
        lengthMm: 300,
        endTreatment: {
          start: { stripped: true, stripLengthMm: 3, termination: 'tinned' },
          end: { stripped: false, termination: 'none' },
        },
      },
    };

    const formatted = formatWireBomSpecification(material, mockCatalog);
    expect(formatted).toContain('UL1007 22AWG (0.3mm²) 电子线 L=300mm');
    expect(formatted).toContain('单芯 红色');
  });

  it('TwoDView source code has no hardcoded M12 partNumber or wire spec strings', () => {
    expect(twoDViewSource).not.toContain("ci.partNumber === 'm12a04-07-093'");
    expect(twoDViewSource).not.toContain('(39/0.10TC)*1.2+无纺布');
    expect(twoDViewSource).toContain('formatWireBomSpecification');
  });

  it('keeps resource associations strict when a resource ID is present', () => {
    expect(twoDViewSource).toContain('if (wi.resourceItemId) return m.resourceItemId === wi.resourceItemId;');
    expect(bomPanelSource).toContain('if (resId) return connector.connector?.resourceItemId === resId;');
    expect(bomPanelSource).toContain('if (resId) return material.resourceItemId === resId;');
  });
});
