-- Seed data converted from the former frontend mock catalog.
-- This migration intentionally creates one image-eligible connector, overmold,
-- and four-core PVC jacketed wire. Upload the image binaries before enabling
-- the commented catalog_item_images inserts at the end of this file.

begin;
set constraints all deferred;

insert into public.catalog_categories (id, parent_id, name, code, description) values
  ('00000000-0000-4000-8000-000000000010', null, '连接器', 'connectors', '连接器类目'),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000010', '圆形防水连接器', 'circular-waterproof', '连接器类别'),
  ('00000000-0000-4000-8000-000000000020', null, '线材', 'wires', '线材类目'),
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000020', '护套线', 'jacketed-cables', '线材类别'),
  ('00000000-0000-4000-8000-000000000030', null, '保护套', 'protective-sleeves', '保护套类目'),
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000030', '热缩套管', 'heat-shrink', '保护套类别'),
  ('00000000-0000-4000-8000-000000000040', null, '外模', 'overmolds', '外模类目'),
  ('00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000040', 'PVC 外模', 'pvc-overmolds', '外模类别')
on conflict do nothing;

insert into public.organizations (id, name, organization_kind, description) values
  ('00000000-0000-4000-8000-000000000101', '万连', 'manufacturer', 'M12 连接器示例制造商'),
  ('00000000-0000-4000-8000-000000000102', '示例线材供应商', 'supplier', '四芯 PVC 护套线示例供应商'),
  ('00000000-0000-4000-8000-000000000103', '示例外模供应商', 'supplier', '外模规格示例供应商')
on conflict do nothing;

insert into public.wire_colors (id, code, display_name, hex_color, display_order) values
  ('00000000-0000-4000-8000-000000001001', 'red', '红色', '#DC2626', 1),
  ('00000000-0000-4000-8000-000000001002', 'black', '黑色', '#171717', 2),
  ('00000000-0000-4000-8000-000000001003', 'white', '白色', '#F5F5F5', 3),
  ('00000000-0000-4000-8000-000000001004', 'green', '绿色', '#16A34A', 4),
  ('00000000-0000-4000-8000-000000001005', 'blue', '蓝色', '#2563EB', 5),
  ('00000000-0000-4000-8000-000000001006', 'yellow', '黄色', '#CA8A04', 6),
  ('00000000-0000-4000-8000-000000001007', 'orange', '橙色', '#EA580C', 7),
  ('00000000-0000-4000-8000-000000001008', 'purple', '紫色', '#9333EA', 8),
  ('00000000-0000-4000-8000-000000001009', 'brown', '棕色', '#92400E', 9),
  ('00000000-0000-4000-8000-000000001010', 'gray', '灰色', '#6B7280', 10),
  ('00000000-0000-4000-8000-000000001011', 'gold', '金色', '#D4AF37', 11),
  ('00000000-0000-4000-8000-000000001012', 'pink', '粉色', '#EC4899', 12),
  ('00000000-0000-4000-8000-000000001013', 'yellow-green', '黄绿', '#A3E635', 13),
  ('00000000-0000-4000-8000-000000001014', 'blank', '空白', '#F8FAFC', 14)
on conflict do nothing;

insert into public.wire_gauges (id, awg, conductor_diameter_mm, max_current_a, display_order) values
  ('00000000-0000-4000-8000-000000002022', 22, 0.644, 7, 1),
  ('00000000-0000-4000-8000-000000002024', 24, 0.511, 3.5, 2),
  ('00000000-0000-4000-8000-000000002026', 26, 0.405, 2.2, 3),
  ('00000000-0000-4000-8000-000000002028', 28, 0.321, 1.4, 4),
  ('00000000-0000-4000-8000-000000002030', 30, 0.255, 0.9, 5)
on conflict do nothing;

insert into public.wire_types (id, code, display_name, description, temperature_rating_c, display_order) values
  ('00000000-0000-4000-8000-000000003001', 'silicone', '硅胶线', '高柔性耐高温', 200, 1),
  ('00000000-0000-4000-8000-000000003002', 'ul1007', 'UL1007', '通用 PVC 线', 80, 2),
  ('00000000-0000-4000-8000-000000003003', 'ul1061', 'UL1061', '细径 PVC 线', 80, 3),
  ('00000000-0000-4000-8000-000000003004', 'gxl', 'GXL', '汽车级交联线', 125, 4),
  ('00000000-0000-4000-8000-000000003005', 'ptfe', 'PTFE', '特氟龙高温线', 250, 5)
on conflict do nothing;

insert into public.lead_time_options (id, code, display_name, days_label, price_multiplier, display_order) values
  ('00000000-0000-4000-8000-000000004001', 'rush', '加急', '10个工作日', 1.3, 1),
  ('00000000-0000-4000-8000-000000004002', 'standard', '标准', '20-30个工作日', 1.0, 2),
  ('00000000-0000-4000-8000-000000004003', 'economy', '经济', '30-50个工作日', 0.9, 3)
on conflict do nothing;

insert into public.protection_options (id, code, display_name, unit_price, display_order) values
  ('00000000-0000-4000-8000-000000005001', 'none', '无', 0, 1),
  ('00000000-0000-4000-8000-000000005002', 'heat-shrink', '热缩管', 0.5, 2),
  ('00000000-0000-4000-8000-000000005003', 'braided', '编织网管', 1, 3),
  ('00000000-0000-4000-8000-000000005004', 'spiral', '螺旋缠绕管', 0.8, 4),
  ('00000000-0000-4000-8000-000000005005', 'convoluted', '波纹管', 1.2, 5)
on conflict do nothing;

