-- Normalize the drawing heat-shrink demo resource to the protective sleeve model.
-- Run manually with administrator privileges before rerunning the drawing seed on an existing database.

begin;

do $$
declare
  target_resource_id uuid;
begin
  select id
  into target_resource_id
  from public.resource_items
  where legacy_key = 'heat-shrink-6'
  order by created_at
  limit 1;

  if target_resource_id is null then
    return;
  end if;

  update public.resource_items
  set lifecycle_status = 'inactive', updated_at = now()
  where id = target_resource_id;

  delete from public.accessories
  where resource_item_id = target_resource_id;

  update public.resource_items
  set
    resource_type = 'protective_sleeve',
    resource_name = 'Φ6热缩套管',
    model = 'HS-6MM',
    resource_group = '绘图辅材',
    short_description = '黑色热缩套管',
    updated_at = now()
  where id = target_resource_id;

  insert into public.protective_sleeves (
    resource_item_id, material, color, sleeve_type, shrink_ratio,
    nominal_length_m, inner_diameter_as_supplied_mm,
    inner_diameter_recovered_mm, recovered_wall_thickness_mm
  ) values (
    target_resource_id, 'polyolefin', 'black', 'heat-shrink', 2, 1, 6, 3, 0.55
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

  update public.resource_items
  set lifecycle_status = 'active', updated_at = now()
  where id = target_resource_id;
end;
$$;

commit;
