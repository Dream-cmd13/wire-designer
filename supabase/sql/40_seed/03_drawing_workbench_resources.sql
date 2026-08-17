-- Idempotent public baseline data for the drawing wizard and workbench.

begin;

insert into public.resource_items (id, resource_type, legacy_key, resource_name, model, resource_group, short_description, display_order) values
  ('30000000-0000-4000-8000-000000001001', 'connector', 'xh254-4p-f', 'XH2.54-4P母头', 'XH2.54-4P-F', '绘图连接器', '4PIN单排母头', 100),
  ('30000000-0000-4000-8000-000000001002', 'connector', 'xh254-4p-m', 'XH2.54-4P-M', 'XH2.54-4P-M', '绘图连接器', '4PIN单排公头', 110),
  ('30000000-0000-4000-8000-000000001003', 'wire', 'ul1007-24awg', 'UL1007 24AWG电子线', 'UL1007-24AWG', '绘图线材', '300V普通电子线', 120),
  ('30000000-0000-4000-8000-000000001004', 'wire', 'shielded-4c', '4芯屏蔽线', 'SHIELD-4C', '绘图线材', '4芯编织屏蔽线', 130),
  ('30000000-0000-4000-8000-000000001005', 'model', 'usb-a-mold', 'USB-A外模模型', 'USB-A-MOLD', '绘图模型', 'USB-A外线模型', 140),
  ('30000000-0000-4000-8000-000000001006', 'protective_sleeve', 'heat-shrink-6', 'Φ6热缩套管', 'HS-6MM', '绘图辅材', '黑色热缩套管', 150),
  ('30000000-0000-4000-8000-000000001007', 'accessory', 'wire-label', '线号标签', 'LABEL-20X8', '绘图辅材', '20x8mm线号标签', 160),
  ('30000000-0000-4000-8000-000000001008', 'packaging', 'coil-bag', '盘绕入袋', 'PKG-COIL-BAG', '包装方式', '扎带固定后装PE袋', 170)
on conflict (id) do update set resource_name = excluded.resource_name, model = excluded.model, resource_group = excluded.resource_group, short_description = excluded.short_description, display_order = excluded.display_order, updated_at = now();

insert into public.connectors (resource_item_id, series, connector_type, pin_count, row_count, pitch_mm, color, pin_labels) values
  ('30000000-0000-4000-8000-000000001001', 'XH2.54', 'female', 4, 1, 2.54, '白色', '["1","2","3","4"]'::jsonb),
  ('30000000-0000-4000-8000-000000001002', 'XH2.54', 'male', 4, 1, 2.54, '白色', '["1","2","3","4"]'::jsonb)
on conflict (resource_item_id) do update set series = excluded.series, connector_type = excluded.connector_type, pin_count = excluded.pin_count, row_count = excluded.row_count, pitch_mm = excluded.pitch_mm, color = excluded.color, pin_labels = excluded.pin_labels, updated_at = now();

insert into public.wires (
  resource_item_id, wire_kind, awg, ul_number, conductor_color, jacket_material,
  jacket_color, core_count, is_shielded, core_colors
) values
  (
    '30000000-0000-4000-8000-000000001003', 'electronic', 24, '1007', 'red',
    null, null, null, false, '[]'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000001004', 'jacketed', 24, 'UL20276', null,
    'PVC', 'black', 4, true, '["red","black","white","green"]'::jsonb
  )
on conflict (resource_item_id) do update set
  wire_kind = excluded.wire_kind, awg = excluded.awg, ul_number = excluded.ul_number,
  conductor_color = excluded.conductor_color, jacket_material = excluded.jacket_material,
  jacket_color = excluded.jacket_color, core_count = excluded.core_count,
  is_shielded = excluded.is_shielded, core_colors = excluded.core_colors,
  updated_at = now();

insert into public.protective_sleeves (
  resource_item_id, material, color, sleeve_type, shrink_ratio,
  nominal_length_m, inner_diameter_as_supplied_mm,
  inner_diameter_recovered_mm, recovered_wall_thickness_mm
) values (
  '30000000-0000-4000-8000-000000001006', 'polyolefin', 'black',
  'heat-shrink', 2, 1, 6, 3, 0.55
)
on conflict (resource_item_id) do update set
  material = excluded.material,
  color = excluded.color,
  sleeve_type = excluded.sleeve_type,
  shrink_ratio = excluded.shrink_ratio,
  nominal_length_m = excluded.nominal_length_m,
  inner_diameter_as_supplied_mm = excluded.inner_diameter_as_supplied_mm,
  inner_diameter_recovered_mm = excluded.inner_diameter_recovered_mm,
  recovered_wall_thickness_mm = excluded.recovered_wall_thickness_mm,
  updated_at = now();

