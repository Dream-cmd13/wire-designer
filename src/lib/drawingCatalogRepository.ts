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
type SignedUrlResult = { data: { signedUrl?: string } | null; error: QueryError };
export type DrawingCatalogClient = {
  from(table: string): SelectableTable;
  storage?: { from(bucket: string): { createSignedUrl(path: string, expiresIn: number): PromiseLike<SignedUrlResult> } };
};

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
  if (value === 'connector' || value === 'wire' || value === 'protective_sleeve' || value === 'model' || value === 'accessory' || value === 'packaging') return value;
  if (value === 'overmold') return 'model';
  return null;
}

type CatalogResourceWithStoragePath = DrawingCatalogResource & { storagePath?: string };

function mapCatalogRow(row: UnknownRow): CatalogResourceWithStoragePath | null {
  const type = resourceType(row.resource_type);
  if (!type) return null;
  const connector = record(row.connectors);
  const wire = record(row.wires);
  const protectiveSleeve = record(row.protective_sleeves);
  const model = record(row.models);
  const accessory = record(row.accessories);
  const packaging = record(row.packagings);
  const images = Array.isArray(row.resource_item_images) ? row.resource_item_images.map(record) : [];
  const primaryImage = images.sort((left, right) => Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary)))[0];
  const connectorType = text(connector.connector_type);
  const gender = connectorType === 'male' || connectorType === 'female' || connectorType === 'receptacle' ? connectorType : undefined;
  if (type === 'protective_sleeve' && text(protectiveSleeve.sleeve_type) !== 'heat-shrink') return null;
  const sleeveDiameter = numberValue(protectiveSleeve.inner_diameter_as_supplied_mm);
  const sleeveRatio = numberValue(protectiveSleeve.shrink_ratio);
  const sleeveSpecification = [
    sleeveDiameter === undefined ? '' : `Φ${sleeveDiameter}mm`,
    sleeveRatio === undefined ? '' : `${sleeveRatio}:1`,
    text(protectiveSleeve.material),
    text(protectiveSleeve.color),
  ].filter(Boolean).join(' · ');
  const specification = sleeveSpecification || text(accessory.specification) || text(packaging.specification) || text(wire.wire_kind) || text(model.model_kind);
  return {
    id: text(row.legacy_key, text(row.id)),
    resourceItemId: text(row.id),
    resourceType: type,
    name: text(row.resource_name),
    model: text(row.model),
    resourceGroup: text(row.resource_group),
    storagePath: text(primaryImage?.storage_path) || undefined,
    gender,
    series: text(connector.series) || undefined,
    pinCount: numberValue(connector.pin_count),
    rowCount: numberValue(connector.row_count),
    pitchMm: numberValue(connector.pitch_mm),
    specification: specification || undefined,
    unit: type === 'protective_sleeve' ? 'PCS' : text(accessory.unit) || text(packaging.unit) || undefined,
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
    if (filters.resourceGroup && resource.resourceGroup !== filters.resourceGroup) return false;
    if (filters.series && resource.series !== filters.series) return false;
    if (filters.pinCount !== undefined && resource.pinCount !== filters.pinCount) return false;
    if (filters.rowCount !== undefined && resource.rowCount !== filters.rowCount) return false;
    if (filters.pitchMm !== undefined && resource.pitchMm !== filters.pitchMm) return false;
    return !query || normalized(`${resource.name} ${resource.model} ${resource.series ?? ''} ${resource.resourceGroup}`).includes(query);
  });
}

