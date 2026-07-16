-- Optional example catalog records. Safe to run repeatedly.
begin;

insert into public.catalog_categories (id, parent_id, name, code, description, display_order) values
  ('20000000-0000-4000-8000-000000000001', null, 'Connectors', 'connectors', 'Connector root category', 10),
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Circular connectors', 'circular-connectors', 'Connector leaf category', 10),
  ('20000000-0000-4000-8000-000000000003', null, 'Wires', 'wires', 'Wire root category', 20),
  ('20000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000003', 'Jacketed wires', 'jacketed-wires', 'Wire leaf category', 10),
  ('20000000-0000-4000-8000-000000000005', null, 'Protective sleeves', 'protective-sleeves', 'Protective sleeve root category', 30),
  ('20000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000005', 'Heat shrink sleeves', 'heat-shrink-sleeves', 'Protective sleeve leaf category', 10),
  ('20000000-0000-4000-8000-000000000007', null, 'Overmolds', 'overmolds', 'Overmold root category', 40),
  ('20000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000007', 'PVC overmolds', 'pvc-overmolds', 'Overmold leaf category', 10)
on conflict do nothing;

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

insert into public.catalog_items (id, item_type, legacy_key, resource_name, model, category_id, short_description, display_order) values
  ('20000000-0000-4000-8000-000000007001', 'connector', 'demo-m12-4pin', 'M12 4-pin connector', 'DEMO-M12-4P', '20000000-0000-4000-8000-000000000002', 'Example connector', 10),
  ('20000000-0000-4000-8000-000000007002', 'wire', 'demo-ul2464-4c-24awg', 'UL2464 4-core 24 AWG cable', 'DEMO-UL2464-4C-24', '20000000-0000-4000-8000-000000000004', 'Example jacketed wire', 10),
  ('20000000-0000-4000-8000-000000007003', 'protective_sleeve', 'demo-heat-shrink-3mm', 'Heat shrink sleeve 3 mm', 'DEMO-HS-3MM', '20000000-0000-4000-8000-000000000006', 'Example protective sleeve', 10),
  ('20000000-0000-4000-8000-000000007004', 'overmold', 'demo-pvc-overmold', 'PVC overmold', 'DEMO-PVC-OM', '20000000-0000-4000-8000-000000000008', 'Example overmold', 10)
on conflict do nothing;

insert into public.connector_specs (catalog_item_id, series, connector_type, pin_count, row_count, pitch_mm, housing_material, contact_material) values
  ('20000000-0000-4000-8000-000000007001', 'M12 A-coded', 'male', 4, 1, 1.0, 'PA66+GF', 'Brass nickel plated')
on conflict do nothing;

insert into public.connector_pins (catalog_item_id, pin_number, pin_label, display_order) values
  ('20000000-0000-4000-8000-000000007001', 1, '1', 10),
  ('20000000-0000-4000-8000-000000007001', 2, '2', 20),
  ('20000000-0000-4000-8000-000000007001', 3, '3', 30),
  ('20000000-0000-4000-8000-000000007001', 4, '4', 40)
on conflict do nothing;

insert into public.wire_specs (
  catalog_item_id, core_count, jacket_material, jacket_color, jacket_color_id,
  cable_type, wire_type_id, wire_gauge_awg, wire_gauge_id, is_shielded, rated_voltage_v
) values (
  '20000000-0000-4000-8000-000000007002', 4, 'PVC', 'black',
  (select id from public.wire_colors where code = 'black' and deleted_at is null),
  'jacketed',
  (select id from public.wire_types where code = 'ul2464' and deleted_at is null),
  24,
  (select id from public.wire_gauges where awg = 24 and deleted_at is null),
  false, 300
)
on conflict (catalog_item_id) do update set
  core_count = excluded.core_count, jacket_material = excluded.jacket_material,
  jacket_color = excluded.jacket_color, jacket_color_id = excluded.jacket_color_id,
  cable_type = excluded.cable_type, wire_type_id = excluded.wire_type_id,
  wire_gauge_awg = excluded.wire_gauge_awg, wire_gauge_id = excluded.wire_gauge_id,
  is_shielded = excluded.is_shielded, rated_voltage_v = excluded.rated_voltage_v, updated_at = now();

insert into public.wire_spec_cores (catalog_item_id, core_index, color_id, display_order)
select item.id, source.core_index, color.id, source.core_index * 10
from (values
  (1, 'red'), (2, 'black'), (3, 'white'), (4, 'green')
) as source(core_index, color_code)
join public.catalog_items item on item.id = '20000000-0000-4000-8000-000000007002'
join public.wire_colors color on color.code = source.color_code and color.deleted_at is null
on conflict (catalog_item_id, core_index) do update set
  color_id = excluded.color_id, display_order = excluded.display_order, updated_at = now();

insert into public.protective_sleeve_specs (catalog_item_id, material, color, sleeve_type, shrink_ratio, inner_diameter_as_supplied_mm, inner_diameter_recovered_mm) values
  ('20000000-0000-4000-8000-000000007003', 'polyolefin', 'black', 'heat-shrink', 2, 3, 1.5)
on conflict do nothing;

insert into public.overmold_specs (catalog_item_id, outer_material, inner_material, inner_material_optional, color, outer_hardness_shore) values
  ('20000000-0000-4000-8000-000000007004', 'PVC', 'PE', true, 'black', '45P')
on conflict do nothing;

commit;
