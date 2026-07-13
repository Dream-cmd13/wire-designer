-- Optional development mock data.
-- Run this only after 20260710000000_initial_schema.sql.
-- It is safe to execute repeatedly.

begin;
set constraints all deferred;

insert into public.catalog_categories (id, parent_id, name, code, description) values
  ('10000000-0000-4000-8000-000000000001', null, 'Connectors', 'connectors', 'Mock root category'),
  ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Circular connectors', 'circular-connectors', 'Mock leaf category'),
  ('10000000-0000-4000-8000-000000000003', null, 'Wires', 'wires', 'Mock root category'),
  ('10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'Hook-up wires', 'hook-up-wires', 'Mock leaf category'),
  ('10000000-0000-4000-8000-000000000005', null, 'Protective sleeves', 'protective-sleeves', 'Mock root category'),
  ('10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000005', 'Heat shrink', 'heat-shrink', 'Mock leaf category'),
  ('10000000-0000-4000-8000-000000000007', null, 'Overmolds', 'overmolds', 'Mock root category'),
  ('10000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000007', 'PVC overmolds', 'pvc-overmolds', 'Mock leaf category')
on conflict do nothing;

insert into public.organizations (id, name, organization_kind, description) values
  ('10000000-0000-4000-8000-000000000101', 'Demo Components Ltd.', 'manufacturer', 'Mock manufacturer'),
  ('10000000-0000-4000-8000-000000000102', 'Demo Materials Ltd.', 'supplier', 'Mock supplier')
on conflict do nothing;

insert into public.wire_colors (id, code, display_name, hex_color, display_order) values
  ('10000000-0000-4000-8000-000000001001', 'red', 'Red', '#DC2626', 1),
  ('10000000-0000-4000-8000-000000001002', 'black', 'Black', '#171717', 2)
on conflict do nothing;

insert into public.wire_gauges (id, awg, conductor_diameter_mm, max_current_a, display_order) values
  ('10000000-0000-4000-8000-000000002024', 24, 0.511, 3.5, 1)
on conflict do nothing;

insert into public.wire_types (id, code, display_name, description, temperature_rating_c, display_order) values
  ('10000000-0000-4000-8000-000000003001', 'ul1007', 'UL1007', 'Mock PVC hook-up wire', 80, 1)
on conflict do nothing;

insert into public.catalog_items (
  id, item_type, legacy_key, resource_name, model, category_id,
  lifecycle_status, short_description, detailed_description
) values
  ('10000000-0000-4000-8000-000000007001', 'connector', 'demo-m12-4pin', 'M12 4-pin connector', 'DEMO-M12-4P', '10000000-0000-4000-8000-000000000002', 'active', 'Mock connector', 'Mock M12 connector'),
  ('10000000-0000-4000-8000-000000007002', 'wire', 'demo-ul1007-24awg', 'UL1007 24 AWG wire', 'DEMO-UL1007-24', '10000000-0000-4000-8000-000000000004', 'active', 'Mock wire', 'Mock PVC wire'),
  ('10000000-0000-4000-8000-000000007003', 'protective_sleeve', 'demo-heat-shrink-3mm', 'Heat shrink sleeve 3 mm', 'DEMO-HS-3MM', '10000000-0000-4000-8000-000000000006', 'active', 'Mock sleeve', 'Mock heat shrink sleeve'),
  ('10000000-0000-4000-8000-000000007004', 'overmold', 'demo-pvc-overmold', 'PVC overmold', 'DEMO-PVC-OM', '10000000-0000-4000-8000-000000000008', 'active', 'Mock overmold', 'Mock PVC overmold')
on conflict do nothing;

insert into public.connector_specs (catalog_item_id, series, connector_type, pin_count, row_count) values
  ('10000000-0000-4000-8000-000000007001', 'M12', 'circular', 4, 1)
on conflict do nothing;

insert into public.connector_pins (catalog_item_id, pin_number, pin_label, display_order) values
  ('10000000-0000-4000-8000-000000007001', 1, '1', 1),
  ('10000000-0000-4000-8000-000000007001', 2, '2', 2),
  ('10000000-0000-4000-8000-000000007001', 3, '3', 3),
  ('10000000-0000-4000-8000-000000007001', 4, '4', 4)
on conflict do nothing;

insert into public.wire_specs (catalog_item_id, core_count, jacket_material, wire_gauge_awg, rated_voltage_v) values
  ('10000000-0000-4000-8000-000000007002', 1, 'PVC', 24, 300)
on conflict do nothing;

insert into public.protective_sleeve_specs (
  catalog_item_id, material, color, sleeve_type, shrink_ratio,
  inner_diameter_as_supplied_mm, inner_diameter_recovered_mm
) values (
  '10000000-0000-4000-8000-000000007003', 'polyolefin', 'black', 'heat-shrink', 2,
  3, 1.5
) on conflict do nothing;

insert into public.overmold_specs (catalog_item_id, outer_material, color, outer_hardness_shore) values
  ('10000000-0000-4000-8000-000000007004', 'PVC', 'black', '45P')
on conflict do nothing;

insert into public.catalog_item_organizations (id, item_id, organization_id, relationship_type, supplier_sku) values
  ('10000000-0000-4000-8000-000000009001', '10000000-0000-4000-8000-000000007001', '10000000-0000-4000-8000-000000000101', 'manufacturer', 'DEMO-M12-4P'),
  ('10000000-0000-4000-8000-000000009002', '10000000-0000-4000-8000-000000007002', '10000000-0000-4000-8000-000000000102', 'supplier', 'DEMO-UL1007-24')
on conflict do nothing;

insert into public.supplier_prices (
  item_organization_id, relationship_type, purchase_unit, unit_price,
  min_quantity, effective_from, status, remark
) values (
  '10000000-0000-4000-8000-000000009002', 'supplier', 'meter', 1.25,
  1, current_date, 'active', 'Mock price'
) on conflict do nothing;

commit;
