-- Real materials from 成本分析-M12单线. Preserve existing image bindings on reseed.

begin;

insert into public.catalog_items
  (id, kind, code, name, model, manufacturer, resource_group, description, image_path, image_variants, sort_order, spec)
values
  ('40000000-0000-4000-8000-000000000201', 'overmold', 'pvc-45p-pe', '黑色PVC 45P直头外模', 'PVC-45P-STRAIGHT', '', '外模', '', 'catalog/overmold/40000000-0000-4000-8000-000000000201/overmold.png', '{}'::jsonb, 10, '{"innerForm":"straight","outerForm":"straight","innerMaterial":"低密度透明PE","outerHardness":"45P","outerMaterial":"黑色PVC"}'::jsonb),
  ('40000000-0000-4000-8000-000000000202', 'overmold', 'pvc-45p-bent', '黑色PVC 45P弯头外模', 'PVC-45P-BENT', '', '外模', '', 'catalog/overmold/40000000-0000-4000-8000-000000000201/overmold.png', '{}'::jsonb, 20, '{"innerForm":"bent","outerForm":"bent","innerMaterial":"低密度透明PE","outerHardness":"45P","outerMaterial":"黑色PVC"}'::jsonb)
on conflict (kind, code) do update set
  name = excluded.name,
  model = excluded.model,
  manufacturer = excluded.manufacturer,
  resource_group = excluded.resource_group,
  description = excluded.description,
  sort_order = excluded.sort_order,
  spec = excluded.spec;

commit;
