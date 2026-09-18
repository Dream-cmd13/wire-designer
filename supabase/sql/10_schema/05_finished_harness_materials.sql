create table if not exists public.finished_harness_materials (
  id uuid primary key default gen_random_uuid(),
  source_material_id bigint unique,
  source_goods_id bigint,
  platform_no text not null,
  -- son_name 允许为空：只存外部/Excel 来源名称，缺失保持 null，界面以“未命名”兜底，禁止用 platform_no 回填。
  son_name text,
  supplier_id uuid references public.suppliers(id),
  file_2d text,
  packing_way text,
  packing integer,
  -- son_unit 为外部导入单位：有值即保留，缺失保持 null；成本分析建档不写入（前端展示时按 pcs 兜底）。
  son_unit text,
  -- son_price_low 是 CRM 平台同步过来的“最低售价”：有值即原样保留，缺失保持 null。
  -- 禁止任何脚本、种子或成本分析/Excel 推导流程回填、覆盖或删除该列。
  son_price_low numeric(12,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finished_harness_platform_no_check check (length(btrim(platform_no)) between 1 and 60),
  constraint finished_harness_name_check check (son_name is null or length(btrim(son_name)) between 1 and 200),
  constraint finished_harness_price_check check (son_price_low is null or son_price_low >= 0),
  constraint finished_harness_packing_check check (packing is null or packing >= 0)
);
comment on column public.finished_harness_materials.son_price_low is
  'CRM 平台最低售价（外部导入）：有值即保留，缺失保持 null；禁止由成本分析/Excel 推导回填或覆盖。';
comment on column public.finished_harness_materials.son_unit is
  '外部导入单位：有值即保留，缺失保持 null；成本分析建档不写入该列。';
comment on column public.finished_harness_materials.son_name is
  '成品名称：只存外部/Excel 来源名称，缺失保持 null，界面以“未命名”兜底；禁止用 platform_no 回填。';
create index if not exists finished_harness_platform_no_idx on public.finished_harness_materials(platform_no);
create index if not exists finished_harness_supplier_id_idx on public.finished_harness_materials(supplier_id);
alter table public.finished_harness_materials enable row level security;
revoke all on public.finished_harness_materials from anon, authenticated;
grant select on public.finished_harness_materials to authenticated;
drop policy if exists "finished harness materials read" on public.finished_harness_materials;
create policy "finished harness materials read" on public.finished_harness_materials for select to authenticated using (true);
