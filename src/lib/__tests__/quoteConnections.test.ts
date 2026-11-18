import { describe, expect, it } from 'vitest';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { getQuoteMaterials } from '@/lib/quoteMaterials';
import { getQuoteProcessing } from '@/lib/quoteProcessing';
import { reassignMaterialEndpoint } from '@/lib/commands';
import { quoteForRole } from '../../../server/quoteService';
import { DEFAULT_PRICING_SETTINGS } from '../../../server/pricing';
import type { CatalogSnapshot } from '@/types/catalog';
import type { HarnessConfig } from '@/types/harness';

function fixture() {
  const config: HarnessConfig = {
    ...createFallbackConfig(), quantity: 1, models: [],
    quotation: { processingEnds: 2, srPoints: 0 },
    connectors: [4, 5].map((pinCount, index) => ({
      id: index ? 'b' : 'a', label: index ? 'B' : 'A', position: { x: index * 400, y: 0 }, jumpers: [],
      connector: { id: `c${index}`, resourceItemId: `c${index}`, name: 'M12', series: 'M12',
        type: 'male', pinCount, shielded: false, pinLabels: Array.from({ length: pinCount }, (_, i) => String(i + 1)) },
    })),
    materials: [{ id: 'w', resourceItemId: 'w', name: '六芯屏蔽线', position: { x: 100, y: 0 }, width: 100,
      circuits: Array.from({ length: 6 }, (_, coreIndex) => ({
        id: `core${coreIndex}`, coreIndex, color: '黑色', signalName: '',
        ...(coreIndex ? {} : {
          start: { connectorId: 'a', connectorSide: 'right' as const, pin: 2 },
          end: { connectorId: 'b', connectorSide: 'left' as const, pin: 3 },
        }),
      })),
      spec: { kind: 'jacketed', coreCount: 6, shielded: true, awg: 24, jacketMaterial: 'PVC', jacketColor: 'black',
        odMm: 5, coreColors: Array(6).fill('黑色'), lengthMm: 300,
        endTreatment: { start: { stripped: false, termination: 'none' }, end: { stripped: false, termination: 'none' } } },
    }],
  };
  const spec = config.materials[0].spec;
  const catalog = { connectors: config.connectors.map(c => c.connector),
    wires: [{ id: 'w', resourceItemId: 'w', name: '六芯屏蔽线', spec: { ...spec, outerDiameterMm: 5 } }],
    overmolds: [{ id: 'm', resourceItemId: 'm', name: '外模', outerMaterial: '黑色PVC', outerHardness: '45P',
      outerForm: 'straight', innerMaterial: '低密度透明PE', innerForm: 'straight' }],
    loadedAt: 0, wireColors: [], leadTimeOptions: [], protectionOptions: [], pricingRules: [], quantityDiscountRules: [],
  } as CatalogSnapshot;
  return { config, catalog };
}

function quote(config: HarnessConfig, catalog: CatalogSnapshot) {
  const prices = getQuoteMaterials(config, catalog).map(row => ({ ...row, taxIncludedPrice: '2' }));
  const result = quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer');
  expect(result.status, JSON.stringify(result)).toBe('ready');
  if (!('price' in result) || !result.price.breakdown) throw new Error(JSON.stringify(result));
  return result.price.breakdown;
}