insert into public.models (resource_item_id, model_kind, default_width_mm, default_height_mm, default_orientation, model_parameters) values
  ('30000000-0000-4000-8000-000000001005', 'overmold', 32, 14, 'right', '{"connector":"USB-A"}'::jsonb)
on conflict (resource_item_id) do update set model_kind = excluded.model_kind, default_width_mm = excluded.default_width_mm, default_height_mm = excluded.default_height_mm, model_parameters = excluded.model_parameters;

insert into public.accessories (resource_item_id, accessory_kind, specification, material, color, unit) values
  ('30000000-0000-4000-8000-000000001007', 'label', '20x8mm', 'PET', '白色', 'PCS')
on conflict (resource_item_id) do update set accessory_kind = excluded.accessory_kind, specification = excluded.specification, material = excluded.material, color = excluded.color, unit = excluded.unit;

insert into public.packagings (resource_item_id, packaging_kind, specification, unit, instructions) values
  ('30000000-0000-4000-8000-000000001008', 'bag', '300x200mm PE袋', 'PCS', '线束盘绕后用扎带固定并装袋')
on conflict (resource_item_id) do update set packaging_kind = excluded.packaging_kind, specification = excluded.specification, unit = excluded.unit, instructions = excluded.instructions;

insert into public.drawing_templates (id, name, category, description, current_version, status, display_order) values
  ('30000000-0000-4000-8000-000000002001', '单头普通电子线模板', '内线', '单连接器普通电子线', 1, 'active', 10),
  ('30000000-0000-4000-8000-000000002002', '双头四芯屏蔽线模板', '内线', '双连接器四芯屏蔽线', 1, 'active', 20)
on conflict (id) do update set name = excluded.name, category = excluded.category, description = excluded.description, current_version = excluded.current_version, status = excluded.status, display_order = excluded.display_order, updated_at = now();

insert into public.drawing_template_versions (id, template_id, version_no, schema_version, drawing_json) values
  ('30000000-0000-4000-8000-000000003001', '30000000-0000-4000-8000-000000002001', 1, 1, '{"schemaVersion":1,"id":"template-single","name":"单头普通电子线模板","createdAt":0,"updatedAt":0,"page":{"size":"A4","orientation":"landscape","width":1200,"height":800},"objects":[],"titleBlock":{"title":"单头普通电子线模板","drawingNo":"TPL-SINGLE","revision":"A"},"revisionTable":[],"techRequirements":[]}'::jsonb),
  ('30000000-0000-4000-8000-000000003002', '30000000-0000-4000-8000-000000002002', 1, 1, '{"schemaVersion":1,"id":"template-double","name":"双头四芯屏蔽线模板","createdAt":0,"updatedAt":0,"page":{"size":"A4","orientation":"landscape","width":1200,"height":800},"objects":[],"titleBlock":{"title":"双头四芯屏蔽线模板","drawingNo":"TPL-DOUBLE","revision":"A"},"revisionTable":[],"techRequirements":[]}'::jsonb)
on conflict (template_id, version_no) do update set schema_version = excluded.schema_version, drawing_json = excluded.drawing_json;

insert into public.drawing_common_phrases (id, category, phrase, display_order) values
  ('30000000-0000-4000-8000-000000004001', '技术要求', '成品须进行导通及短路测试。', 10),
  ('30000000-0000-4000-8000-000000004002', '技术要求', '连接器端子压接后不得有松脱、变形。', 20),
  ('30000000-0000-4000-8000-000000004003', '包装', '线束盘绕后装入PE袋。', 30)
on conflict (id) do update set category = excluded.category, phrase = excluded.phrase, display_order = excluded.display_order, updated_at = now();

insert into public.drawing_icons (id, name, category, svg_path, default_width, default_height, display_order) values
  ('30000000-0000-4000-8000-000000005001', '接地', '电气', 'M12 2v20M12 2v18M7 13h10', 24, 24, 10),
  ('30000000-0000-4000-8000-000000005002', '警告', '标识', 'M12 2L22 20H2zM12 8v5M12 17h.01', 24, 24, 20),
  ('30000000-0000-4000-8000-000000005003', '上锡', '工艺', 'M4 12h16M8 8v8M16 8v8', 24, 24, 30),
  ('30000000-0000-4000-8000-000000005004', '屏蔽', '电气', 'M4 4h16v16H4zM8 8h8v8H8z', 24, 24, 40)
on conflict (id) do update set name = excluded.name, category = excluded.category, svg_path = excluded.svg_path, default_width = excluded.default_width, default_height = excluded.default_height, display_order = excluded.display_order, updated_at = now();

commit;
