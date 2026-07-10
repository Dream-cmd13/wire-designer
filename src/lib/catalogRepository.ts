import type { Connector, OvermoldSpec, WireColor } from '@/types/harness';
import { supabase } from '@/lib/supabaseClient';

export class CatalogRepository {
  async listConnectors(): Promise<Connector[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('catalog_items').select('legacy_key, resource_name, connector_specs(pin_count,pitch_mm,connector_type,housing_material,contact_material,nut_material), connector_pins(pin_label,display_order), catalog_item_organizations(organizations(name))').eq('item_type', 'connector').is('deleted_at', null);
    if (error) throw error;
    return (data ?? []).map((item: any) => ({
      id: item.legacy_key, name: item.resource_name,
      manufacturer: item.catalog_item_organizations?.[0]?.organizations?.name ?? '',
      pinCount: item.connector_specs?.pin_count ?? 0,
      pitch: item.connector_specs?.pitch_mm ?? undefined,
      type: item.connector_specs?.connector_type === 'male' ? 'male' : 'female',
      pinLabels: [...(item.connector_pins ?? [])].sort((a, b) => a.display_order - b.display_order).map((pin) => pin.pin_label),
      housingMaterial: item.connector_specs?.housing_material ?? undefined,
      contactMaterial: item.connector_specs?.contact_material ?? undefined,
      nutMaterial: item.connector_specs?.nut_material ?? undefined,
    }));
  }

  async listWireColors(): Promise<WireColor[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('wire_colors').select('code,display_name,hex_color').is('deleted_at', null).order('display_order');
    if (error) throw error;
    return (data ?? []).map((item) => ({ id: item.code, name: item.display_name, hex: item.hex_color }));
  }

  async listOvermolds(): Promise<OvermoldSpec[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('catalog_items').select('legacy_key,resource_name,overmold_specs(outer_material,outer_hardness_shore,inner_material,inner_material_optional)').eq('item_type', 'overmold').is('deleted_at', null);
    if (error) throw error;
    return (data ?? []).map((item: any) => ({ id: item.legacy_key, name: item.resource_name, outerMaterial: item.overmold_specs?.outer_material ?? '', outerHardness: item.overmold_specs?.outer_hardness_shore ?? undefined, innerMaterial: item.overmold_specs?.inner_material ?? '', innerMaterialOptional: item.overmold_specs?.inner_material_optional ?? false }));
  }
}

export const catalogRepository = new CatalogRepository();
