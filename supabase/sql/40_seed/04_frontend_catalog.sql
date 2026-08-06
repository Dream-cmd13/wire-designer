-- Idempotent baseline resource seed for the database-backed frontend.
-- Quotation rules are seeded separately in 40_seed/05_business_options.sql.

begin;

insert into public.wire_types (code, display_name, description, temperature_rating_c, display_order) values
  ('silicone', '硅胶线', '高柔性耐高温', 200, 10),
  ('ul1007', 'UL1007', '通用PVC线', 80, 20),
  ('ul1061', 'UL1061', '细径PVC线', 80, 30),
  ('gxl', 'GXL', '汽车级交联线', 125, 40),
  ('ptfe', 'PTFE', '特氟龙高温线', 250, 50)
on conflict (code) where deleted_at is null do update set
  display_name = excluded.display_name, description = excluded.description,
  temperature_rating_c = excluded.temperature_rating_c, display_order = excluded.display_order, updated_at = now();

insert into public.wire_colors (code, display_name, hex_color, display_order) values
  ('red', '红色', '#DC2626', 10), ('black', '黑色', '#171717', 20),
  ('white', '白色', '#F5F5F5', 30), ('green', '绿色', '#16A34A', 40),
  ('blue', '蓝色', '#2563EB', 50), ('yellow', '黄色', '#CA8A04', 60),
  ('orange', '橙色', '#EA580C', 70), ('purple', '紫色', '#9333EA', 80),
  ('brown', '棕色', '#92400E', 90), ('gray', '灰色', '#6B7280', 100),
  ('gold', '金色', '#D4AF37', 110), ('pink', '粉色', '#EC4899', 120),
  ('yellow-green', '黄绿', '#A3E635', 130), ('blank', '空白', '#F8FAFC', 140)
on conflict (code) where deleted_at is null do update set
  display_name = excluded.display_name, hex_color = excluded.hex_color,
  display_order = excluded.display_order, updated_at = now();

insert into public.wire_gauges (awg, conductor_diameter_mm, max_current_a, display_order) values
  (22, 0.644, 7, 10), (24, 0.511, 3.5, 20), (26, 0.405, 2.2, 30),
  (28, 0.321, 1.4, 40), (30, 0.255, 0.9, 50)
on conflict (awg) where deleted_at is null do update set
  conductor_diameter_mm = excluded.conductor_diameter_mm, max_current_a = excluded.max_current_a,
  display_order = excluded.display_order, updated_at = now();

-- resource_group is a flat UI grouping; it intentionally has no category-table foreign key.
insert into public.resource_items
  (id, resource_type, legacy_key, resource_name, model, manufacturer_name, resource_group, short_description, display_order)
