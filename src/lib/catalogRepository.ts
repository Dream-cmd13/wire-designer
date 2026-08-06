import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import type { Connector, OvermoldSpec, WireColor, WireGauge, WireType } from '@/types/harness';
import type {
  CatalogSnapshot,
  CatalogWire,
  LeadTimeOption,
  PricingRule,
  ProtectionOption,
  QuantityDiscountRule,
} from '@/types/catalog';
import { parseCatalogWireSpec, WireCatalogError } from '@/lib/wireCatalog';

export type { CatalogWire } from '@/types/catalog';

type CatalogImageRow = { storage_path: string; is_primary: boolean; display_order: number };
type UnknownRow = Record<string, unknown>;

function firstRelation<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function row(value: unknown): UnknownRow {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRow : {};
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export class CatalogRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogRepositoryError';
  }
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

  private async primaryImageUrl(images: CatalogImageRow[] | null | undefined): Promise<string | undefined> {
    const primary = [...(images ?? [])]
      .filter((image) => image.is_primary)
      .sort((a, b) => a.display_order - b.display_order)[0];
    if (!primary) return undefined;
    const { data } = await this.requireClient().storage.from('catalog-assets').createSignedUrl(primary.storage_path, 60 * 60);
    return data?.signedUrl;
  }

  async listConnectors(): Promise<Connector[]> {
    const client = this.requireClient();
    const { data, error } = await client.from('resource_items')
      .select('id,legacy_key,resource_name,manufacturer_name,connectors(pin_count,pitch_mm,connector_type,housing_material,contact_material,nut_material,pin_labels),resource_item_images(storage_path,is_primary,display_order)')
      .eq('resource_type', 'connector').eq('lifecycle_status', 'active').is('deleted_at', null)
      .order('display_order').order('updated_at', { ascending: false });
    if (error) throw new CatalogRepositoryError(error.message);

    return Promise.all((data ?? []).map(async (raw) => {
      const item = row(raw);
      const specs = firstRelation(item.connectors as UnknownRow[] | UnknownRow | null | undefined) ?? {};
      const connectorType = text(specs?.connector_type);
      const type: Connector['type'] = connectorType === 'male' || connectorType === 'receptacle' ? connectorType : 'female';
      return {
        id: text(item.legacy_key, text(item.id)),
        resourceItemId: text(item.id),
        name: text(item.resource_name),
        manufacturer: text(item.manufacturer_name),
        pinCount: numberValue(specs?.pin_count),
        pitch: specs?.pitch_mm === null || specs?.pitch_mm === undefined ? undefined : numberValue(specs.pitch_mm),
        type,
        pinLabels: stringArray(specs?.pin_labels),
        housingMaterial: text(specs?.housing_material) || undefined,
        contactMaterial: text(specs?.contact_material) || undefined,
        nutMaterial: text(specs?.nut_material) || undefined,
        image: await this.primaryImageUrl((item.resource_item_images as CatalogImageRow[] | null | undefined)),
      } satisfies Connector;
    }));
  }

  async listWires(): Promise<CatalogWire[]> {
    const client = this.requireClient();
    const { data, error } = await client.from('resource_items')
      .select('id,legacy_key,resource_name,wires(wire_kind,awg,ul_number,conductor_color,jacket_material,jacket_color,core_count,is_shielded,core_colors),resource_item_images(storage_path,is_primary,display_order)')
      .eq('resource_type', 'wire').eq('lifecycle_status', 'active').is('deleted_at', null)
      .order('display_order').order('updated_at', { ascending: false });
    if (error) throw new CatalogRepositoryError(error.message);
    return Promise.all((data ?? []).map(async (raw) => {
      const item = row(raw);
      try {
        const specs = firstRelation(item.wires as UnknownRow[] | UnknownRow | null | undefined);
        return {
          id: text(item.legacy_key, text(item.id)),
          resourceItemId: text(item.id),
          name: text(item.resource_name),
          spec: parseCatalogWireSpec(specs ?? {}),
          image: await this.primaryImageUrl(item.resource_item_images as CatalogImageRow[] | null | undefined),
        };
      } catch (cause) {
        if (cause instanceof WireCatalogError) {
          throw new CatalogRepositoryError(`线材目录规格无效: ${text(item.resource_name, text(item.id))}`);
        }
        throw cause;
      }
    }));
  }

  async listWireTypes(): Promise<WireType[]> {
    const client = this.requireClient();
    const { data, error } = await client.from('wire_types')
      .select('code,display_name,description,temperature_rating_c')
      .is('deleted_at', null).order('display_order');
    if (error) throw new CatalogRepositoryError(error.message);
    return (data ?? []).map((raw) => {
      const item = row(raw);
      const temperature = item.temperature_rating_c === null || item.temperature_rating_c === undefined
        ? ''
        : `${numberValue(item.temperature_rating_c)}°C`;
      return {
        id: text(item.code),
        name: text(item.display_name),
        description: text(item.description),
        temperatureRating: temperature,
      };
    });
  }

  async listWireColors(): Promise<WireColor[]> {
    const client = this.requireClient();
    const { data, error } = await client.from('wire_colors')
      .select('code,display_name,hex_color')
      .is('deleted_at', null).order('display_order');
    if (error) throw new CatalogRepositoryError(error.message);
    return (data ?? []).map((raw) => {
      const item = row(raw);
      return { id: text(item.code), name: text(item.display_name), hex: text(item.hex_color) };
    });
  }

  async listWireGauges(): Promise<WireGauge[]> {
    const client = this.requireClient();
    const { data, error } = await client.from('wire_gauges')
      .select('awg,conductor_diameter_mm,max_current_a')
      .is('deleted_at', null).order('display_order');
    if (error) throw new CatalogRepositoryError(error.message);
    return (data ?? []).map((raw) => {
      const item = row(raw);
      return {
        awg: numberValue(item.awg),
        diameterMm: numberValue(item.conductor_diameter_mm),
        maxCurrent: numberValue(item.max_current_a),
      };
    });
  }

  async listOvermolds(): Promise<OvermoldSpec[]> {
    const client = this.requireClient();
    const { data, error } = await client.from('resource_items')
      .select('id,legacy_key,resource_name,overmolds(outer_material,outer_hardness_shore,inner_material,inner_material_optional),resource_item_images(storage_path,is_primary,display_order)')
      .eq('resource_type', 'overmold').eq('lifecycle_status', 'active').is('deleted_at', null)
      .order('display_order').order('updated_at', { ascending: false });
    if (error) throw new CatalogRepositoryError(error.message);
    return Promise.all((data ?? []).map(async (raw) => {
      const item = row(raw);
      const specs = firstRelation(item.overmolds as UnknownRow[] | UnknownRow | null | undefined) ?? {};
      return {
        id: text(item.legacy_key, text(item.id)),
        resourceItemId: text(item.id),
        name: text(item.resource_name),
        outerMaterial: text(specs?.outer_material),
        outerHardness: text(specs?.outer_hardness_shore) || undefined,
        innerMaterial: text(specs?.inner_material),
        innerMaterialOptional: Boolean(specs?.inner_material_optional),
        image: await this.primaryImageUrl(item.resource_item_images as CatalogImageRow[] | null | undefined),
      } satisfies OvermoldSpec;
    }));
  }

  async listLeadTimeOptions(): Promise<LeadTimeOption[]> {
    const client = this.requireClient();
    const { data, error } = await client.from('lead_time_options')
      .select('code,display_name,display_days,multiplier')
      .eq('is_active', true).is('deleted_at', null).order('display_order');
    if (error) throw new CatalogRepositoryError(error.message);
    return (data ?? []).map((raw) => {
      const item = row(raw);
      return { id: text(item.code), name: text(item.display_name), days: text(item.display_days), multiplier: numberValue(item.multiplier, 1) };
    });
  }

  async listProtectionOptions(): Promise<ProtectionOption[]> {
    const client = this.requireClient();
    const { data, error } = await client.from('protection_options')
      .select('code,display_name,price_per_meter,material_multipliers')
      .eq('is_active', true).is('deleted_at', null).order('display_order');
    if (error) throw new CatalogRepositoryError(error.message);
    return (data ?? []).map((raw) => {
      const item = row(raw);
      const multipliers = row(item.material_multipliers);
      return {
        id: text(item.code),
        name: text(item.display_name),
        price: numberValue(item.price_per_meter),
        materialMultipliers: Object.fromEntries(Object.entries(multipliers).map(([key, value]) => [key, numberValue(value, 1)])),
      };
    });
  }

  async listPricingRules(): Promise<PricingRule[]> {
    const client = this.requireClient();
    const { data, error } = await client.from('pricing_rules')
      .select('rule_code,rule_key,numeric_value')
      .eq('is_active', true).is('deleted_at', null).order('display_order');
    if (error) throw new CatalogRepositoryError(error.message);
    return (data ?? []).map((raw) => {
      const item = row(raw);
      return { ruleCode: text(item.rule_code), ruleKey: text(item.rule_key), numericValue: numberValue(item.numeric_value) };
    });
  }

  async listQuantityDiscountRules(): Promise<QuantityDiscountRule[]> {
    const client = this.requireClient();
    const { data, error } = await client.from('quantity_discount_rules')
      .select('minimum_quantity,multiplier')
      .eq('is_active', true).is('deleted_at', null).order('minimum_quantity');
    if (error) throw new CatalogRepositoryError(error.message);
    return (data ?? []).map((raw) => {
      const item = row(raw);
      return { minimumQuantity: numberValue(item.minimum_quantity), multiplier: numberValue(item.multiplier, 1) };
    });
  }

  async loadSnapshot(): Promise<CatalogSnapshot> {
    const [connectors, wires, wireTypes, wireColors, wireGauges, overmolds, leadTimeOptions, protectionOptions, pricingRules, quantityDiscountRules] = await Promise.all([
      this.listConnectors(),
      this.listWires(),
      this.listWireTypes(),
      this.listWireColors(),
      this.listWireGauges(),
      this.listOvermolds(),
      this.listLeadTimeOptions(),
      this.listProtectionOptions(),
      this.listPricingRules(),
      this.listQuantityDiscountRules(),
    ]);
    return {
      connectors,
      wires,
      wireTypes,
      wireColors,
      wireGauges,
      overmolds,
      leadTimeOptions,
      protectionOptions,
      pricingRules,
      quantityDiscountRules,
      loadedAt: Date.now(),
    };
  }
}

export const catalogRepository = new CatalogRepository();
