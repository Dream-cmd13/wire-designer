create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'connector', 'wire', 'protective_sleeve', 'overmold',
    'model', 'accessory', 'packaging'
  )),
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
  name text not null check (length(btrim(name)) between 1 and 200),
  model text not null check (length(btrim(model)) between 1 and 200),
  manufacturer text not null default '',
  resource_group text not null default '',
  description text not null default '',
  image_path text,
  image_variants jsonb not null default '{}'::jsonb
    check (jsonb_typeof(image_variants) = 'object'),
  sort_order integer not null default 0 check (sort_order >= 0),
  spec jsonb not null default '{}'::jsonb check (jsonb_typeof(spec) = 'object'),
  constraint catalog_items_overmold_spec_check check (
    (kind <> 'overmold') or
    (
      (spec ? 'outerMaterial') and
      (jsonb_typeof(spec->'outerMaterial') = 'string') and
      (spec->>'outerMaterial' in ('黑色PVC', '黑色TPE')) and
      (spec ? 'outerForm') and
      (jsonb_typeof(spec->'outerForm') = 'string') and
      (spec->>'outerForm' in ('straight', 'bent')) and
      (not (spec ? 'innerMaterialOptional')) and
      (
        (
          (spec->>'outerMaterial' = '黑色PVC') and
          (spec ? 'outerHardness') and
          (jsonb_typeof(spec->'outerHardness') = 'string') and
          (spec->>'outerHardness' = '45P')
        ) or
        (
          (spec->>'outerMaterial' = '黑色TPE') and
          (not (spec ? 'outerHardness'))
        )
      ) and
      (
        (
          (not (spec ? 'innerMaterial')) and
          (not (spec ? 'innerForm'))
        ) or
        (
          (spec ? 'innerMaterial') and
          (jsonb_typeof(spec->'innerMaterial') = 'string') and
          (spec->>'innerMaterial' = '低密度透明PE') and
          (spec ? 'innerForm') and
          (jsonb_typeof(spec->'innerForm') = 'string') and
          (spec->>'innerForm' = spec->>'outerForm')
        )
      )
    ) is true
  ),
  constraint catalog_items_connector_spec_check check (
    (kind <> 'connector') or
    (
      (spec ? 'connectorType') and
      (jsonb_typeof(spec->'connectorType') = 'string') and
      (spec->>'connectorType' in ('male', 'female', 'receptacle')) and
      (spec ? 'pinCount') and
      (jsonb_typeof(spec->'pinCount') = 'number') and
      ((spec->>'pinCount')::numeric > 0) and
      ((spec->>'pinCount')::numeric = trunc((spec->>'pinCount')::numeric)) and
      (spec ? 'pinLabels') and
      (jsonb_typeof(spec->'pinLabels') = 'array') and
      (jsonb_array_length(spec->'pinLabels') = (spec->>'pinCount')::integer) and
      (not (spec ? 'shielded') or jsonb_typeof(spec->'shielded') = 'boolean') and
      (not (spec ? 'ratedVoltageV') or (jsonb_typeof(spec->'ratedVoltageV') = 'number' and (spec->>'ratedVoltageV')::numeric > 0)) and
      (not (spec ? 'ratedCurrentA') or (jsonb_typeof(spec->'ratedCurrentA') = 'number' and (spec->>'ratedCurrentA')::numeric > 0)) and
      (not (spec ? 'temperatureRangeC') or (
        jsonb_typeof(spec->'temperatureRangeC') = 'object' and
        ((not (spec->'temperatureRangeC' ? 'min')) or jsonb_typeof(spec->'temperatureRangeC'->'min') = 'number') and
        ((not (spec->'temperatureRangeC' ? 'max')) or jsonb_typeof(spec->'temperatureRangeC'->'max') = 'number') and
        (spec->'temperatureRangeC' ? 'min' or spec->'temperatureRangeC' ? 'max') and
        (
          not (spec->'temperatureRangeC' ? 'min' and spec->'temperatureRangeC' ? 'max') or
          (spec->'temperatureRangeC'->>'min')::numeric <= (spec->'temperatureRangeC'->>'max')::numeric
        )
      )) and
      (not (spec ? 'matingCyclesMin') or (
        jsonb_typeof(spec->'matingCyclesMin') = 'number' and
        (spec->>'matingCyclesMin')::numeric > 0 and
        (spec->>'matingCyclesMin')::numeric = trunc((spec->>'matingCyclesMin')::numeric)
      )) and
      (not (spec ? 'ingressProtection') or (
        jsonb_typeof(spec->'ingressProtection') = 'string' and
        length(btrim(spec->>'ingressProtection')) > 0
      )) and
      (not (spec ? 'flammabilityRating') or (
        jsonb_typeof(spec->'flammabilityRating') = 'string' and
        length(btrim(spec->>'flammabilityRating')) > 0
      ))
    ) is true
  ),
  constraint catalog_items_wire_spec_check check (
    (kind <> 'wire') or
    (
      (spec ? 'kind') and
      (jsonb_typeof(spec->'kind') = 'string') and
      (spec->>'kind' in ('electronic', 'jacketed')) and
      (spec ? 'awg') and
      (jsonb_typeof(spec->'awg') = 'number') and
      ((spec->>'awg')::numeric > 0) and
      (not (spec ? 'ratedVoltageV') or (jsonb_typeof(spec->'ratedVoltageV') = 'number' and (spec->>'ratedVoltageV')::numeric > 0)) and
      (not (spec ? 'temperatureRangeC') or (
        jsonb_typeof(spec->'temperatureRangeC') = 'object' and
        ((not (spec->'temperatureRangeC' ? 'min')) or jsonb_typeof(spec->'temperatureRangeC'->'min') = 'number') and
        ((not (spec->'temperatureRangeC' ? 'max')) or jsonb_typeof(spec->'temperatureRangeC'->'max') = 'number') and
        (spec->'temperatureRangeC' ? 'min' or spec->'temperatureRangeC' ? 'max') and
        (
          not (spec->'temperatureRangeC' ? 'min' and spec->'temperatureRangeC' ? 'max') or
          (spec->'temperatureRangeC'->>'min')::numeric <= (spec->'temperatureRangeC'->>'max')::numeric
        )
      )) and
      (not (spec ? 'rohsCompliant') or jsonb_typeof(spec->'rohsCompliant') = 'boolean') and
      (not (spec ? 'shieldCoverageRatio') or (
        jsonb_typeof(spec->'shieldCoverageRatio') = 'number' and
        (spec->>'shieldCoverageRatio')::numeric between 0 and 1
      )) and
      (not (spec ? 'outerDiameterMm') or (jsonb_typeof(spec->'outerDiameterMm') = 'number' and (spec->>'outerDiameterMm')::numeric > 0)) and
      (not (spec ? 'outerDiameterToleranceMm') or (jsonb_typeof(spec->'outerDiameterToleranceMm') = 'number' and (spec->>'outerDiameterToleranceMm')::numeric > 0)) and
      (not (spec ? 'flameTest') or (
        jsonb_typeof(spec->'flameTest') = 'string' and
        length(btrim(spec->>'flameTest')) > 0
      )) and
      (not (spec ? 'conductorMaterial') or (
        jsonb_typeof(spec->'conductorMaterial') = 'string' and
        length(btrim(spec->>'conductorMaterial')) > 0
      )) and
      (not (spec ? 'conductorStructure') or (
        jsonb_typeof(spec->'conductorStructure') = 'string' and
        length(btrim(spec->>'conductorStructure')) > 0
      )) and
      (not (spec ? 'insulationMaterial') or (
        jsonb_typeof(spec->'insulationMaterial') = 'string' and
        length(btrim(spec->>'insulationMaterial')) > 0
      )) and
      (not (spec ? 'insulationDiameterMm') or (
        jsonb_typeof(spec->'insulationDiameterMm') = 'number' and
        (spec->>'insulationDiameterMm')::numeric > 0
      )) and
      (not (spec ? 'insulationDiameterToleranceMm') or (
        jsonb_typeof(spec->'insulationDiameterToleranceMm') = 'number' and
        (spec->>'insulationDiameterToleranceMm')::numeric > 0
      )) and
      (not (spec ? 'braidStructure') or (
        jsonb_typeof(spec->'braidStructure') = 'string' and
        length(btrim(spec->>'braidStructure')) > 0
      )) and
      (not (spec ? 'braidStructureDescription') or (
        jsonb_typeof(spec->'braidStructureDescription') = 'string' and
        length(btrim(spec->>'braidStructureDescription')) > 0
      )) and
      (not (spec ? 'shieldCoverageDescription') or (
        jsonb_typeof(spec->'shieldCoverageDescription') = 'string' and
        length(btrim(spec->>'shieldCoverageDescription')) > 0
      )) and
      (not (spec ? 'jacketHardnessP') or (
        jsonb_typeof(spec->'jacketHardnessP') = 'number' and
        (spec->>'jacketHardnessP')::numeric > 0
      )) and
      (not (spec ? 'tensileStrengthPsi') or (
        jsonb_typeof(spec->'tensileStrengthPsi') = 'number' and
        (spec->>'tensileStrengthPsi')::numeric > 0
      )) and
      (not (spec ? 'elongationPercent') or (
        jsonb_typeof(spec->'elongationPercent') = 'number' and
        (spec->>'elongationPercent')::numeric >= 0
      )) and
      (not (spec ? 'conductorResistanceOhmPerKmAt20C') or (
        jsonb_typeof(spec->'conductorResistanceOhmPerKmAt20C') = 'number' and
        (spec->>'conductorResistanceOhmPerKmAt20C')::numeric > 0
      )) and
      (not (spec ? 'insulationResistanceMOhmKm') or (
        jsonb_typeof(spec->'insulationResistanceMOhmKm') = 'number' and
        (spec->>'insulationResistanceMOhmKm')::numeric > 0
      )) and
      (not (spec ? 'coreColorDescription') or (
        jsonb_typeof(spec->'coreColorDescription') = 'string' and
        length(btrim(spec->>'coreColorDescription')) > 0
      ))
    ) is true
  ),
  unique (kind, code)
);

create index catalog_items_kind_order_idx
  on public.catalog_items (kind, resource_group, sort_order, name);
