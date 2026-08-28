-- Real connector and wire catalog transcribed from 线束设计器.xlsx.
-- The source workbook is authoritative: conflicting source notations are kept
-- in explicit description fields instead of being silently normalized away.

begin;

insert into public.catalog_items
  (id, kind, code, name, model, manufacturer, resource_group, description,
   image_path, image_variants, sort_order, spec)
values
  (
    '40000000-0000-4000-8000-000000000131', 'connector', 'm12a04-07-093',
    'M12 A编码 4芯公头 非屏蔽', 'M12A04-07-093', '万连', '圆形连接器',
    'M12成型式防水连接器 4芯 A编码 焊线式公头 非屏蔽款+11.8L双网纹螺丝',
    'catalog/connector/40000000-0000-4000-8000-000000000131/connector-before.png',
    '{"before":"catalog/connector/40000000-0000-4000-8000-000000000131/connector-before.png","after":"catalog/connector/40000000-0000-4000-8000-000000000131/connector-after.png","pinMap":"catalog/connector/40000000-0000-4000-8000-000000000131/connector-pin-map.png"}'::jsonb,
    400,
    '{"connectorType":"male","series":"M12 A-Coded","pinCount":4,"rowCount":1,"pinLabels":["1","2","3","4"],"housingMaterial":"PA66+GF","contactMaterial":"黄铜镀金","nutMaterial":"黄铜镀镍","shielded":false,"ratedVoltageV":60,"ratedCurrentA":4,"temperatureRangeC":{"min":-40,"max":105},"ingressProtection":"IP67","flammabilityRating":"UL94V-0","matingCyclesMin":500}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000102', 'connector', 'm12a05-07-093',
    'M12 A编码 5芯公头 非屏蔽', 'M12A05-07-093', '万连', '圆形连接器', '',
    null, '{}'::jsonb, 410,
    '{"connectorType":"male","series":"M12 A-Coded","pinCount":5,"rowCount":1,"pinLabels":["1","2","3","4","5"],"shielded":false,"ratedVoltageV":60,"ratedCurrentA":4,"temperatureRangeC":{"min":-40,"max":105},"ingressProtection":"IP67","flammabilityRating":"UL94V-0","matingCyclesMin":500}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000103', 'connector', 'm12a08-07-093',
    'M12 A编码 8芯公头 非屏蔽', 'M12A08-07-093', '万连', '圆形连接器', '',
    null, '{}'::jsonb, 420,
    '{"connectorType":"male","series":"M12 A-Coded","pinCount":8,"rowCount":1,"pinLabels":["1","2","3","4","5","6","7","8"],"shielded":false,"ratedVoltageV":30,"ratedCurrentA":2,"temperatureRangeC":{"min":-40,"max":105},"ingressProtection":"IP67","flammabilityRating":"UL94V-0","matingCyclesMin":500}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000104', 'connector', 'm12a04-08-085',
    'M12 A编码 4芯母头 非屏蔽', 'M12A04-08-085', '万连', '圆形连接器', '',
    null, '{}'::jsonb, 430,
    '{"connectorType":"female","series":"M12 A-Coded","pinCount":4,"rowCount":1,"pinLabels":["1","2","3","4"],"shielded":false,"ratedVoltageV":60,"ratedCurrentA":4,"temperatureRangeC":{"min":-40,"max":105},"ingressProtection":"IP67","flammabilityRating":"UL94V-0","matingCyclesMin":500}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000105', 'connector', 'm12a05-08-085',
    'M12 A编码 5芯母头 非屏蔽', 'M12A05-08-085', '万连', '圆形连接器', '',
    null, '{}'::jsonb, 440,
    '{"connectorType":"female","series":"M12 A-Coded","pinCount":5,"rowCount":1,"pinLabels":["1","2","3","4","5"],"shielded":false,"ratedVoltageV":60,"ratedCurrentA":4,"temperatureRangeC":{"min":-40,"max":105},"ingressProtection":"IP67","flammabilityRating":"UL94V-0","matingCyclesMin":500}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000106', 'connector', 'm12a08-08-085',
    'M12 A编码 8芯母头 非屏蔽', 'M12A08-08-085', '万连', '圆形连接器', '',
    null, '{}'::jsonb, 450,
    '{"connectorType":"female","series":"M12 A-Coded","pinCount":8,"rowCount":1,"pinLabels":["1","2","3","4","5","6","7","8"],"shielded":false,"ratedVoltageV":30,"ratedCurrentA":2,"temperatureRangeC":{"min":-40,"max":105},"ingressProtection":"IP67","flammabilityRating":"UL94V-0","matingCyclesMin":500}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000107', 'connector', 'm12a04-07-068',
    'M12 A编码 4芯公头 屏蔽', 'M12A04-07-068', '万连', '圆形连接器', '',
    null, '{}'::jsonb, 460,
    '{"connectorType":"male","series":"M12 A-Coded","pinCount":4,"rowCount":1,"pinLabels":["1","2","3","4"],"shielded":true,"ratedVoltageV":60,"ratedCurrentA":4,"temperatureRangeC":{"min":-40,"max":105},"ingressProtection":"IP67","flammabilityRating":"UL94V-0","matingCyclesMin":500}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000108', 'connector', 'm12a05-07-068',
    'M12 A编码 5芯公头 屏蔽', 'M12A05-07-068', '万连', '圆形连接器', '',
    null, '{}'::jsonb, 470,
    '{"connectorType":"male","series":"M12 A-Coded","pinCount":5,"rowCount":1,"pinLabels":["1","2","3","4","5"],"shielded":true,"ratedVoltageV":60,"ratedCurrentA":4,"temperatureRangeC":{"min":-40,"max":105},"ingressProtection":"IP67","flammabilityRating":"UL94V-0","matingCyclesMin":500}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000109', 'connector', 'm12a08-07-068',
    'M12 A编码 8芯公头 屏蔽', 'M12A08-07-068', '万连', '圆形连接器', '',
    null, '{}'::jsonb, 480,
    '{"connectorType":"male","series":"M12 A-Coded","pinCount":8,"rowCount":1,"pinLabels":["1","2","3","4","5","6","7","8"],"shielded":true,"ratedVoltageV":30,"ratedCurrentA":2,"temperatureRangeC":{"min":-40,"max":105},"ingressProtection":"IP67","flammabilityRating":"UL94V-0","matingCyclesMin":500}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000110', 'connector', 'm12a04-08-067',
    'M12 A编码 4芯母头 屏蔽', 'M12A04-08-067', '万连', '圆形连接器', '',
    null, '{}'::jsonb, 490,
    '{"connectorType":"female","series":"M12 A-Coded","pinCount":4,"rowCount":1,"pinLabels":["1","2","3","4"],"shielded":true,"ratedVoltageV":60,"ratedCurrentA":4,"temperatureRangeC":{"min":-40,"max":105},"ingressProtection":"IP67","flammabilityRating":"UL94V-0","matingCyclesMin":500}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000111', 'connector', 'm12a05-08-067',
    'M12 A编码 5芯母头 屏蔽', 'M12A05-08-067', '万连', '圆形连接器', '',
    null, '{}'::jsonb, 500,
    '{"connectorType":"female","series":"M12 A-Coded","pinCount":5,"rowCount":1,"pinLabels":["1","2","3","4","5"],"shielded":true,"ratedVoltageV":60,"ratedCurrentA":4,"temperatureRangeC":{"min":-40,"max":105},"ingressProtection":"IP67","flammabilityRating":"UL94V-0","matingCyclesMin":500}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000112', 'connector', 'm12a08-08-067',
    'M12 A编码 8芯母头 屏蔽', 'M12A08-08-067', '万连', '圆形连接器', '',
    null, '{}'::jsonb, 510,
    '{"connectorType":"female","series":"M12 A-Coded","pinCount":8,"rowCount":1,"pinLabels":["1","2","3","4","5","6","7","8"],"shielded":true,"ratedVoltageV":30,"ratedCurrentA":2,"temperatureRangeC":{"min":-40,"max":105},"ingressProtection":"IP67","flammabilityRating":"UL94V-0","matingCyclesMin":500}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000201', 'wire', 'wl-htx-pvc-033',
    'WL-HTX-PVC-033 UL2464 4芯屏蔽线', 'WL-HTX-PVC-033', '', '护套线',
    'UL2464 17/0.16TC*PVC*1.3*4C+AL+60%编织B16/5/0.10TC PVC 棕白蓝黑 OD5.2',
    'catalog/wire/shared/jacketed-wire.png', '{}'::jsonb, 400,
    '{"kind":"jacketed","ulNumber":"UL2464","awg":22,"coreCount":4,"shielded":true,"coreColors":["棕色","白色","蓝色","黑色"],"coreColorDescription":"棕白蓝黑","jacketMaterial":"PVC","jacketColor":"black","ratedVoltageV":300,"temperatureRangeC":{"max":80},"flameTest":"VW-1","rohsCompliant":true,"conductorMaterial":"镀锡铜丝","conductorStructure":"17/0.16TC","insulationMaterial":"PVC","insulationDiameterMm":1.3,"insulationDiameterToleranceMm":0.05,"braidStructure":"16*5/0.10TC","braidStructureDescription":"B16/5/0.10TC","shieldCoverageRatio":0.6,"shieldCoverageDescription":"60%","jacketHardnessP":60,"outerDiameterMm":5.2,"outerDiameterToleranceMm":0.2,"tensileStrengthPsi":1500,"elongationPercent":100,"conductorResistanceOhmPerKmAt20C":59.4,"insulationResistanceMOhmKm":10}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000202', 'wire', 'wl-htx-pvc-034',
    'WL-HTX-PVC-034 UL2464 5芯屏蔽线', 'WL-HTX-PVC-034', '', '护套线',
    'UL2464 17/0.16TC*PVC*1.3*5C+AL+65%编织B16/6/0.10TC PVC 棕白蓝黑灰 OD5.5',
    'catalog/wire/shared/jacketed-wire.png', '{}'::jsonb, 410,
    '{"kind":"jacketed","ulNumber":"UL2464","awg":22,"coreCount":5,"shielded":true,"coreColors":["棕色","白色","蓝色","黑色","灰色"],"coreColorDescription":"棕白蓝黑灰","jacketMaterial":"PVC","jacketColor":"black","ratedVoltageV":300,"temperatureRangeC":{"max":80},"flameTest":"VW-1","rohsCompliant":true,"conductorMaterial":"镀锡铜丝","conductorStructure":"17/0.16TC","insulationMaterial":"PVC","insulationDiameterMm":1.3,"insulationDiameterToleranceMm":0.05,"braidStructure":"16*5/0.10TC","braidStructureDescription":"B16/6/0.10TC","shieldCoverageRatio":0.6,"shieldCoverageDescription":"65%","jacketHardnessP":60,"outerDiameterMm":5.5,"outerDiameterToleranceMm":0.2,"tensileStrengthPsi":1500,"elongationPercent":100,"conductorResistanceOhmPerKmAt20C":59.4,"insulationResistanceMOhmKm":10}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000203', 'wire', 'wl-htx-pvc-036',
    'WL-HTX-PVC-036 UL2464 5芯非屏蔽线', 'WL-HTX-PVC-036', '', '护套线',
    'UL2464 17/0.16TC*PVC*1.3*5C PVC 棕白蓝黑灰 OD5.1',
    'catalog/wire/shared/jacketed-wire.png', '{}'::jsonb, 420,
    '{"kind":"jacketed","ulNumber":"UL2464","awg":22,"coreCount":5,"shielded":false,"coreColors":["棕色","白色","蓝色","黑色","灰色"],"coreColorDescription":"棕白蓝黑灰","jacketMaterial":"PVC","jacketColor":"black","ratedVoltageV":300,"temperatureRangeC":{"max":80},"flameTest":"VW-1","rohsCompliant":true,"conductorMaterial":"镀锡铜丝","conductorStructure":"17/0.16TC","insulationMaterial":"PVC","insulationDiameterMm":1.3,"insulationDiameterToleranceMm":0.05,"jacketHardnessP":60,"outerDiameterMm":5.1,"outerDiameterToleranceMm":0.15,"tensileStrengthPsi":1500,"elongationPercent":100,"conductorResistanceOhmPerKmAt20C":59.4,"insulationResistanceMOhmKm":10}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000204', 'wire', 'wl-htx-pvc-037',
    'WL-HTX-PVC-037 UL2464 4芯非屏蔽线', 'WL-HTX-PVC-037', '', '护套线',
    'UL2464 17/0.16TC*PVC*1.3*4C PVC 棕白蓝黑 OD5.0',
    'catalog/wire/shared/jacketed-wire.png', '{}'::jsonb, 430,
    '{"kind":"jacketed","ulNumber":"UL2464","awg":22,"coreCount":4,"shielded":false,"coreColors":["棕色","白色","蓝色","黑色"],"coreColorDescription":"棕白蓝黑","jacketMaterial":"PVC","jacketColor":"black","ratedVoltageV":300,"temperatureRangeC":{"max":80},"flameTest":"VW-1","rohsCompliant":true,"conductorMaterial":"镀锡铜丝","conductorStructure":"17/0.16TC","insulationMaterial":"PVC","insulationDiameterMm":1.3,"insulationDiameterToleranceMm":0.05,"jacketHardnessP":60,"outerDiameterMm":5.0,"outerDiameterToleranceMm":0.15,"tensileStrengthPsi":1500,"elongationPercent":100,"conductorResistanceOhmPerKmAt20C":59.4,"insulationResistanceMOhmKm":10}'::jsonb
  )
on conflict (kind, code) do update set
  name = excluded.name,
  model = excluded.model,
  manufacturer = excluded.manufacturer,
  resource_group = excluded.resource_group,
  description = excluded.description,
  image_path = excluded.image_path,
  image_variants = excluded.image_variants,
  sort_order = excluded.sort_order,
  spec = excluded.spec;

commit;
