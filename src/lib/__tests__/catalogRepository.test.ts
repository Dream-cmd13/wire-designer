import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { CatalogRepository, CatalogRepositoryError } from '@/lib/catalogRepository';

function fakeClient(
  tables: Record<string, unknown[]>,
  queries: string[] = [],
  signedUrl?: string,
): SupabaseClient {
  return {
    from(table: string) {
      queries.push(table);
      let rows = [...(tables[table] ?? [])] as Array<Record<string, unknown>>;
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          rows = rows.filter((item) => item[column] === value);
          return query;
        },
        order: () => query,
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return query;
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: signedUrl ? { signedUrl } : null,
          error: signedUrl ? null : { message: 'image unavailable' },
        }),
      }),
    },
  } as unknown as SupabaseClient;
}

const common = {
  manufacturer: '',
  resource_group: '绘图资源',
  description: '',
  image_path: null,
  image_variants: {},
  sort_order: 10,
};

describe('CatalogRepository', () => {
  it('loads only dynamic catalog items and merges static business options', async () => {
    const queries: string[] = [];
    const repository = new CatalogRepository(fakeClient({ catalog_items: [] }, queries));

    const snapshot = await repository.loadSnapshot();

    expect(queries).toEqual(['catalog_items', 'catalog_items', 'catalog_items']);
    expect(snapshot.wireColors).toHaveLength(14);
    expect(snapshot.leadTimeOptions.map((option) => option.id))
      .toEqual(['rush', 'standard', 'economy']);
    expect(snapshot).not.toHaveProperty('wireTypes');
    expect(snapshot).not.toHaveProperty('wireGauges');
  });

  it('loads wire catalog specs from a unified catalog item', async () => {
    const repository = new CatalogRepository(fakeClient({
      catalog_items: [{
        id: 'wire-1',
        kind: 'wire',
        code: 'ul1007-red-24',
        name: 'UL1007 24AWG 红线',
        model: 'UL1007-24-RED',
        ...common,
        spec: { kind: 'electronic', awg: 24, ulNumber: '1007', conductorColor: 'red' },
      }],
    }));

    await expect(repository.listWires()).resolves.toEqual([expect.objectContaining({
      id: 'ul1007-red-24',
      resourceItemId: 'wire-1',
      name: 'UL1007 24AWG 红线',
      spec: { kind: 'electronic', awg: 24, ulNumber: '1007', color: 'red' },
    })]);
  });

  it('signs an item image without dropping the catalog item on failure', async () => {
    const row = {
        id: 'connector-1',
      kind: 'connector',
      code: 'xh254-4p-f',
      name: 'XH2.54-4P',
      model: 'XH2.54-4P-F',
      ...common,
      image_path: 'connector/xh254.png',
        spec: { connectorType: 'female', series: 'XH2.54', pinCount: 4, rowCount: 1, pitchMm: 2.54, pinLabels: ['1', '2', '3', '4'] },
    };
    const signed = new CatalogRepository(fakeClient({ catalog_items: [row] }, [], 'https://assets.example/xh254.png'));
    const failed = new CatalogRepository(fakeClient({ catalog_items: [row] }));

    await expect(signed.listConnectors()).resolves.toEqual([
      expect.objectContaining({
        image: 'https://assets.example/xh254.png',
        model: 'XH2.54-4P-F',
        resourceGroup: '绘图资源',
        description: '',
        series: 'XH2.54',
        rowCount: 1,
      }),
    ]);
    await expect(failed.listConnectors()).resolves.toEqual([
      expect.objectContaining({ id: 'xh254-4p-f', image: undefined }),
    ]);
  });

  it('maps connector and wire engineering fields and common wire metadata', async () => {
    const repository = new CatalogRepository(fakeClient({ catalog_items: [
      {
        id: 'connector-real', kind: 'connector', code: 'm12a04-07-068',
        name: 'M12A04-07-068', model: 'M12A04-07-068', ...common,
        spec: {
          connectorType: 'male', series: 'M12 A-Coded', pinCount: 4, rowCount: 1,
          pinLabels: ['1', '2', '3', '4'], shielded: true, ratedVoltageV: 60,
          ratedCurrentA: 4, temperatureRangeC: { min: -40, max: 105 },
          ingressProtection: 'IP67', flammabilityRating: 'UL94V-0', matingCyclesMin: 500,
        },
      },
      {
        id: 'wire-real', kind: 'wire', code: 'wl-htx-pvc-033', name: 'WL-HTX-PVC-033',
        model: 'WL-HTX-PVC-033', manufacturer: '', resource_group: '护套线', description: '真实线材',
        image_path: null, image_variants: {}, sort_order: 1,
        spec: {
          kind: 'jacketed', ulNumber: 'UL2464', awg: 22, coreCount: 4, shielded: true,
          coreColors: ['棕色', '白色', '蓝色', '黑色'], coreColorDescription: '棕白蓝黑',
          jacketMaterial: 'PVC', jacketColor: 'black', ratedVoltageV: 300,
          temperatureRangeC: { max: 80 }, flameTest: 'VW-1', rohsCompliant: true,
          conductorMaterial: '镀锡铜丝', conductorStructure: '17/0.16TC',
          insulationMaterial: 'PVC', insulationDiameterMm: 1.3, insulationDiameterToleranceMm: 0.05,
          braidStructure: '16*5/0.10TC', shieldCoverageRatio: 0.6,
          outerDiameterMm: 5.2, outerDiameterToleranceMm: 0.2, jacketHardnessP: 60,
          tensileStrengthPsi: 1500, elongationPercent: 100,
          conductorResistanceOhmPerKmAt20C: 59.4, insulationResistanceMOhmKm: 10,
        },
      },
    ] }));

    await expect(repository.listConnectors()).resolves.toEqual([
      expect.objectContaining({
        resourceItemId: 'connector-real', shielded: true, ratedVoltageV: 60,
        ratedCurrentA: 4, temperatureRangeC: { min: -40, max: 105 }, matingCyclesMin: 500,
      }),
    ]);
    await expect(repository.listWires()).resolves.toEqual([
      expect.objectContaining({
        resourceItemId: 'wire-real', model: 'WL-HTX-PVC-033', resourceGroup: '护套线',
        spec: expect.objectContaining({ outerDiameterMm: 5.2, shieldCoverageRatio: 0.6 }),
      }),
    ]);
  });

  it('signs connector image variants independently', async () => {
    const repository = new CatalogRepository(fakeClient({ catalog_items: [{
      id: 'connector-1',
      kind: 'connector',
      code: 'm12a04-07-093',
      name: 'M12',
      model: 'M12A04-07-093',
      ...common,
      image_variants: {
        before: 'connector/before.png',
        after: 'connector/after.png',
        pinMap: 'connector/pin-map.png',
      },
      spec: { connectorType: 'male', pinCount: 4, pinLabels: ['1', '2', '3', '4'] },
    }] }, [], 'https://assets.example/image.png'));

    await expect(repository.listConnectors()).resolves.toEqual([
      expect.objectContaining({
        imageVariants: {
          before: 'https://assets.example/image.png',
          after: 'https://assets.example/image.png',
          pinMap: 'https://assets.example/image.png',
        },
      }),
    ]);
  });

  it('rejects a wire resource without a valid spec', async () => {
    const repository = new CatalogRepository(fakeClient({
      catalog_items: [{
        id: 'wire-2',
        kind: 'wire',
        code: 'invalid',
        name: 'invalid',
        model: 'INVALID',
        ...common,
        spec: {},
      }],
    }));

    await expect(repository.listWires()).rejects.toThrow(CatalogRepositoryError);
  });

  it('loads overmold catalog specs with outerForm and innerForm', async () => {
    const repository = new CatalogRepository(fakeClient({
      catalog_items: [{
        id: 'om-1',
        kind: 'overmold',
        code: 'pvc-45p-pe',
        name: 'PVC 45P 直头',
        model: 'PVC-45P-S',
        ...common,
        spec: {
          outerMaterial: '黑色PVC',
          outerHardness: '45P',
          outerForm: 'straight',
          innerMaterial: '低密度透明PE',
          innerForm: 'straight',
        },
      }],
    }));

    await expect(repository.listOvermolds()).resolves.toEqual([expect.objectContaining({
      id: 'pvc-45p-pe',
      resourceItemId: 'om-1',
      name: 'PVC 45P 直头',
      outerMaterial: '黑色PVC',
      outerHardness: '45P',
      outerForm: 'straight',
      innerMaterial: '低密度透明PE',
      innerForm: 'straight',
    })]);
  });
});
