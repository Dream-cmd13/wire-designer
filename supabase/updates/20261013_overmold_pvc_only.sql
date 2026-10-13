-- 外模材质收紧为黑色 PVC 45P（2026-10-13）
-- 背景：数据库不存在 TPE 外模记录，统一删除 TPE 分支，只允许黑色 PVC 45P。
-- 范围：仅替换 catalog_items_overmold_spec_check 约束；不修改任何业务数据、目录 ID、图片绑定或关联关系。
-- 现有两条 PVC 种子记录（pvc-45p-straight、pvc-45p-bent）保持原样。
--
-- 执行前保存原约束定义（用于必要时人工恢复，本文件末尾也留有原始定义）：
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname = 'catalog_items_overmold_spec_check';
-- 执行前备份：pg_dump 备份 catalog_items 表结构及数据，并记录外模记录数：
--   select count(*) from public.catalog_items where kind = 'overmold';
--
-- 回退方案：使用原约束定义重新执行
--   alter table public.catalog_items drop constraint catalog_items_overmold_spec_check;
--   alter table public.catalog_items add constraint catalog_items_overmold_spec_check check ( ...原定义见文件末尾 );
-- 本脚本不改动目录数据，回退无需恢复数据。

begin;

-- 断言：现有外模均须符合目标规则，不符合则中止且不产生任何变更。
do $$
declare
  violating_count bigint;
  violating_codes text;
begin
  select count(*), string_agg(code, ', ' order by code)
  into violating_count, violating_codes
  from public.catalog_items
  where kind = 'overmold'
    and not (
      spec->>'outerMaterial' = '黑色PVC'
      and spec->>'outerHardness' = '45P'
    );

  if violating_count > 0 then
    raise exception '发现 % 条外模记录不符合黑色 PVC 45P 目标规则（code: %），已中止，数据库未发生变化。',
      violating_count, violating_codes;
  end if;
end $$;

alter table public.catalog_items
  drop constraint if exists catalog_items_overmold_spec_check;

alter table public.catalog_items
  add constraint catalog_items_overmold_spec_check check (
    (kind <> 'overmold') or
    (
      (spec ? 'outerMaterial') and
      (jsonb_typeof(spec->'outerMaterial') = 'string') and
      (spec->>'outerMaterial' = '黑色PVC') and
      (spec ? 'outerForm') and
      (jsonb_typeof(spec->'outerForm') = 'string') and
      (spec->>'outerForm' in ('straight', 'bent')) and
      (not (spec ? 'innerMaterialOptional')) and
      (spec ? 'outerHardness') and
      (jsonb_typeof(spec->'outerHardness') = 'string') and
      (spec->>'outerHardness' = '45P') and
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
  );

commit;

-- ============================================================================
-- 原约束定义（2026-10-13 收紧前），仅作备份参考，不随本脚本执行：
--
-- alter table public.catalog_items
--   add constraint catalog_items_overmold_spec_check check (
--     (kind <> 'overmold') or
--     (
--       (spec ? 'outerMaterial') and
--       (jsonb_typeof(spec->'outerMaterial') = 'string') and
--       (spec->>'outerMaterial' in ('黑色PVC', '黑色TPE')) and
--       (spec ? 'outerForm') and
--       (jsonb_typeof(spec->'outerForm') = 'string') and
--       (spec->>'outerForm' in ('straight', 'bent')) and
--       (not (spec ? 'innerMaterialOptional')) and
--       (
--         (
--           (spec->>'outerMaterial' = '黑色PVC') and
--           (spec ? 'outerHardness') and
--           (jsonb_typeof(spec->'outerHardness') = 'string') and
--           (spec->>'outerHardness' = '45P')
--         ) or
--         (
--           (spec->>'outerMaterial' = '黑色TPE') and
--           (not (spec ? 'outerHardness'))
--         )
--       ) and
--       (
--         (
--           (not (spec ? 'innerMaterial')) and
--           (not (spec ? 'innerForm'))
--         ) or
--         (
--           (spec ? 'innerMaterial') and
--           (jsonb_typeof(spec->'innerMaterial') = 'string') and
--           (spec->>'innerMaterial' = '低密度透明PE') and
--           (spec ? 'innerForm') and
--           (jsonb_typeof(spec->'innerForm') = 'string') and
--           (spec->>'innerForm' = spec->>'outerForm')
--         )
--       )
--     ) is true
--   );
-- ============================================================================
