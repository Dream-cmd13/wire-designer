import { describe, expect, it } from 'vitest';
import { generateAutoQuoteDrawingSvg } from '@/lib/autoQuoteDrawing';
import type { AutoQuoteFormState } from '@/lib/autoQuote';
import type { CatalogSnapshot } from '@/types/catalog';

const mockCatalog: CatalogSnapshot = {
  connectors: [
    {
      id: 'conn-1',
      name: 'M12-4Pin-公头',
      model: 'M12-A-04P-M',
      pinCount: 4,
      type: 'male',
      pinLabels: ['1', '2', '3', '4'],
    },
    {
      id: 'conn-2',
      name: 'M8-3Pin-母头',
      model: 'M8-A-03P-F',
      pinCount: 3,
      type: 'female',
      pinLabels: ['1', '2', '3'],
    },
  ],
  wires: [
    {
      id: 'wire-1',
      resourceItemId: 'wire-res-1',
      name: 'UL2464 24AWG 4芯黑色护套线',
      model: 'UL2464',
      spec: {
        kind: 'jacketed',
        awg: 24,
        coreCount: 4,
        jacketMaterial: 'PVC',
        jacketColor: 'black',
        shielded: true,
        coreColors: ['黑色', '棕色', '蓝色', '白色'],
        outerDiameterMm: 5.0,
      },
    },
  ],
  overmolds: [
    {
      id: 'mold-1',
      name: 'M12直头黑色外模',
      outerMaterial: '黑色PVC',
      outerHardness: '45P',
      outerForm: 'straight',
      innerMaterial: '低密度透明PE',
      innerForm: 'straight',
    },
  ],
  wireColors: [],
  protectionOptions: [],
  leadTimeOptions: [],
  pricingRules: [],
  quantityDiscountRules: [],
  loadedAt: Date.now(),
};

describe('autoQuoteDrawing', () => {
  it('generates valid SVG for double-ended harness drawing', () => {
    const form: AutoQuoteFormState = {
      connectorAId: 'conn-1',
      endpointBType: 'connector',
      connectorBId: 'conn-2',
      outerMoldSpecId: 'mold-1',
      innerMoldType: 'none',
      wireResourceId: 'wire-res-1',
      lengthMm: 1200,
      quantity: 500,
    };

    const svg = generateAutoQuoteDrawingSvg(form, mockCatalog);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('M12-4Pin-公头');
    expect(svg).toContain('M8-3Pin-母头');
    expect(svg).toContain('1200 mm');
    expect(svg).toContain('PVC 45P 外模');
    expect(svg).toContain('结构物料清单（BOM 清单）');
    expect(svg).toContain('报价确认结构示意图');
    expect(svg.match(/>PVC 45P 外模</g)).toHaveLength(2);
    const withInner = generateAutoQuoteDrawingSvg({ ...form, innerMoldType: 'pe' }, mockCatalog);
    expect(withInner).toContain('A/B 双端内模');
    expect(withInner.match(/x="425" y="14">2</g)).toHaveLength(2);

  });

  it('generates valid SVG for cut endpoint (单端切断)', () => {
    const form: AutoQuoteFormState = {
      connectorAId: 'conn-1',
      endpointBType: 'cut',
      connectorBId: '',
      outerMoldSpecId: 'mold-1',
      innerMoldType: 'none',
      wireResourceId: 'wire-res-1',
      lengthMm: 800,
      quantity: 200,
    };

    const svg = generateAutoQuoteDrawingSvg(form, mockCatalog);
    expect(svg).toContain('切断平齐');
    expect(svg).toContain('800 mm');
    expect(svg).not.toContain('M8-3Pin-母头');
  });
});
