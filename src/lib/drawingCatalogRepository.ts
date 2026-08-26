import {
  CATALOG_ITEM_COLUMNS,
  CatalogItemError,
  parseCatalogItemRow,
  type CatalogItemRow,
} from '@/lib/catalogItem';
import {
  listStaticDrawingCommonPhrases,
  listStaticDrawingIcons,
  listStaticDrawingTemplates,
  loadStaticDrawingTemplate,
} from '@/lib/drawingStaticResources';
import { supabase } from '@/lib/supabaseClient';
import { signCatalogImageResult, type CatalogStorageClient } from '@/lib/catalogImageUrl';
import type {
  DrawingCatalogFilters,
  DrawingCatalogResource,
  DrawingCatalogResourceType,
  DrawingCommonPhrase,
  DrawingDocument,
  DrawingIconResource,
  DrawingTemplateSummary,
} from '@/types/drawing';

type QueryError = { message: string } | null;
type QueryResult = { data: unknown[] | null; error: QueryError };
type SelectableTable = { select(columns: string): PromiseLike<QueryResult> };
type SignedUrlResult = { data: { signedUrl?: string } | null; error: QueryError };
export type DrawingCatalogClient = {
  from(table: string): SelectableTable;
  storage?: {
    from(bucket: string): {
      createSignedUrl(path: string, expiresIn: number): PromiseLike<SignedUrlResult>;
    };
  };
};

type CatalogResourceWithStoragePath = DrawingCatalogResource & { storagePath?: string };

export class DrawingCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawingCatalogError';
  }
}

function normalized(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase();
}

function resourceType(item: CatalogItemRow): DrawingCatalogResourceType {
  return item.kind === 'overmold' ? 'model' : item.kind;
}

function sleeveSpecification(item: Extract<CatalogItemRow, { kind: 'protective_sleeve' }>): string {
  const spec = item.spec;
  return [
    spec.suppliedInnerDiameterMm === undefined ? '' : `Φ${spec.suppliedInnerDiameterMm}mm`,
    spec.shrinkRatio === undefined ? '' : `${spec.shrinkRatio}:1`,
    spec.material ?? '',
    spec.color ?? '',
  ].filter(Boolean).join(' · ');
}

function mapCatalogItem(item: CatalogItemRow): CatalogResourceWithStoragePath | null {
  if (item.kind === 'protective_sleeve' && item.spec.sleeveType !== 'heat-shrink') return null;

  const common = {
    id: item.code,
    resourceItemId: item.id,
    resourceType: resourceType(item),
    name: item.name,
    model: item.model,
    resourceGroup: item.resource_group,
    storagePath: item.image_path ?? undefined,
  };

  if (item.kind === 'connector') {
    return {
      ...common,
      gender: item.spec.connectorType,
      series: item.spec.series,
      pinCount: item.spec.pinCount,
      rowCount: item.spec.rowCount,
      pitchMm: item.spec.pitchMm,
    };
  }
  if (item.kind === 'wire') {
    return { ...common, specification: item.spec.kind };
  }
  if (item.kind === 'protective_sleeve') {
    return { ...common, specification: sleeveSpecification(item), unit: 'PCS' };
  }
  if (item.kind === 'model') {
    return { ...common, specification: item.spec.modelKind };
  }
  if (item.kind === 'overmold') {
    return { ...common, specification: item.spec.outerMaterial };
  }
  return {
    ...common,
    specification: item.spec.specification,
    unit: item.spec.unit,
  };
}

export function filterDrawingCatalogResources(
  resources: DrawingCatalogResource[],
  filters: DrawingCatalogFilters,
): DrawingCatalogResource[] {
  const query = normalized(filters.query);
  return resources.filter((resource) => {
    if (filters.resourceType && resource.resourceType !== filters.resourceType) return false;
    if (filters.gender && resource.gender !== filters.gender) return false;
    if (filters.resourceGroup && resource.resourceGroup !== filters.resourceGroup) return false;
    if (filters.series && resource.series !== filters.series) return false;
    if (filters.pinCount !== undefined && resource.pinCount !== filters.pinCount) return false;
    if (filters.rowCount !== undefined && resource.rowCount !== filters.rowCount) return false;
    if (filters.pitchMm !== undefined && resource.pitchMm !== filters.pitchMm) return false;
    return !query || normalized(
      `${resource.name} ${resource.model} ${resource.series ?? ''} ${resource.resourceGroup}`,
    ).includes(query);
  });
}

export class DrawingCatalogRepository {
  private readonly client: DrawingCatalogClient | null;

  constructor(client: DrawingCatalogClient | null) {
    this.client = client;
  }

  private async catalogItems(): Promise<CatalogItemRow[]> {
    if (!this.client) throw new DrawingCatalogError('Supabase 尚未配置，无法加载目录数据。');
    const { data, error } = await this.client.from('catalog_items').select(CATALOG_ITEM_COLUMNS);
    if (error) throw new DrawingCatalogError(error.message);
    try {
      return (data ?? [])
        .map(parseCatalogItemRow)
        .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name));
    } catch (cause) {
      if (cause instanceof CatalogItemError) throw new DrawingCatalogError(cause.message);
      throw cause;
    }
  }

  async listResources(filters: DrawingCatalogFilters = {}): Promise<DrawingCatalogResource[]> {
    const mapped = (await this.catalogItems())
      .map(mapCatalogItem)
      .filter((resource): resource is CatalogResourceWithStoragePath => Boolean(resource));
    const storage = this.client?.storage;
    const resources = await Promise.all(mapped.map(async ({ storagePath, ...resource }) => {
      if (!storagePath || !storage) return resource;
      const result = await signCatalogImageResult({ storage } as CatalogStorageClient, storagePath);
      if (result.error) return { ...resource, imageError: result.error };
      return result.signedUrl
        ? { ...resource, imageUrl: result.signedUrl }
        : { ...resource, imageError: '资源图片签名地址为空。' };
    }));
    return filterDrawingCatalogResources(resources, filters);
  }

  async listTemplates(): Promise<DrawingTemplateSummary[]> {
    return listStaticDrawingTemplates();
  }

  async loadTemplate(templateId: string): Promise<DrawingDocument> {
    const document = loadStaticDrawingTemplate(templateId);
    if (!document) throw new DrawingCatalogError('未找到图库模板。');
    return document;
  }

  async listCommonPhrases(): Promise<DrawingCommonPhrase[]> {
    return listStaticDrawingCommonPhrases();
  }

  async listIcons(): Promise<DrawingIconResource[]> {
    return listStaticDrawingIcons();
  }
}

export const drawingCatalogRepository = new DrawingCatalogRepository(
  supabase as unknown as DrawingCatalogClient | null,
);
