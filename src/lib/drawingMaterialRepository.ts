import { supabase } from '@/lib/supabaseClient';

export type CompanyMaterial = {
  id: string;
  code: string;
  nameAndSpecification: string;
  unit: string;
  note: string;
};

export type CompanyMaterialInput = Omit<CompanyMaterial, 'id'>;

export type DrawingMaterialCatalogRow = {
  id: string;
  model: string;
  resource_name: string;
  short_description: string | null;
  lifecycle_status: string;
  deleted_at: string | null;
  accessories: { specification?: string; unit?: string } | Array<{ specification?: string; unit?: string }> | null;
};

export type DrawingMaterialCatalogGateway = {
  listActive: () => Promise<DrawingMaterialCatalogRow[]>;
  insertDraft: (input: { legacyKey: string; model: string; resourceName: string; note: string }) => Promise<string>;
  insertSpecification: (id: string, input: { specification: string; unit: string }) => Promise<void>;
  activate: (id: string) => Promise<void>;
};

export class DrawingMaterialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawingMaterialError';
  }
}

function firstSpecification(value: DrawingMaterialCatalogRow['accessories']) {
  return Array.isArray(value) ? value[0] ?? {} : value ?? {};
}

function mapRow(row: DrawingMaterialCatalogRow): CompanyMaterial {
  const specification = firstSpecification(row.accessories);
  const name = row.resource_name.trim();
  const detail = specification.specification?.trim();
  return {
    id: row.id,
    code: row.model,
    nameAndSpecification: detail && detail !== name ? `${name} / ${detail}` : name,
    unit: specification.unit?.trim() || 'PCS',
    note: row.short_description?.trim() || '',
  };
}

function legacyKey(code: string) {
  const normalized = code.trim().toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'material';
  return `${normalized.slice(0, 72)}-${Date.now().toString(36)}`;
}

export class DrawingMaterialRepository {
  private readonly gateway: DrawingMaterialCatalogGateway;

  constructor(gateway: DrawingMaterialCatalogGateway) {
    this.gateway = gateway;
  }

  async list(query = ''): Promise<CompanyMaterial[]> {
    const rows = await this.gateway.listActive();
    const materials = rows.filter((row) => row.lifecycle_status === 'active' && !row.deleted_at).map(mapRow);
    const normalized = query.trim().toLocaleLowerCase();
    return !normalized ? materials : materials.filter((material) =>
      `${material.code} ${material.nameAndSpecification} ${material.unit} ${material.note}`.toLocaleLowerCase().includes(normalized));
  }

  async create(input: CompanyMaterialInput): Promise<CompanyMaterial> {
    const normalized = {
      code: input.code.trim(),
      nameAndSpecification: input.nameAndSpecification.trim(),
      unit: input.unit.trim(),
      note: input.note.trim(),
    };
    const id = await this.gateway.insertDraft({
      legacyKey: legacyKey(normalized.code),
      model: normalized.code,
      resourceName: normalized.nameAndSpecification,
      note: normalized.note,
    });
    await this.gateway.insertSpecification(id, { specification: normalized.nameAndSpecification, unit: normalized.unit });
    await this.gateway.activate(id);
    return { id, ...normalized };
  }
}

const DRAWING_ACCESSORY_RESOURCE_GROUP = '绘图辅材';

function createSupabaseGateway(client: NonNullable<typeof supabase>): DrawingMaterialCatalogGateway {
  return {
  async listActive() {
    const { data, error } = await client.from('resource_items')
      .select('id,model,resource_name,short_description,lifecycle_status,deleted_at,accessories(specification,unit)')
      .eq('resource_type', 'accessory').eq('lifecycle_status', 'active').is('deleted_at', null)
      .order('display_order').order('updated_at', { ascending: false });
    if (error) throw new DrawingMaterialError(error.message);
    return (data ?? []) as unknown as DrawingMaterialCatalogRow[];
  },
  async insertDraft(input) {
    const { data, error } = await client.from('resource_items').insert({
      resource_type: 'accessory',
      legacy_key: input.legacyKey,
      resource_name: input.resourceName,
      model: input.model,
      short_description: input.note,
      resource_group: DRAWING_ACCESSORY_RESOURCE_GROUP,
      lifecycle_status: 'draft',
    }).select('id').single();
    if (error || !data?.id) throw new DrawingMaterialError(error?.message || '公司物料创建失败。');
    return String(data.id);
  },
  async insertSpecification(id, input) {
    const { error } = await client.from('accessories').insert({
      resource_item_id: id,
      accessory_kind: 'drawing-material',
      specification: input.specification,
      unit: input.unit,
    });
    if (error) throw new DrawingMaterialError(error.message);
  },
  async activate(id) {
    const { error } = await client.from('resource_items').update({ lifecycle_status: 'active' }).eq('id', id);
    if (error) throw new DrawingMaterialError(error.message);
  },
  };
}

const supabaseGateway = supabase ? createSupabaseGateway(supabase) : null;

export const drawingMaterialRepository = supabaseGateway ? new DrawingMaterialRepository(supabaseGateway) : null;