insert into public.pricing_rules (id, rule_group, rule_key, numeric_value, description) values
  ('00000000-0000-4000-8000-000000006001', 'connector_base', 'fixed', 0.5, '连接器基础价格'),
  ('00000000-0000-4000-8000-000000006002', 'connector_base', 'per_pin', 0.3, '每 PIN 增量'),
  ('00000000-0000-4000-8000-000000006022', 'wire_gauge_multiplier', '22', 2, '22 AWG 系数'),
  ('00000000-0000-4000-8000-000000006024', 'wire_gauge_multiplier', '24', 1.5, '24 AWG 系数'),
  ('00000000-0000-4000-8000-000000006026', 'wire_gauge_multiplier', '26', 1, '26 AWG 系数'),
  ('00000000-0000-4000-8000-000000006028', 'wire_gauge_multiplier', '28', 0.8, '28 AWG 系数'),
  ('00000000-0000-4000-8000-000000006030', 'wire_gauge_multiplier', '30', 0.6, '30 AWG 系数'),
  ('00000000-0000-4000-8000-000000006101', 'wire_type_multiplier', 'silicone', 1.5, '硅胶线系数'),
  ('00000000-0000-4000-8000-000000006102', 'wire_type_multiplier', 'ul1007', 1, 'UL1007 系数'),
  ('00000000-0000-4000-8000-000000006103', 'wire_type_multiplier', 'ul1061', 0.9, 'UL1061 系数'),
  ('00000000-0000-4000-8000-000000006104', 'wire_type_multiplier', 'gxl', 1.3, 'GXL 系数'),
  ('00000000-0000-4000-8000-000000006105', 'wire_type_multiplier', 'ptfe', 2, 'PTFE 系数'),
  ('00000000-0000-4000-8000-000000006201', 'labor', 'per_connector', 2, '每个连接器人工费'),
  ('00000000-0000-4000-8000-000000006202', 'labor', 'per_meter', 1.5, '每米人工费')
on conflict do nothing;

insert into public.catalog_items (id, item_type, legacy_key, resource_name, model, category_id, short_description, detailed_description) values
  ('00000000-0000-4000-8000-000000007001', 'connector', 'm12a04-07-093', 'M12 成型防水连接器 4芯 A编码焊线式公头', 'M12A04-07-093', '00000000-0000-4000-8000-000000000011', '成品图连接器', '当前成品图可关联的 M12 连接器'),
  ('00000000-0000-4000-8000-000000007002', 'overmold', 'pvc-45p-pe', '黑色 PVC 外模 + 透明 PE 内模', 'PVC-45P-PE', '00000000-0000-4000-8000-000000000041', '成品图外模', '当前成品图可关联的外模规格'),
  ('00000000-0000-4000-8000-000000007003', 'wire', 'pvc-jacketed-4core', '四芯 PVC 护套线', 'PVC-JACKETED-4CORE', '00000000-0000-4000-8000-000000000021', '成品图线材', '任意 AWG 的四芯 PVC 护套线均可关联成品图')
on conflict do nothing;

insert into public.catalog_item_organizations (item_id, organization_id, relationship_type, note) values
  ('00000000-0000-4000-8000-000000007001', '00000000-0000-4000-8000-000000000101', 'manufacturer', '当前 mock 中的万连制造商'),
  ('00000000-0000-4000-8000-000000007002', '00000000-0000-4000-8000-000000000103', 'supplier', '外模示例供应商'),
  ('00000000-0000-4000-8000-000000007003', '00000000-0000-4000-8000-000000000102', 'supplier', '线材示例供应商')
on conflict do nothing;

insert into public.connector_specs (
  catalog_item_id, series, connector_type, contact_type, pin_count, row_count,
  housing_material, contact_material, nut_material, insulation_material
) values (
  '00000000-0000-4000-8000-000000007001', 'M12 A-coded', 'circular waterproof', 'male solder', 4, 1,
  'PA66+GF', 'brass nickel plated', 'brass nickel plated', 'PA66+GF'
) on conflict do nothing;

insert into public.connector_pins (catalog_item_id, pin_number, pin_label, display_order) values
  ('00000000-0000-4000-8000-000000007001', 1, '1', 1),
  ('00000000-0000-4000-8000-000000007001', 2, '2', 2),
  ('00000000-0000-4000-8000-000000007001', 3, '3', 3),
  ('00000000-0000-4000-8000-000000007001', 4, '4', 4)
on conflict do nothing;

insert into public.overmold_specs (
  catalog_item_id, outer_material, inner_material, inner_material_optional, color, outer_hardness_shore, process_description
) values (
  '00000000-0000-4000-8000-000000007002', 'black PVC', 'transparent low-density PE', true, 'black', '45P', '成型外模规格库示例'
) on conflict do nothing;

insert into public.wire_specs (
  catalog_item_id, core_count, jacket_material, is_shielded, jacket_color, cable_type, insulation_material
) values (
  '00000000-0000-4000-8000-000000007003', 4, 'PVC', false, 'black', 'jacketed cable', 'PVC'
) on conflict do nothing;

-- Upload binary files into the private `catalog-assets` bucket at these exact paths:
-- 00000000-0000-4000-8000-000000007001/00000000-0000-4000-8000-000000008001-连接器注塑前.png
-- 00000000-0000-4000-8000-000000007001/00000000-0000-4000-8000-000000008002-连接器注塑后.png
-- 00000000-0000-4000-8000-000000007001/00000000-0000-4000-8000-000000008003-连接器pin位图.png
-- 00000000-0000-4000-8000-000000007002/00000000-0000-4000-8000-000000008004-外模.png
-- 00000000-0000-4000-8000-000000007003/00000000-0000-4000-8000-000000008005-护套线.png
-- After upload, add matching catalog_item_images rows in a follow-up migration.

commit;
