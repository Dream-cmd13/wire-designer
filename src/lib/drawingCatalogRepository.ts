import { supabase } from '@/lib/supabaseClient';
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
export type DrawingCatalogClient = { from(table: string): SelectableTable };

type UnknownRow = Record<string, unknown>;

export class DrawingCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawingCatalogError';
  }
}

function record(value: unknown): UnknownRow {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as UnknownRow;
  if (Array.isArray(value) && value[0] && typeof value[0] === 'object') return value[0] as UnknownRow;
  return {};
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resourceType(value: unknown): DrawingCatalogResourceType | null {
  if (value === 'connector' || value === 'wire' || value === 'model' || value === 'accessory' || value === 'packaging') return value;
  if (value === 'overmold') return 'model';
  if (value === 'protective_sleeve') return 'accessory';
  return null;
}

function mapCatalogRow(row: UnknownRow): DrawingCatalogResource | null {
  const type = resourceType(row.item_type);
  if (!type) return null;
  const connector = record(row.connector_specs);
  const wire = record(row.wire_specs);
  const model = record(row.model_specs);
  const accessory = record(row.accessory_specs);
  const packaging = record(row.packaging_specs);
  const category = record(row.catalog_categories);
  const images = Array.isArray(row.catalog_item_images) ? row.catalog_item_images.map(record) : [];
  const primaryImage = images.sort((left, right) => Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary)))[0];
  const connectorType = text(connector.connector_type);
  const gender = connectorType === 'male' || connectorType === 'female' || connectorType === 'receptacle' ? connectorType : undefined;
  const specification = text(accessory.specification) || text(packaging.specification) || text(wire.cable_type) || text(model.model_kind);
  return {
    id: text(row.legacy_key, text(row.id)),
    catalogItemId: text(row.id),
    resourceType: type,
    name: text(row.resource_name),
    model: text(row.model),
    category: text(category.name),
    imageUrl: text(primaryImage?.signed_url) || undefined,
    gender,
    series: text(connector.series) || undefined,
    pinCount: numberValue(connector.pin_count),
    rowCount: numberValue(connector.row_count),
    pitchMm: numberValue(connector.pitch_mm),
    specification: specification || undefined,
    unit: text(accessory.unit) || text(packaging.unit) || undefined,
  };
}

function normalized(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase();
}

export function filterDrawingCatalogResources(resources: DrawingCatalogResource[], filters: DrawingCatalogFilters): DrawingCatalogResource[] {
  const query = normalized(filters.query);
  return resources.filter((resource) => {
    if (filters.resourceType && resource.resourceType !== filters.resourceType) return false;
    if (filters.gender && resource.gender !== filters.gender) return false;
    if (filters.category && resource.category !== filters.category) return false;
    if (filters.series && resource.series !== filters.series) return false;
    if (filters.pinCount !== undefined && resource.pinCount !== filters.pinCount) return false;
    if (filters.rowCount !== undefined && resource.rowCount !== filters.rowCount) return false;
    if (filters.pitchMm !== undefined && resource.pitchMm !== filters.pitchMm) return false;
    return !query || normalized(`${resource.name} ${resource.model} ${resource.series ?? ''} ${resource.category}`).includes(query);
  });
}

function isDrawingDocument(value: unknown): value is DrawingDocument {
  const row = record(value);
  const page = record(row.page);
  const titleBlock = record(row.titleBlock);
  return row.schemaVersion === 1
    && typeof row.id === 'string'
    && typeof row.name === 'string'
    && page.width === 1200
    && page.height === 800
    && Array.isArray(row.objects)
    && typeof titleBlock.title === 'string';
}

export class DrawingCatalogRepository {
  private readonly client: DrawingCatalogClient;

  constructor(client: DrawingCatalogClient) {
    this.client = client;
  }

  private async rows(table: string, columns: string): Promise<UnknownRow[]> {
    const { data, error } = await this.client.from(table).select(columns);
    if (error) throw new DrawingCatalogError(error.message);
    return (data ?? []).map(record);
  }

  async listResources(filters: DrawingCatalogFilters = {}): Promise<DrawingCatalogResource[]> {
    const rows = await this.rows('catalog_items', 'id,legacy_key,item_type,resource_name,model,short_description,display_order,lifecycle_status,deleted_at,catalog_categories(name),connector_specs(connector_type,series,pin_count,row_count,pitch_mm),wire_specs(cable_type),model_specs(model_kind),accessory_specs(specification,unit),packaging_specs(specification,unit),catalog_item_images(storage_path,is_primary,display_order)');
    const resources = rows
      .filter((row) => row.lifecycle_status !== 'inactive' && !row.deleted_at)
      .map(mapCatalogRow)
      .filter((resource): resource is DrawingCatalogResource => Boolean(resource));
    return filterDrawingCatalogResources(resources, filters);
  }

  async listTemplates(): Promise<DrawingTemplateSummary[]> {
    const rows = await this.rows('drawing_templates', 'id,name,category,description,thumbnail_path,current_version,status,display_order,deleted_at');
    return rows.filter((row) => row.status === 'active' && !row.deleted_at).map((row) => ({
      id: text(row.id), name: text(row.name), category: text(row.category), description: text(row.description),
      thumbnailPath: text(row.thumbnail_path) || undefined, currentVersion: numberValue(row.current_version) ?? 1,
    }));
  }

  async loadTemplate(templateId: string): Promise<DrawingDocument> {
    const rows = await this.rows('drawing_template_versions', 'template_id,version_no,schema_version,drawing_json');
    const row = rows.filter((candidate) => candidate.template_id === templateId).sort((left, right) => Number(right.version_no) - Number(left.version_no))[0];
    if (!row) throw new DrawingCatalogError('未找到图库模板。');
    if (row.schema_version !== 1 || !isDrawingDocument(row.drawing_json)) throw new DrawingCatalogError('模板版本不受支持。');
    return row.drawing_json;
  }

  async listCommonPhrases(): Promise<DrawingCommonPhrase[]> {
    const rows = await this.rows('drawing_common_phrases', 'id,category,phrase,is_active,display_order,deleted_at');
    return rows.filter((row) => row.is_active !== false && !row.deleted_at).map((row) => ({ id: text(row.id), category: text(row.category), phrase: text(row.phrase) }));
  }

  async listIcons(): Promise<DrawingIconResource[]> {
    const rows = await this.rows('drawing_icons', 'id,name,category,svg_path,default_width,default_height,is_active,display_order,deleted_at');
    return rows.filter((row) => row.is_active !== false && !row.deleted_at).map((row) => ({
      id: text(row.id), name: text(row.name), category: text(row.category), svgPath: text(row.svg_path),
      defaultWidth: numberValue(row.default_width) ?? 24, defaultHeight: numberValue(row.default_height) ?? 24,
    }));
  }
}

export const drawingCatalogRepository = supabase
  ? new DrawingCatalogRepository(supabase as unknown as DrawingCatalogClient)
  : null;
