import type { SupabaseClient } from '@supabase/supabase-js';
import { staticCatalogOptions } from '@/data/catalogOptions';
import {
  CATALOG_ITEM_COLUMNS,
  CatalogItemError,
  parseCatalogItemRow,
  type CatalogItemKind,
  type CatalogItemRow,
} from '@/lib/catalogItem';
import { supabase } from '@/lib/supabaseClient';
import type { CatalogSnapshot, CatalogWire, CatalogWireSpec } from '@/types/catalog';
import type { Connector, OvermoldSpec } from '@/types/harness';

export type { CatalogWire } from '@/types/catalog';

type CatalogItemOf<K extends CatalogItemKind> = Extract<CatalogItemRow, { kind: K }>;

export class CatalogRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogRepositoryError';
  }
}

function wireSpec(item: CatalogItemOf<'wire'>): CatalogWireSpec {
  const spec = item.spec;
  return spec.kind === 'electronic'
    ? {
        kind: spec.kind,
        color: spec.conductorColor,
        awg: spec.awg,
        ulNumber: spec.ulNumber,
      }
    : {
        kind: spec.kind,
        jacketMaterial: spec.jacketMaterial,
        jacketColor: spec.jacketColor,
        awg: spec.awg,
        coreCount: spec.coreCount,
        shielded: spec.shielded,
        coreColors: [...spec.coreColors],
        ...(spec.ulNumber ? { ulNumber: spec.ulNumber } : {}),
      };
}

export class CatalogRepository {
  private readonly client: SupabaseClient | null;

  constructor(client: SupabaseClient | null = supabase) {
    this.client = client;
  }

  private requireClient(): SupabaseClient {
    if (!this.client) {
      throw new CatalogRepositoryError('Supabase 尚未配置，无法加载目录数据。');
    }
    return this.client;
  }

  private async items<K extends CatalogItemKind>(kind: K): Promise<Array<CatalogItemOf<K>>> {
    const { data, error } = await this.requireClient()
      .from('catalog_items')
      .select(CATALOG_ITEM_COLUMNS)
      .eq('kind', kind)
      .order('sort_order')
      .order('name');
    if (error) throw new CatalogRepositoryError(error.message);

    return (data ?? []).map((value) => {
      try {
        const item = parseCatalogItemRow(value);
        if (item.kind !== kind) throw new CatalogItemError('目录类型与查询条件不一致。');
        return item as CatalogItemOf<K>;
      } catch (cause) {
        if (cause instanceof CatalogItemError) {
          const label = value && typeof value === 'object' && 'name' in value
            ? String(value.name)
            : kind;
          throw new CatalogRepositoryError(`目录数据无效: ${label}`);
        }
        throw cause;
      }
    });
  }

  private async imageUrl(path: string | null): Promise<string | undefined> {
    if (!path) return undefined;
    try {
      const { data, error } = await this.requireClient()
        .storage
        .from('catalog-assets')
        .createSignedUrl(path, 60 * 60);
      return error ? undefined : data?.signedUrl;
    } catch {
      return undefined;
    }
  }

  private async imageVariants(paths: Record<string, string>): Promise<Record<string, string>> {
    const entries = await Promise.all(Object.entries(paths).map(async ([role, path]) => {
      const url = await this.imageUrl(path);
      return url ? [role, url] as const : null;
    }));
    return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null));
  }

  async listConnectors(): Promise<Connector[]> {
    const items = await this.items('connector');
    return Promise.all(items.map(async (item) => ({
      id: item.code,
      resourceItemId: item.id,
      name: item.name,
      model: item.model,
      manufacturer: item.manufacturer,
      resourceGroup: item.resource_group,
      description: item.description,
      series: item.spec.series,
      pinCount: item.spec.pinCount,
      rowCount: item.spec.rowCount,
      pitch: item.spec.pitchMm,
      type: item.spec.connectorType,
      pinLabels: [...item.spec.pinLabels],
      imageVariants: await this.imageVariants(item.image_variants),
      housingMaterial: item.spec.housingMaterial,
      contactMaterial: item.spec.contactMaterial,
      nutMaterial: item.spec.nutMaterial,
      image: await this.imageUrl(item.image_path),
    } satisfies Connector)));
  }

  async listWires(): Promise<CatalogWire[]> {
    const items = await this.items('wire');
    return Promise.all(items.map(async (item) => ({
      id: item.code,
      resourceItemId: item.id,
      name: item.name,
      spec: wireSpec(item),
      image: await this.imageUrl(item.image_path),
    })));
  }

  async listOvermolds(): Promise<OvermoldSpec[]> {
    const items = await this.items('overmold');
    return Promise.all(items.map(async (item) => ({
      id: item.code,
      resourceItemId: item.id,
      name: item.name,
      outerMaterial: item.spec.outerMaterial,
      outerHardness: item.spec.outerHardness,
      innerMaterial: item.spec.innerMaterial,
      innerMaterialOptional: item.spec.innerMaterialOptional,
      image: await this.imageUrl(item.image_path),
    } satisfies OvermoldSpec)));
  }

  async loadSnapshot(): Promise<CatalogSnapshot> {
    const [connectors, wires, overmolds] = await Promise.all([
      this.listConnectors(),
      this.listWires(),
      this.listOvermolds(),
    ]);
    return {
      connectors,
      wires,
      overmolds,
      ...staticCatalogOptions(),
      loadedAt: Date.now(),
    };
  }
}

export const catalogRepository = new CatalogRepository();