values
  ('40000000-0000-4000-8000-000000000101', 'connector', 'jst-xh-2', 'JST XH 2P', 'JST XH 2P', 'JST', '板对线连接器', '', 10),
  ('40000000-0000-4000-8000-000000000102', 'connector', 'jst-xh-3', 'JST XH 3P', 'JST XH 3P', 'JST', '板对线连接器', '', 20),
  ('40000000-0000-4000-8000-000000000103', 'connector', 'jst-xh-4', 'JST XH 4P', 'JST XH 4P', 'JST', '板对线连接器', '', 30),
  ('40000000-0000-4000-8000-000000000104', 'connector', 'jst-xh-5', 'JST XH 5P', 'JST XH 5P', 'JST', '板对线连接器', '', 40),
  ('40000000-0000-4000-8000-000000000105', 'connector', 'jst-ph-2', 'JST PH 2.0 2P', 'JST PH 2.0 2P', 'JST', '板对线连接器', '', 50),
  ('40000000-0000-4000-8000-000000000106', 'connector', 'jst-ph-3', 'JST PH 2.0 3P', 'JST PH 2.0 3P', 'JST', '板对线连接器', '', 60),
  ('40000000-0000-4000-8000-000000000107', 'connector', 'jst-ph-4', 'JST PH 2.0 4P', 'JST PH 2.0 4P', 'JST', '板对线连接器', '', 70),
  ('40000000-0000-4000-8000-000000000108', 'connector', 'jst-eh-2', 'JST EH 2P', 'JST EH 2P', 'JST', '板对线连接器', '', 80),
  ('40000000-0000-4000-8000-000000000109', 'connector', 'jst-eh-3', 'JST EH 3P', 'JST EH 3P', 'JST', '板对线连接器', '', 90),
  ('40000000-0000-4000-8000-000000000110', 'connector', 'jst-gh-4', 'JST GH 1.25 4P', 'JST GH 1.25 4P', 'JST', '板对线连接器', '', 100),
  ('40000000-0000-4000-8000-000000000111', 'connector', 'jst-sh-4', 'JST SH 1.0 4P', 'JST SH 1.0 4P', 'JST', '板对线连接器', '', 110),
  ('40000000-0000-4000-8000-000000000112', 'connector', 'jst-zh-4', 'JST ZH 1.5 4P', 'JST ZH 1.5 4P', 'JST', '板对线连接器', '', 120),
  ('40000000-0000-4000-8000-000000000113', 'connector', 'molex-2510-2', 'Molex 2510 2P', 'Molex 2510 2P', 'Molex', '板对线连接器', '', 130),
  ('40000000-0000-4000-8000-000000000114', 'connector', 'molex-2510-4', 'Molex 2510 4P', 'Molex 2510 4P', 'Molex', '板对线连接器', '', 140),
  ('40000000-0000-4000-8000-000000000115', 'connector', 'molex-microfit-2', 'Molex Micro-Fit 3.0 2P', 'Molex Micro-Fit 3.0 2P', 'Molex', '板对线连接器', '', 150),
  ('40000000-0000-4000-8000-000000000116', 'connector', 'molex-microfit-4', 'Molex Micro-Fit 3.0 4P', 'Molex Micro-Fit 3.0 4P', 'Molex', '板对线连接器', '', 160),
  ('40000000-0000-4000-8000-000000000117', 'connector', 'xt30', 'XT30', 'XT30', 'Amass', '电源连接器', '', 170),
  ('40000000-0000-4000-8000-000000000118', 'connector', 'xt60', 'XT60', 'XT60', 'Amass', '电源连接器', '', 180),
  ('40000000-0000-4000-8000-000000000119', 'connector', 'xt90', 'XT90', 'XT90', 'Amass', '电源连接器', '', 190),
  ('40000000-0000-4000-8000-000000000120', 'connector', 'usb-a', 'USB Type-A', 'USB Type-A', 'Generic', 'USB连接器', '', 200),
  ('40000000-0000-4000-8000-000000000121', 'connector', 'usb-c', 'USB Type-C', 'USB Type-C', 'Generic', 'USB连接器', '', 210),
  ('40000000-0000-4000-8000-000000000122', 'connector', 'a1008h-2x20p', 'A1008H-2X20P', 'A1008H-2X20P', 'Generic', '板对线连接器', '', 220),
  ('40000000-0000-4000-8000-000000000123', 'connector', 'dupont-1x1', 'Dupont 2.54 1P', 'Dupont 2.54 1P', 'Dupont', '板对线连接器', '', 230),
  ('40000000-0000-4000-8000-000000000124', 'connector', 'dupont-2p', 'Dupont 2.54 2P', 'Dupont 2.54 2P', 'Dupont', '板对线连接器', '', 240),
  ('40000000-0000-4000-8000-000000000125', 'connector', 'dupont-4p', 'Dupont 2.54 4P', 'Dupont 2.54 4P', 'Dupont', '板对线连接器', '', 250),
  ('40000000-0000-4000-8000-000000000126', 'connector', 'anderson-2', 'Anderson 2P', 'Anderson 2P', 'Anderson', '电源连接器', '', 260),
  ('40000000-0000-4000-8000-000000000127', 'connector', 'm8-3', 'M8 3-Pin', 'M8 3-Pin', 'Generic', '圆形连接器', '', 270),
  ('40000000-0000-4000-8000-000000000128', 'connector', 'm8-4', 'M8 4-Pin', 'M8 4-Pin', 'Generic', '圆形连接器', '', 280),
  ('40000000-0000-4000-8000-000000000129', 'connector', 'm12-4', 'M12 4-Pin (A-Coded)', 'M12 4-Pin (A-Coded)', 'Generic', '圆形连接器', '', 290),
  ('40000000-0000-4000-8000-000000000130', 'connector', 'm12-5', 'M12 5-Pin (A-Coded)', 'M12 5-Pin (A-Coded)', 'Generic', '圆形连接器', '', 300),
  ('40000000-0000-4000-8000-000000000131', 'connector', 'm12a04-07-093', 'M12成型式防水连接器 4芯 A编码 焊线式公头 非屏蔽款+11.8L双网纹螺丝', 'M12A04-07-093', '万连', '圆形连接器', '', 310),
  ('40000000-0000-4000-8000-000000000132', 'connector', 'deutsch-dt-2', 'Deutsch DT 2P', 'Deutsch DT 2P', 'Deutsch', '汽车连接器', '', 320),
  ('40000000-0000-4000-8000-000000000133', 'connector', 'deutsch-dt-4', 'Deutsch DT 4P', 'Deutsch DT 4P', 'Deutsch', '汽车连接器', '', 330),
  ('40000000-0000-4000-8000-000000000134', 'connector', 'deutsch-dt-6', 'Deutsch DT 6P', 'Deutsch DT 6P', 'Deutsch', '汽车连接器', '', 340),
  ('40000000-0000-4000-8000-000000000201', 'overmold', 'pvc-45p-pe', '黑色PVC外模 + 透明PE内模', 'PVC-45P-PE', null, 'PVC外模', '', 10)
