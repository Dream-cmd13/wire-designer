-- Optional example resource records. Safe to run repeatedly.
begin;

insert into public.wire_colors (code, display_name, hex_color, display_order) values
  ('red', 'Red', '#DC2626', 10), ('black', 'Black', '#171717', 20), ('white', 'White', '#F5F5F5', 30),
  ('green', 'Green', '#16A34A', 40)
on conflict do nothing;

insert into public.wire_gauges (awg, conductor_diameter_mm, max_current_a, display_order) values
  (22, 0.644, 7, 10), (24, 0.511, 3.5, 20), (26, 0.405, 2.2, 30)
on conflict do nothing;

insert into public.wire_types (code, display_name, description, temperature_rating_c, display_order) values
  ('ul1007', 'UL1007', 'PVC hook-up wire', 80, 10), ('ul2464', 'UL2464', 'PVC jacketed cable', 80, 20)
on conflict do nothing;

insert into public.resource_items (id, resource_type, legacy_key, resource_name, model, resource_group, short_description, display_order) values
  ('20000000-0000-4000-8000-000000007001', 'connector', 'demo-m12-4pin', 'M12 4-pin connector', 'DEMO-M12-4P', 'Circular connectors', 'Example connector', 10),
  ('20000000-0000-4000-8000-000000007002', 'wire', 'demo-ul2464-4c-24awg', 'UL2464 4-core 24 AWG cable', 'DEMO-UL2464-4C-24', 'Jacketed wires', 'Example jacketed wire', 10),
  ('20000000-0000-4000-8000-000000007003', 'protective_sleeve', 'demo-heat-shrink-3mm', 'Heat shrink sleeve 3 mm', 'DEMO-HS-3MM', 'Heat shrink sleeves', 'Example protective sleeve', 10),
  ('20000000-0000-4000-8000-000000007004', 'overmold', 'demo-pvc-overmold', 'PVC overmold', 'DEMO-PVC-OM', 'PVC overmolds', 'Example overmold', 10)
on conflict do nothing;

insert into public.connectors (resource_item_id, series, connector_type, pin_count, row_count, pitch_mm, housing_material, contact_material, pin_labels) values
  ('20000000-0000-4000-8000-000000007001', 'M12 A-coded', 'male', 4, 1, 1.0, 'PA66+GF', 'Brass nickel plated', '["1","2","3","4"]'::jsonb)
on conflict (resource_item_id) do update set
  series = excluded.series, connector_type = excluded.connector_type, pin_count = excluded.pin_count,
  row_count = excluded.row_count, pitch_mm = excluded.pitch_mm, housing_material = excluded.housing_material,
  contact_material = excluded.contact_material, pin_labels = excluded.pin_labels, updated_at = now();

insert into public.wires (
  resource_item_id, wire_kind, awg, ul_number, conductor_color, jacket_material,
  jacket_color, core_count, is_shielded, core_colors
) values (
  '20000000-0000-4000-8000-000000007002', 'jacketed', 24, 'UL2464', null,
  'PVC', 'black', 4, false, '["red","black","white","green"]'::jsonb
)
on conflict (resource_item_id) do update set
  wire_kind = excluded.wire_kind, awg = excluded.awg, ul_number = excluded.ul_number,
  conductor_color = excluded.conductor_color, jacket_material = excluded.jacket_material,
  jacket_color = excluded.jacket_color, core_count = excluded.core_count,
  is_shielded = excluded.is_shielded, core_colors = excluded.core_colors,
  updated_at = now();

insert into public.protective_sleeves (resource_item_id, material, color, sleeve_type, shrink_ratio, inner_diameter_as_supplied_mm, inner_diameter_recovered_mm) values
  ('20000000-0000-4000-8000-000000007003', 'polyolefin', 'black', 'heat-shrink', 2, 3, 1.5)
on conflict do nothing;

insert into public.overmolds (resource_item_id, outer_material, inner_material, inner_material_optional, color, outer_hardness_shore) values
  ('20000000-0000-4000-8000-000000007004', 'PVC', 'PE', true, 'black', '45P')
on conflict do nothing;

commit;