function isDrawingDocument(value: unknown): value is DrawingDocument {
  const row = record(value);
  const page = record(row.page);
  const titleBlock = record(row.titleBlock);
  const finite = (candidate: unknown) => typeof candidate === 'number' && Number.isFinite(candidate);
  const point = (candidate: unknown) => { const item = record(candidate); return finite(item.x) && finite(item.y); };
  const style = (candidate: unknown) => {
    const item = record(candidate);
    return typeof item.stroke === 'string' && typeof item.fill === 'string' && typeof item.color === 'string'
      && finite(item.strokeWidth) && finite(item.fontSize);
  };
  const stringRecord = (candidate: unknown) => {
    const item = record(candidate);
    return candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)
      && Object.values(item).every((cell) => typeof cell === 'string');
  };
  const textOffsets = (candidate: unknown) => candidate === undefined
    || (candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate) && Object.values(record(candidate)).every(point));
  const drawingObject = (candidate: unknown): boolean => {
    const item = record(candidate);
    if (typeof item.id !== 'string' || !item.id || typeof item.kind !== 'string' || !finite(item.x) || !finite(item.y) || !finite(item.width) || !finite(item.height)
      || !finite(item.rotation) || !finite(item.zIndex) || typeof item.locked !== 'boolean' || typeof item.visible !== 'boolean' || !style(item.style)) return false;
    if (item.kind === 'connector') return typeof item.label === 'string' && finite(item.pinCount)
      && (item.gender === 'male' || item.gender === 'female' || item.gender === 'receptacle')
      && (item.side === 'left' || item.side === 'right' || item.side === 'none');
    if (item.kind === 'wire-bundle') return typeof item.label === 'string' && finite(item.wireCount)
      && (item.wireKind === 'electronic' || item.wireKind === 'twisted' || item.wireKind === 'ribbon' || item.wireKind === 'parallel' || item.wireKind === 'shielded');
    if (item.kind === 'accessory') return typeof item.label === 'string'
      && (item.accessoryType === 'sleeve' || item.accessoryType === 'packaging' || item.accessoryType === 'specification' || item.accessoryType === 'model');
    if (item.kind === 'text' || item.kind === 'label') return typeof item.text === 'string';
    if (item.kind === 'dimension') return typeof item.label === 'string' && point(item.start) && point(item.end);
    if (item.kind === 'line' || item.kind === 'polyline' || item.kind === 'curve' || item.kind === 'freehand') return typeof item.orthogonal === 'boolean' && Array.isArray(item.points) && item.points.length >= 2 && item.points.every(point);
    if (item.kind === 'table' || item.kind === 'bom-table' || item.kind === 'wiring-table') return typeof item.title === 'string' && Array.isArray(item.columns) && item.columns.every((column) => typeof column === 'string') && Array.isArray(item.rows) && item.rows.every(stringRecord) && textOffsets(item.textOffsets);
    if (item.kind === 'tech-requirements') return Array.isArray(item.requirements) && item.requirements.every((requirement) => typeof requirement === 'string');
    if (item.kind === 'title-block') return typeof item.title === 'string' && typeof item.drawingNo === 'string' && typeof item.revision === 'string';
    if (item.kind === 'group') return (item.groupKind === 'wire-bundle' || item.groupKind === 'wire-core') && Array.isArray(item.children) && item.children.every(drawingObject);
    if (item.kind === 'icon') return typeof item.name === 'string' && typeof item.svgPath === 'string';
    return false;
  };
  return row.schemaVersion === 1
    && typeof row.id === 'string'
    && typeof row.name === 'string'
    && finite(row.createdAt)
    && finite(row.updatedAt)
    && page.size === 'A4'
    && page.orientation === 'landscape'
    && page.width === 1200
    && page.height === 800
    && Array.isArray(row.objects)
    && row.objects.every(drawingObject)
    && typeof titleBlock.title === 'string'
    && typeof titleBlock.drawingNo === 'string'
    && typeof titleBlock.revision === 'string'
    && Array.isArray(row.revisionTable)
    && row.revisionTable.every((candidate) => {
      const revision = record(candidate);
      return typeof revision.revision === 'string' && typeof revision.description === 'string' && typeof revision.date === 'string';
    })
    && Array.isArray(row.techRequirements)
    && row.techRequirements.every((item) => typeof item === 'string');
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
    const rows = await this.rows('resource_items', 'id,legacy_key,resource_type,resource_group,resource_name,model,short_description,display_order,lifecycle_status,deleted_at,connectors(connector_type,series,pin_count,row_count,pitch_mm),wires(wire_kind),protective_sleeves(material,color,sleeve_type,shrink_ratio,nominal_length_m,inner_diameter_as_supplied_mm,inner_diameter_recovered_mm,recovered_wall_thickness_mm),models(model_kind),accessories(specification,unit),packagings(specification,unit),resource_item_images(storage_path,is_primary,display_order)');
    const mapped = rows
      .filter((row) => row.lifecycle_status === 'active' && !row.deleted_at)
      .map(mapCatalogRow)
      .filter((resource): resource is CatalogResourceWithStoragePath => Boolean(resource));
    const resources = await Promise.all(mapped.map(async ({ storagePath, ...resource }) => {
      if (!storagePath || !this.client.storage) return resource;
      const { data, error } = await this.client.storage.from('catalog-assets').createSignedUrl(storagePath, 60 * 60);
      if (error) return { ...resource, imageError: error.message };
      return !data?.signedUrl ? { ...resource, imageError: '资源图片签名地址为空。' } : { ...resource, imageUrl: data.signedUrl };
    }));
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
