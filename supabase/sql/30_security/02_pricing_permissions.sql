drop policy if exists "shared prices read" on public.material_prices;
drop policy if exists "shared prices insert" on public.material_prices;
drop policy if exists "shared prices update" on public.material_prices;
create policy "internal prices read" on public.material_prices for select to authenticated using (public.can_manage_pricing());
create policy "internal prices insert" on public.material_prices for insert to authenticated with check (public.can_manage_pricing());
create policy "internal prices update" on public.material_prices for update to authenticated using (public.can_manage_pricing()) with check (public.can_manage_pricing());
drop policy if exists "catalog accessory insert" on public.catalog_items;
create policy "catalog accessory insert" on public.catalog_items for insert to authenticated
  with check (kind = 'accessory' and public.can_manage_pricing());

-- Replace every old select policy to avoid permissive-policy OR bypasses.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('finished_harness_materials','finished_harness_cost_analyses') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
create policy "internal finished materials read" on public.finished_harness_materials for select to authenticated using (public.can_manage_pricing());
create policy "internal cost analysis read" on public.finished_harness_cost_analyses for select to authenticated using (public.can_manage_pricing());
drop policy if exists "cost analysis sources authenticated read" on storage.objects;
create policy "cost analysis sources internal read" on storage.objects for select to authenticated
  using (bucket_id = 'cost-analysis-sources' and public.can_manage_pricing());

-- View owner reads the base table; explicit role-dependent projection is the boundary.
create view public.finished_harness_materials_visible with (security_barrier = true) as
select h.id, h.source_material_id, h.source_goods_id, h.platform_no, h.son_name, h.supplier_id,
  h.file_2d, h.packing_way, h.packing, h.son_unit, h.quote_price, h.created_at, h.updated_at,
  jsonb_build_object('supplier_no', s.supplier_no) as supplier,
  case when public.can_manage_pricing() then h.son_price_low end as son_price_low,
  case when public.can_manage_pricing() then h.total_cost end as total_cost,
  case when public.can_manage_pricing() then h.sales_price end as sales_price,
  case when public.can_manage_pricing() then h.sample_price end as sample_price,
  public.can_manage_pricing() and h.has_cost_analysis as has_cost_analysis,
  case when public.can_manage_pricing() then h.source_excel_url end as source_excel_url
from public.finished_harness_materials h left join public.suppliers s on s.id = h.supplier_id
where auth.uid() is not null;
revoke all on public.finished_harness_materials_visible from public, anon, authenticated;
grant select on public.finished_harness_materials_visible to authenticated, service_role;

drop policy if exists "projects owner access" on public.projects;
create policy "projects owner access" on public.projects for all to authenticated
  using (owner_id = auth.uid() and public.can_manage_pricing())
  with check (owner_id = auth.uid() and public.can_manage_pricing());
drop policy if exists "drawings owner access" on public.drawings;
create policy "drawings owner access" on public.drawings for all to authenticated
  using (owner_id = auth.uid() and public.can_manage_pricing())
  with check (owner_id = auth.uid() and public.can_manage_pricing());
drop policy if exists "dwg drawings authenticated read" on storage.objects;
create policy "dwg drawings internal read" on storage.objects for select to authenticated
  using (bucket_id = 'dwg-drawings' and public.can_manage_pricing());
drop policy if exists "finished harness drawings authenticated read" on storage.objects;
create policy "finished harness drawings internal read" on storage.objects for select to authenticated
  using (bucket_id = 'finished-harness-drawings' and public.can_manage_pricing());
