-- ==============================================================================
-- 06_finished_harness_cost_analyses.sql
-- 成品线束物料主表扩展与成本分析、定价公式推导明细表
-- ==============================================================================

-- 1. 扩充成品线束主表核心价格汇总字段与来源 Excel，并将 source_material_id 调整为可空
alter table public.finished_harness_materials
  alter column source_material_id drop not null,
  alter column son_name drop not null,
  add column if not exists total_cost numeric,
  add column if not exists sales_price numeric,
  add column if not exists sample_price numeric,
  add column if not exists quote_price numeric,
  add column if not exists has_cost_analysis boolean not null default false,
  add column if not exists source_excel_url text;

comment on column public.finished_harness_materials.source_excel_url is
  '来源 Excel 的 URL 形式展示/兼容定位（前端从中解析 path 后认证下载）；私有桶下不可匿名访问，非公开链接。';

-- 确保 platform_no 具备全局唯一约束
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'finished_harness_materials_platform_no_key'
  ) then
    alter table public.finished_harness_materials add constraint finished_harness_materials_platform_no_key unique (platform_no);
  end if;
end $$;

-- 2. 创建成品线束成本分析与推导过程表
create table if not exists public.finished_harness_cost_analyses (
  id uuid primary key default gen_random_uuid(),
  harness_material_id uuid references public.finished_harness_materials(id) on delete cascade,
  platform_no text not null,
  source_excel_file text not null,
  source_excel_path text,
  source_excel_url text,
  source_sheet_name text not null,
  customer_name text,
  customer_part_no text,

  -- 核心汇总数值（原表缺失即 null，不做任何回退推算）
  material_cost numeric,
  material_loss numeric,
  labor_cost numeric,
  labor_loss numeric,
  total_cost numeric,
  tax_cost numeric,
  sales_price numeric,
  sample_price numeric,
  quote_price numeric,

  -- 结构化 JSONB 字段
  formula_config jsonb not null default '{}'::jsonb,
  calculation_steps jsonb not null default '[]'::jsonb,
  bom_items jsonb not null default '[]'::jsonb,
  labor_items jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint finished_harness_cost_analyses_platform_no_key unique (platform_no)
);

create index if not exists idx_finished_cost_analyses_harness_id on public.finished_harness_cost_analyses(harness_material_id);
create index if not exists idx_finished_cost_analyses_platform_no on public.finished_harness_cost_analyses(platform_no);

-- 兼容已建库：移除历史默认值与非空约束，确保原表缺失值可以如实存为 null
alter table public.finished_harness_cost_analyses
  alter column material_cost drop not null,
  alter column material_cost drop default,
  alter column material_loss drop not null,
  alter column material_loss drop default,
  alter column labor_cost drop not null,
  alter column labor_cost drop default,
  alter column labor_loss drop not null,
  alter column labor_loss drop default,
  alter column total_cost drop not null,
  alter column total_cost drop default,
  alter column tax_cost drop not null,
  alter column tax_cost drop default;

-- 核心数值不得为负（缺失允许 null）
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'finished_cost_non_negative_check'
  ) then
    alter table public.finished_harness_cost_analyses
      add constraint finished_cost_non_negative_check check (
        (material_cost is null or material_cost >= 0)
        and (material_loss is null or material_loss >= 0)
        and (labor_cost is null or labor_cost >= 0)
        and (labor_loss is null or labor_loss >= 0)
        and (total_cost is null or total_cost >= 0)
        and (tax_cost is null or tax_cost >= 0)
        and (sales_price is null or sales_price >= 0)
        and (sample_price is null or sample_price >= 0)
        and (quote_price is null or quote_price >= 0)
      );
  end if;
end $$;

-- 来源 Excel 定位约定：
-- source_excel_path 是私有桶 cost-analysis-sources 内的对象路径，为唯一权威定位；
-- source_excel_url 仅作为“URL 形式”的展示/兼容定位（前端会从中解析出 path 后走认证下载），
-- 私有桶下不可匿名访问，禁止把它当作可直接打开的公开链接。
comment on column public.finished_harness_cost_analyses.source_excel_path is
  '私有桶 cost-analysis-sources 内的对象路径，来源 Excel 的唯一权威定位。';
comment on column public.finished_harness_cost_analyses.source_excel_url is
  '来源 Excel 的 URL 形式展示/兼容定位（前端从中解析 path 后认证下载）；私有桶下不可匿名访问，非公开链接。';

-- RLS 权限配置
alter table public.finished_harness_cost_analyses enable row level security;
revoke all on public.finished_harness_cost_analyses from anon, authenticated;
grant select on public.finished_harness_cost_analyses to authenticated;
drop policy if exists "finished harness cost analyses read" on public.finished_harness_cost_analyses;
create policy "finished harness cost analyses read" on public.finished_harness_cost_analyses for select to authenticated using (true);

-- 数值保留 Excel 原始精度，显示格式保存在 formula_config / 明细 JSON 中。
alter table public.finished_harness_materials
  alter column total_cost type numeric,
  alter column sales_price type numeric,
  alter column sample_price type numeric,
  alter column quote_price type numeric;
alter table public.finished_harness_cost_analyses
  alter column material_cost type numeric,
  alter column material_loss type numeric,
  alter column labor_cost type numeric,
  alter column labor_loss type numeric,
  alter column total_cost type numeric,
  alter column tax_cost type numeric,
  alter column sales_price type numeric,
  alter column sample_price type numeric,
  alter column quote_price type numeric;