on conflict (id) do update set
  resource_type = excluded.resource_type, legacy_key = excluded.legacy_key, resource_name = excluded.resource_name,
  model = excluded.model, manufacturer_name = excluded.manufacturer_name, resource_group = excluded.resource_group,
  short_description = excluded.short_description, display_order = excluded.display_order, updated_at = now();

update public.resource_items
set resource_group = case
  when legacy_key in (
    'xt30', 'xt60', 'xt90', 'anderson-2'
  ) then '电源连接器'
  when legacy_key in ('usb-a', 'usb-c') then 'USB连接器'
  when legacy_key in ('m8-3', 'm8-4', 'm12-4', 'm12-5', 'm12a04-07-093') then '圆形连接器'
  when legacy_key in ('deutsch-dt-2', 'deutsch-dt-4', 'deutsch-dt-6') then '汽车连接器'
  when legacy_key = 'pvc-45p-pe' then 'PVC外模'
  else '板对线连接器'
end
where id in (
  '40000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000102',
  '40000000-0000-4000-8000-000000000103', '40000000-0000-4000-8000-000000000104',
  '40000000-0000-4000-8000-000000000105', '40000000-0000-4000-8000-000000000106',
  '40000000-0000-4000-8000-000000000107', '40000000-0000-4000-8000-000000000108',
  '40000000-0000-4000-8000-000000000109', '40000000-0000-4000-8000-000000000110',
  '40000000-0000-4000-8000-000000000111', '40000000-0000-4000-8000-000000000112',
  '40000000-0000-4000-8000-000000000113', '40000000-0000-4000-8000-000000000114',
  '40000000-0000-4000-8000-000000000115', '40000000-0000-4000-8000-000000000116',
  '40000000-0000-4000-8000-000000000117', '40000000-0000-4000-8000-000000000118',
  '40000000-0000-4000-8000-000000000119', '40000000-0000-4000-8000-000000000120',
  '40000000-0000-4000-8000-000000000121', '40000000-0000-4000-8000-000000000122',
  '40000000-0000-4000-8000-000000000123', '40000000-0000-4000-8000-000000000124',
  '40000000-0000-4000-8000-000000000125', '40000000-0000-4000-8000-000000000126',
  '40000000-0000-4000-8000-000000000127', '40000000-0000-4000-8000-000000000128',
  '40000000-0000-4000-8000-000000000129', '40000000-0000-4000-8000-000000000130',
  '40000000-0000-4000-8000-000000000131', '40000000-0000-4000-8000-000000000132',
  '40000000-0000-4000-8000-000000000133', '40000000-0000-4000-8000-000000000134',
  '40000000-0000-4000-8000-000000000201'
);

