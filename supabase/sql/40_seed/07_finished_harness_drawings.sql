-- ==============================================================================
-- 07_finished_harness_drawings.sql
-- 成品线束补充 2D 图纸（公开桶 finished-harness-drawings）
-- 仅当 file_2d 为空时回填；原本已有图纸的记录不做任何处理。
-- ==============================================================================

update public.finished_harness_materials
set file_2d = 'https://wioaznspvchiogdxvtun.supabase.co/storage/v1/object/public/finished-harness-drawings/WL-B21-593-2000.png', updated_at = now()
where platform_no = 'WL-B21-593-2000' and file_2d is null;

update public.finished_harness_materials
set file_2d = 'https://wioaznspvchiogdxvtun.supabase.co/storage/v1/object/public/finished-harness-drawings/WL-B21-450.png', updated_at = now()
where platform_no = 'WL-B21-450' and file_2d is null;

update public.finished_harness_materials
set file_2d = 'https://wioaznspvchiogdxvtun.supabase.co/storage/v1/object/public/finished-harness-drawings/WL-B21-467.png', updated_at = now()
where platform_no = 'WL-B21-467' and file_2d is null;

update public.finished_harness_materials
set file_2d = 'https://wioaznspvchiogdxvtun.supabase.co/storage/v1/object/public/finished-harness-drawings/WL-B21-468.png', updated_at = now()
where platform_no = 'WL-B21-468' and file_2d is null;

update public.finished_harness_materials
set file_2d = 'https://wioaznspvchiogdxvtun.supabase.co/storage/v1/object/public/finished-harness-drawings/WL-B21-597.png', updated_at = now()
where platform_no = 'WL-B21-597' and file_2d is null;

update public.finished_harness_materials
set file_2d = 'https://wioaznspvchiogdxvtun.supabase.co/storage/v1/object/public/finished-harness-drawings/WL-B21-598.png', updated_at = now()
where platform_no = 'WL-B21-598' and file_2d is null;

update public.finished_harness_materials
set file_2d = 'https://wioaznspvchiogdxvtun.supabase.co/storage/v1/object/public/finished-harness-drawings/WL-B21-392-15000.png', updated_at = now()
where platform_no = 'WL-B21-392-15000' and file_2d is null;

update public.finished_harness_materials
set file_2d = 'https://wioaznspvchiogdxvtun.supabase.co/storage/v1/object/public/finished-harness-drawings/WL-B21-393-15000.png', updated_at = now()
where platform_no = 'WL-B21-393-15000' and file_2d is null;
