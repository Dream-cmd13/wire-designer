import type { Connector, OvermoldSpec, WireColor } from '@/types/harness';
import { supabase } from '@/lib/supabaseClient';

export interface CatalogWire {
  id: string;
  catalogItemId: string;
  name: string;
  image?: string;
}

type CatalogImageRow = { storage_path: string; is_primary: boolean; display_order: number };

async function primaryImageUrl(images: CatalogImageRow[] | null | undefined): Promise<string | undefined> {
  const primary = [...(images ?? [])]
    .filter((image) => image.is_primary)
    .sort((a, b) => a.display_order - b.display_order)[0];
  if (!supabase || !primary) return undefined;
  const { data } = await supabase.storage.from('catalog-assets').createSignedUrl(primary.storage_path, 60 * 60);
  return data?.signedUrl;
}

export class CatalogRepository {
  async listConnectors(): Promise<Connector[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('catalog_items')
      .select('id,legacy_key,resource_name,manufacturer_part_number,connector_specs(pin_count,pitch_mm,connector_type,housing_material,contact_material,nut_material),connector_pins(pin_label,display_order),catalog_item_images(storage_path,is_primary,display_order)')
      .eq('item_type', 'connector').eq('lifecycle_status', 'active').is('deleted_at', null)
      .order('display_order').order('updated_at', { ascending: false });
    if (error) throw error;
    return Promise.all((data ?? []).map(async (item: any) => ({
      id: item.legacy_key, name: item.resource_name,
      catalogItemId: item.id,
      manufacturer: item.manufacturer_part_number ?? '',
      pinCount: item.connector_specs?.pin_count ?? 0,
      pitch: item.connector_specs?.pitch_mm ?? undefined,
      type: item.connector_specs?.connector_type === 'male' ? 'male' : 'female',
      pinLabels: [...(item.connector_pins ?? [])].sort((a, b) => a.display_order - b.display_order).map((pin) => pin.pin_label),
      housingMaterial: item.connector_specs?.housing_material ?? undefined,
      contactMaterial: item.connector_specs?.contact_material ?? undefined,
      nutMaterial: item.connector_specs?.nut_material ?? undefined,
      image: await primaryImageUrl(item.catalog_item_images),
    })));
  }

  async listWireColors(): Promise<WireColor[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('wire_colors').select('code,display_name,hex_color').is('deleted_at', null).order('display_order');
    if (error) throw error;
    return (data ?? []).map((item) => ({ id: item.code, name: item.display_name, hex: item.hex_color }));
  }

  async listOvermolds(): Promise<OvermoldSpec[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('catalog_items')
      .select('id,legacy_key,resource_name,overmold_specs(outer_material,outer_hardness_shore,inner_material,inner_material_optional),catalog_item_images(storage_path,is_primary,display_order)')
      .eq('item_type', 'overmold').eq('lifecycle_status', 'active').is('deleted_at', null)
      .order('display_order').order('updated_at', { ascending: false });
    if (error) throw error;
    return Promise.all((data ?? []).map(async (item: any) => ({
      id: item.legacy_key, catalogItemId: item.id, name: item.resource_name,
      outerMaterial: item.overmold_specs?.outer_material ?? '', outerHardness: item.overmold_specs?.outer_hardness_shore ?? undefined,
      innerMaterial: item.overmold_specs?.inner_material ?? '', innerMaterialOptional: item.overmold_specs?.inner_material_optional ?? false,
      image: await primaryImageUrl(item.catalog_item_images),
    })));
  }

  async listWires(): Promise<CatalogWire[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('catalog_items')
      .select('id,legacy_key,resource_name,catalog_item_images(storage_path,is_primary,display_order)')
      .eq('item_type', 'wire').eq('lifecycle_status', 'active').is('deleted_at', null)
      .order('display_order').order('updated_at', { ascending: false });
    if (error) throw error;
    return Promise.all((data ?? []).map(async (item: any) => ({
      id: item.legacy_key,
      catalogItemId: item.id,
      name: item.resource_name,
      image: await primaryImageUrl(item.catalog_item_images),
    })));
  }
}

export const catalogRepository = new CatalogRepository();