insert into public.connectors
  (resource_item_id, series, connector_type, pin_count, row_count, pitch_mm, housing_material, contact_material, nut_material)
select item.id, source.series, source.connector_type, source.pin_count, source.row_count, source.pitch_mm,
  source.housing_material, source.contact_material, source.nut_material
from (values
  ('jst-xh-2','JST XH','female',2,1,2.5,'PA66+GF','磷青铜镀锡','无'), ('jst-xh-3','JST XH','female',3,1,2.5,'PA66+GF','磷青铜镀锡','无'),
  ('jst-xh-4','JST XH','female',4,1,2.5,'PA66+GF','磷青铜镀锡','无'), ('jst-xh-5','JST XH','female',5,1,2.5,'PA66+GF','磷青铜镀锡','无'),
  ('jst-ph-2','JST PH','female',2,1,2.0,'PA66+GF','磷青铜镀锡','无'), ('jst-ph-3','JST PH','female',3,1,2.0,'PA66+GF','磷青铜镀锡','无'),
  ('jst-ph-4','JST PH','female',4,1,2.0,'PA66+GF','磷青铜镀锡','无'), ('jst-eh-2','JST EH','female',2,1,2.5,'PA66+GF','磷青铜镀锡','无'),
  ('jst-eh-3','JST EH','female',3,1,2.5,'PA66+GF','磷青铜镀锡','无'), ('jst-gh-4','JST GH','female',4,1,1.25,'PA66+GF','磷青铜镀金','无'),
  ('jst-sh-4','JST SH','female',4,1,1.0,'LCP','磷青铜镀金','无'), ('jst-zh-4','JST ZH','female',4,1,1.5,'PA66+GF','磷青铜镀金','无'),
  ('molex-2510-2','Molex 2510','female',2,1,2.54,'Nylon','磷青铜镀锡','无'), ('molex-2510-4','Molex 2510','female',4,1,2.54,'Nylon','磷青铜镀锡','无'),
  ('molex-microfit-2','Molex Micro-Fit 3.0','female',2,1,3.0,'Nylon','铜合金镀锡','无'), ('molex-microfit-4','Molex Micro-Fit 3.0','female',4,1,3.0,'Nylon','铜合金镀锡','无'),
  ('xt30','XT','female',2,1,null,'Nylon','镀金铜','无'), ('xt60','XT','female',2,1,null,'Nylon','镀金铜','无'), ('xt90','XT','female',2,1,null,'Nylon','镀金铜','无'),
  ('usb-a','USB Type-A','female',4,1,null,'PBT','铜合金镀金','金属外壳'), ('usb-c','USB Type-C','receptacle',16,1,null,'LCP','铜合金镀金','不锈钢外壳'),
  ('a1008h-2x20p','A1008H','male',40,2,1.0,null,null,null), ('dupont-1x1','Dupont','female',1,1,2.54,'PA66','磷青铜镀金','无'),
  ('dupont-2p','Dupont','female',2,1,2.54,'PA66','磷青铜镀金','无'), ('dupont-4p','Dupont','female',4,1,2.54,'PA66','磷青铜镀金','无'),
  ('anderson-2','Anderson Powerpole','receptacle',2,1,null,'阻燃PC','镀银铜','无'), ('m8-3','M8','male',3,1,null,'锌合金','黄铜镀金','黄铜镀镍'),
  ('m8-4','M8','male',4,1,null,'锌合金','黄铜镀金','黄铜镀镍'), ('m12-4','M12 A-Coded','male',4,1,null,'锌合金','黄铜镀金','黄铜镀镍'),
  ('m12-5','M12 A-Coded','male',5,1,null,'锌合金','黄铜镀金','黄铜镀镍'), ('m12a04-07-093','M12 A-Coded','male',4,1,null,'PA66+GF','黄铜镀金','黄铜镀镍'),
  ('deutsch-dt-2','Deutsch DT','receptacle',2,1,6.35,null,null,null), ('deutsch-dt-4','Deutsch DT','receptacle',4,1,6.35,null,null,null),
  ('deutsch-dt-6','Deutsch DT','receptacle',6,1,6.35,null,null,null)
) as source(legacy_key, series, connector_type, pin_count, row_count, pitch_mm, housing_material, contact_material, nut_material)
join public.resource_items item on item.resource_type = 'connector' and item.legacy_key = source.legacy_key and item.deleted_at is null
on conflict (resource_item_id) do update set
  series = excluded.series, connector_type = excluded.connector_type, pin_count = excluded.pin_count, row_count = excluded.row_count,
  pitch_mm = excluded.pitch_mm, housing_material = excluded.housing_material, contact_material = excluded.contact_material,
  nut_material = excluded.nut_material, updated_at = now();

