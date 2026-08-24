import {
  CATALOG_ITEM_COLUMNS,
  CatalogItemError,
  parseCatalogItemRow,
  type CatalogItemInsert,
  type CatalogItemRow,
} from '@/lib/catalogItem';
import { supabase } from '@/lib/supabaseClient';

export type CompanyMaterial = {
  id: string;
  code: string;
  nameAndSpecification: string;
  unit: string;
  note: string;
};

export type CompanyMaterialInput = Omit<CompanyMaterial, 'id'>;

export type DrawingMaterialCatalogGateway = {
  list: () => Promise<CatalogItemRow[]>;
  insert: (input: CatalogItemInsert) => Promise<CatalogItemRow>;
};

export class DrawingMaterialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawingMaterialError';
  }
}

function mapRow(row: Extract<CatalogItemRow, { kind: 'accessory' }>): CompanyMaterial {
  const name = row.name.trim();
  const detail = row.spec.specification.trim();
  return {
    id: row.id,
    code: row.model,
    nameAndSpecification: detail && detail !== name ? `${name} / ${detail}` : name,
    unit: row.spec.unit.trim() || 'PCS',
    note: row.description.trim(),
  };
}

function legacyKey(code: string) {
  const normalized = code
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'material';
  return `${normalized.slice(0, 72)}-${Date.now().toString(36)}`;
}

export class DrawingMaterialRepository {
  private readonly gateway: DrawingMaterialCatalogGateway;

  constructor(gateway: DrawingMaterialCatalogGateway) {
    this.gateway = gateway;
  }

  async list(query = ''): Promise<CompanyMaterial[]> {
    const rows = await this.gateway.list();
    const materials = rows
      .filter((row): row is Extract<CatalogItemRow, { kind: 'accessory' }> =>
        row.kind === 'accessory')
      .map(mapRow);
    const normalized = query.trim().toLocaleLowerCase();
    return !normalized
      ? materials
      : materials.filter((material) =>
          `${material.code} ${material.nameAndSpecification} ${material.unit} ${material.note}`
            .toLocaleLowerCase()
            .includes(normalized));
  }

  async create(input: CompanyMaterialInput): Promise<CompanyMaterial> {
    const normalized = {
      code: input.code.trim(),
      nameAndSpecification: input.nameAndSpecification.trim(),
      unit: input.unit.trim(),
      note: input.note.trim(),
    };
    const row = await this.gateway.insert({
      kind: 'accessory',
      code: legacyKey(normalized.code),
      name: normalized.nameAndSpecification,
      model: normalized.code,
      manufacturer: '',
      resource_group: '绘图辅材',
      description: normalized.note,
      image_path: null,
      sort_order: 0,
      spec: {
        specification: normalized.nameAndSpecification,
        unit: normalized.unit,
      },
    });
    if (row.kind !== 'accessory') throw new DrawingMaterialError('公司物料创建结果无效。');
    return { id: row.id, ...normalized };
  }
}

function createSupabaseGateway(client: NonNullable<typeof supabase>): DrawingMaterialCatalogGateway {
  return {
    async list() {
      const { data, error } = await client
        .from('catalog_items')
        .select(CATALOG_ITEM_COLUMNS)
        .eq('kind', 'accessory')
        .order('sort_order')
        .order('name');
      if (error) throw new DrawingMaterialError(error.message);
      try {
        return (data ?? []).map(parseCatalogItemRow);
      } catch (cause) {
        if (cause instanceof CatalogItemError) throw new DrawingMaterialError(cause.message);
        throw cause;
      }
    },
    async insert(input) {
      const { data, error } = await client
        .from('catalog_items')
        .insert(input)
        .select(CATALOG_ITEM_COLUMNS)
        .single();
      if (error || !data) {
        throw new DrawingMaterialError(error?.message || '公司物料创建失败。');
      }
      try {
        return parseCatalogItemRow(data);
      } catch (cause) {
        if (cause instanceof CatalogItemError) throw new DrawingMaterialError(cause.message);
        throw cause;
      }
    },
  };
}

const supabaseGateway = supabase ? createSupabaseGateway(supabase) : null;

export const drawingMaterialRepository = supabaseGateway
  ? new DrawingMaterialRepository(supabaseGateway)
  : null;
