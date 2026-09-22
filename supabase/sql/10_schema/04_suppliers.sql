create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null check (length(btrim(supplier_name)) between 1 and 200),
  supplier_no text not null check (supplier_no ~ '^[A-Za-z0-9_]{2,30}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_name_unique unique (supplier_name),
  constraint suppliers_no_unique unique (supplier_no)
);

alter table public.suppliers enable row level security;
revoke all on public.suppliers from anon, authenticated;
grant select on public.suppliers to authenticated;

drop policy if exists "suppliers public read" on public.suppliers;
drop policy if exists "suppliers authenticated read" on public.suppliers;
create policy "suppliers authenticated read"
  on public.suppliers for select to authenticated
  using (true);

alter table public.catalog_items
  add column if not exists supplier_id uuid references public.suppliers(id);

create index if not exists catalog_items_supplier_id_idx
  on public.catalog_items (supplier_id);

insert into public.suppliers (supplier_name, supplier_no) values
  ('昌骏', 'A227'),
  ('鼎力', 'A118'),
  ('东莞市友源电工材料有限公司', 'A526'),
  ('犇凯', 'A486'),
  ('东莞市连轶电子有限公司', 'A549'),
  ('华盛通', 'A519'),
  ('澳讯', 'G50196_LS'),
  ('胜牌', 'A553'),
  ('浙江泰肯电子科技有限公司', 'A523'),
  ('恒达', 'A458'),
  ('惠州市新星机械加工厂', 'A569'),
  ('凯威尔', 'A592'),
  ('华测检测认证集团股份有限公司', 'G00604'),
  ('东莞市天睦电子科技有限公司', 'A538'),
  ('冠濠', 'A331'),
  ('广东速通科技有限公司', 'A586'),
  ('迪斯迈', 'A596'),
  ('深圳市亿上精密工业有限公司', 'G50246_LS'),
  ('东莞市云亿电子科技有限公司', 'A461'),
  ('东莞市润莱电子科技有限公司', 'A563'),
  ('粤海', 'A611'),
  ('东莞市合丰景程电子科技有限公司', 'A600'),
  ('联速', 'A609'),
  ('淘宝', 'G00624')
on conflict (supplier_name) do update
set supplier_no = excluded.supplier_no, updated_at = now();