with pin_sets(legacy_key, labels) as (values
  ('jst-xh-2', array['1','2']), ('jst-xh-3', array['1','2','3']), ('jst-xh-4', array['1','2','3','4']), ('jst-xh-5', array['1','2','3','4','5']),
  ('jst-ph-2', array['1','2']), ('jst-ph-3', array['1','2','3']), ('jst-ph-4', array['1','2','3','4']), ('jst-eh-2', array['1','2']),
  ('jst-eh-3', array['1','2','3']), ('jst-gh-4', array['1','2','3','4']), ('jst-sh-4', array['1','2','3','4']), ('jst-zh-4', array['1','2','3','4']),
  ('molex-2510-2', array['1','2']), ('molex-2510-4', array['1','2','3','4']), ('molex-microfit-2', array['1','2']), ('molex-microfit-4', array['1','2','3','4']),
  ('xt30', array['+','-']), ('xt60', array['+','-']), ('xt90', array['+','-']), ('usb-a', array['VBUS','D-','D+','GND']),
  ('usb-c', array['VBUS','D-','D+','SBU1','CC1','GND','VBUS','SBU2','D-','D+','GND','TX1+','TX1-','RX2-','RX2+','GND']),
  ('a1008h-2x20p', array(select i::text from generate_series(1, 40) as i)), ('dupont-1x1', array['1']), ('dupont-2p', array['1','2']),
  ('dupont-4p', array['1','2','3','4']), ('anderson-2', array['+','-']), ('m8-3', array['1','2','3']), ('m8-4', array['1','2','3','4']),
  ('m12-4', array['1','2','3','4']), ('m12-5', array['1','2','3','4','5']), ('m12a04-07-093', array['1','2','3','4']),
  ('deutsch-dt-2', array['A','B']), ('deutsch-dt-4', array['A','B','C','D']), ('deutsch-dt-6', array['A','B','C','D','E','F'])
)
update public.connectors connector
set pin_labels = to_jsonb(source.labels), updated_at = now()
from pin_sets source, public.resource_items item
where item.resource_type = 'connector'
  and item.id = connector.resource_item_id
  and item.legacy_key = source.legacy_key
  and item.deleted_at is null;

insert into public.overmolds (resource_item_id, outer_material, inner_material, inner_material_optional, color, outer_hardness_shore)
select id, '黑色PVC胶料', '低密度透明PE胶料', true, '黑色', '45P'
from public.resource_items where resource_type = 'overmold' and legacy_key = 'pvc-45p-pe' and deleted_at is null
on conflict (resource_item_id) do update set
  outer_material = excluded.outer_material, inner_material = excluded.inner_material,
  inner_material_optional = excluded.inner_material_optional, color = excluded.color,
  outer_hardness_shore = excluded.outer_hardness_shore, updated_at = now();

commit;