describe('quotation from canvas connections', () => {
  it('quotes mixed specifications without molds or manual counts, using only the connected core', () => {
    const { config, catalog } = fixture();
    const before = structuredClone(config);
    const price = quote(config, catalog);
    expect(price.materials.map(row => row.kind)).toEqual(['connector', 'connector', 'wire']);
    expect(price.labor.find(row => row.name === '焊接')).toMatchObject({ points: 2, amount: '0.4' });
    expect(price.labor.find(row => row.name === '去皮')).toMatchObject({ points: 2, amount: '0.1' });
    expect(price.labor.find(row => row.name === '成型')).toMatchObject({ points: 0, amount: '0' });
    expect(config).toEqual(before);
  });

  it('counts a drawn split as two pin joints and one core strip at that end', () => {
    const { config, catalog } = fixture();
    const branched = reassignMaterialEndpoint(config, {
      materialId: 'w', circuitId: 'core0', endpoint: 'start', connectorId: 'a', connectorSide: 'right', pin: 1, pins: [1, 2],
    });
    branched.materials[0].spec.endTreatment.start.termination = 'terminal';
    const price = quote(branched, catalog);
    expect(price.labor.find(row => row.name === '焊接')?.points).toBe(3);
    expect(price.labor.find(row => row.name === '去皮')?.points).toBe(2);
    expect(getQuoteProcessing(branched).crimpingPoints).toBe(1);
    expect(price.labor.some(row => row.name === '压端子')).toBe(false);
  });

  it('does not multiply shared pin networks by the number of circuits or duplicate jumper edges', () => {
    const { config, catalog } = fixture();
    config.materials[0].circuits[1].start = { connectorId: 'a', connectorSide: 'right', pin: 1 };
    config.connectors[0].jumpers = [
      { id: 'j1', side: 'right', pins: [1, 2, 3] },
      { id: 'j2', side: 'right', pins: [2, 3] },
    ];
    const price = quote(config, catalog);
    expect(price.labor.find(row => row.name === '焊接')?.points).toBe(4);
    expect(price.labor.find(row => row.name === '去皮')?.points).toBe(3);
  });

  it('recalculates from connections even if previous manually entered totals were saved', () => {
    const { config, catalog } = fixture();
    config.quotation = { ...config.quotation!, weldingPoints: 1, strippingPoints: 1, crimpingPoints: 1 };
    expect(quote(config, catalog).labor.find(row => row.name === '焊接')?.points).toBe(2);
  });

  it('counts separately connected cores on the same pin as separate solder operations', () => {
    const { config, catalog } = fixture();
    config.materials[0].circuits[1].start = { ...config.materials[0].circuits[0].start! };
    const price = quote(config, catalog);
    expect(price.labor.find(row => row.name === '焊接')?.points).toBe(3);
    expect(price.labor.find(row => row.name === '去皮')?.points).toBe(3);
  });

  it('does not invent connections when all cores are unassigned or the circuit array is empty', () => {
    const { config, catalog } = fixture();
    config.materials[0].circuits = [];
    const price = quote(config, catalog);
    for (const name of ['焊接', '去皮', '去外皮', '处理编织', '热缩编织']) {
      expect(price.labor.find(row => row.name === name)?.points).toBe(0);
    }
  });

  it('charges a shield joint only at a connected shielded connector', () => {
    const { config, catalog } = fixture();
    catalog.connectors[0].shielded = true;
    const price = quote(config, catalog);
    expect(price.labor.find(row => row.name === '焊接')?.points).toBe(3);
    expect(price.labor.find(row => row.name === '去皮')?.points).toBe(2);
  });

  it('charges only the outer and inner molds actually placed, including a single molded end', () => {
    const { config, catalog } = fixture();
    config.models = [{ id: 'm', kind: 'outer-box', overmoldSpecId: 'm', includeInnerMold: true,
      position: { x: 0, y: 0 }, width: 30, height: 30 }];
    const price = quote(config, catalog);
    expect(price.materials.find(row => row.kind === 'outer-mold')?.points).toBe(1);
    expect(price.materials.find(row => row.kind === 'inner-mold')?.points).toBe(1);
    expect(price.labor.find(row => row.name === '成型')?.points).toBe(2);
  });

  it('blocks references to nonexistent pins rather than silently producing a cheaper quote', () => {
    const { config, catalog } = fixture();
    config.materials[0].circuits[0].start!.pin = 99;
    const prices = getQuoteMaterials(config, catalog).map(row => ({ ...row, taxIncludedPrice: '2' }));
    expect(quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer').status).toBe('blocked');
  });

  it.each(['start', 'end'] as const)('counts a free tinned end once when the connector is on the material %s', endpoint => {
    const { config, catalog } = fixture();
    config.connectors.pop();
    config.quotation = { processingEnds: 1, srPoints: 0, endpointBType: 'strip-tin' };
    const circuit = config.materials[0].circuits[0];
    const ref = circuit.start!;
    circuit.start = undefined;
    circuit.end = undefined;
    circuit[endpoint] = ref;
    const freeEnd = endpoint === 'start' ? 'end' : 'start';
    config.materials[0].spec.endTreatment[freeEnd] = { stripped: true, termination: 'tinned' };
    const price = quote(config, catalog);
    expect(price.labor.find(row => row.name === '焊接')?.points).toBe(1);
    expect(price.labor.find(row => row.name === '去皮')?.points).toBe(7);
    expect(price.labor.find(row => row.name === '沾锡')?.points).toBe(7);
    expect(price.labor.find(row => row.name === '去外皮')?.points).toBe(2);
  });
});
