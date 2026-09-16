-- ==============================================================================
-- 06_finished_harness_cost_analyses.sql
-- 成品线束物料主表扩展与成本分析、定价公式推导明细表
-- ==============================================================================

-- 1. 扩充成品线束主表核心价格汇总字段与来源 Excel，并将 source_material_id 调整为可空
alter table public.finished_harness_materials
  alter column source_material_id drop not null,
  add column if not exists total_cost numeric(12, 4),
  add column if not exists sales_price numeric(12, 4),
  add column if not exists sample_price numeric(12, 4),
  add column if not exists quote_price numeric(12, 4),
  add column if not exists has_cost_analysis boolean not null default false,
  add column if not exists source_excel_url text;

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

  -- 核心汇总数值
  material_cost numeric(12, 4) not null default 0,
  material_loss numeric(12, 4) not null default 0,
  labor_cost numeric(12, 4) not null default 0,
  labor_loss numeric(12, 4) not null default 0,
  total_cost numeric(12, 4) not null default 0,
  tax_cost numeric(12, 4) not null default 0,
  sales_price numeric(12, 4),
  sample_price numeric(12, 4),
  quote_price numeric(12, 4),

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

-- RLS 权限配置
alter table public.finished_harness_cost_analyses enable row level security;
revoke all on public.finished_harness_cost_analyses from anon, authenticated;
grant select on public.finished_harness_cost_analyses to authenticated;
drop policy if exists "finished harness cost analyses read" on public.finished_harness_cost_analyses;
create policy "finished harness cost analyses read" on public.finished_harness_cost_analyses for select to authenticated using (true);
