create table if not exists public.finished_harness_materials (
  id uuid primary key default gen_random_uuid(),
  source_material_id bigint unique,
  source_goods_id bigint,
  platform_no text not null,
  son_name text not null,
  supplier_id uuid references public.suppliers(id),
  file_2d text,
  packing_way text,
  packing integer,
  son_unit text,
  son_price_low numeric(12,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finished_harness_platform_no_check check (length(btrim(platform_no)) between 1 and 60),
  constraint finished_harness_name_check check (length(btrim(son_name)) between 1 and 200),
  constraint finished_harness_price_check check (son_price_low is null or son_price_low >= 0),
  constraint finished_harness_packing_check check (packing is null or packing >= 0)
);
create index if not exists finished_harness_platform_no_idx on public.finished_harness_materials(platform_no);
create index if not exists finished_harness_supplier_id_idx on public.finished_harness_materials(supplier_id);
alter table public.finished_harness_materials enable row level security;
revoke all on public.finished_harness_materials from anon, authenticated;
grant select on public.finished_harness_materials to authenticated;
drop policy if exists "finished harness materials read" on public.finished_harness_materials;
create policy "finished harness materials read" on public.finished_harness_materials for select to authenticated using (true);
