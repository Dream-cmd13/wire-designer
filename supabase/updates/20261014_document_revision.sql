-- ==============================================================================
-- 20261014_document_revision.sql
-- 项目与图纸的乐观并发控制：新增 revision 列与版本校验写入 RPC。
-- 保留数据、可重复执行：只新增列/函数/触发器和收紧权限，不修改任何既有业务行；
-- 既有行 revision 默认为 1，内容、主键与 owner 不变。
-- 回退说明：回退应用版本时不能恢复带版本校验的写入契约，只能部署已验证的新前端；
-- 如需撤销本迁移，先证明不会扩大权限或丢数据，且不得恢复 authenticated 的直接写权限。
-- ==============================================================================
begin;

-- 1. 版本列：既有行自动获得 revision = 1
alter table public.projects add column if not exists revision integer not null default 1;
alter table public.drawings add column if not exists revision integer not null default 1;

-- 2. 版本由数据库触发器维护：成功更新必然递增，客户端无法伪造
create or replace function public.bump_document_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  return new;
end $$;
revoke all on function public.bump_document_revision() from public, anon, authenticated;

drop trigger if exists projects_bump_revision on public.projects;
create trigger projects_bump_revision before update on public.projects
  for each row execute function public.bump_document_revision();

drop trigger if exists drawings_bump_revision on public.drawings;
create trigger drawings_bump_revision before update on public.drawings
  for each row execute function public.bump_document_revision();

-- 3. 文档编辑权限门禁：登录 + 工程师/管理员角色 + 非强制改密
create or replace function public.can_edit_documents() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.current_app_role() in ('engineer', 'admin')
$$;
revoke all on function public.can_edit_documents() from public, anon;
grant execute on function public.can_edit_documents() to authenticated, service_role;

-- 4. 项目写入 RPC
-- expected_revision 为 null 表示创建；更新必须提供读取到的版本。
-- 更新使用 WHERE revision = expected_revision 原子条件，冲突时不做任何写入。
create or replace function public.save_project_document(
  project_id uuid,
  expected_revision integer,
  project_payload jsonb,
  project_description text default null
) returns table (revision integer, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  next_revision integer;
  next_updated_at timestamptz;
begin
  if not public.can_edit_documents() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if project_id is null
    or project_payload is null
    or jsonb_typeof(project_payload) <> 'object'
    or (project_payload->>'id') is distinct from project_id::text
    or project_payload->>'name' is null
    or length(btrim(project_payload->>'name')) not between 1 and 200 then
    raise exception 'Invalid project document' using errcode = '22023';
  end if;

  if expected_revision is null then
    -- 创建：只 INSERT，已存在（含他人文档）一律拒绝，避免旧文档被 upsert 复活
    if exists (select 1 from public.projects where id = project_id) then
      raise exception 'Document already exists' using errcode = 'P0002';
    end if;
    insert into public.projects (id, owner_id, name, description, config)
      values (project_id, auth.uid(), btrim(project_payload->>'name'),
        coalesce(project_description, ''), project_payload)
      returning projects.revision, projects.updated_at into next_revision, next_updated_at;
  else
    update public.projects p
      set name = btrim(project_payload->>'name'),
          config = project_payload,
          description = coalesce(project_description, p.description),
          updated_at = now()
      where p.id = project_id
        and p.owner_id = auth.uid()
        and p.revision = expected_revision
      returning p.revision, p.updated_at into next_revision, next_updated_at;
    if next_revision is null then
      -- 只对本人文档区分冲突与不存在，不返回其他用户文档的存在性
      if exists (select 1 from public.projects where id = project_id and owner_id = auth.uid()) then
        raise exception 'Version conflict' using errcode = 'P0002';
      end if;
      raise exception 'Document not found' using errcode = 'P0002';
    end if;
  end if;

  return query select next_revision, next_updated_at;
end $$;
revoke all on function public.save_project_document(uuid,integer,jsonb,text) from public, anon;
grant execute on function public.save_project_document(uuid,integer,jsonb,text) to authenticated;

-- 元数据改名/描述更新走同一版本规则；只修改行字段，不覆盖文档内容。
create or replace function public.update_project_metadata(
  project_id uuid,
  expected_revision integer,
  new_name text,
  new_description text default null
) returns table (revision integer, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  next_revision integer;
  next_updated_at timestamptz;
begin
  if not public.can_edit_documents() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if new_name is not null and length(btrim(new_name)) not between 1 and 200 then
    raise exception 'Invalid project name' using errcode = '22023';
  end if;
  update public.projects p
    set name = coalesce(nullif(btrim(new_name), ''), p.name),
        description = coalesce(new_description, p.description),
        updated_at = now()
    where p.id = project_id
      and p.owner_id = auth.uid()
      and p.revision = expected_revision
    returning p.revision, p.updated_at into next_revision, next_updated_at;
  if next_revision is null then
    if exists (select 1 from public.projects where id = project_id and owner_id = auth.uid()) then
      raise exception 'Version conflict' using errcode = 'P0002';
    end if;
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  return query select next_revision, next_updated_at;
end $$;
revoke all on function public.update_project_metadata(uuid,integer,text,text) from public, anon;
grant execute on function public.update_project_metadata(uuid,integer,text,text) to authenticated;

create or replace function public.delete_project_document(
  project_id uuid,
  expected_revision integer
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_edit_documents() then raise exception 'Forbidden' using errcode = '42501'; end if;
  delete from public.projects
    where id = project_id
      and owner_id = auth.uid()
      and revision = expected_revision;
  if not found then
    if exists (select 1 from public.projects where id = project_id and owner_id = auth.uid()) then
      raise exception 'Version conflict' using errcode = 'P0002';
    end if;
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.delete_project_document(uuid,integer) from public, anon;
grant execute on function public.delete_project_document(uuid,integer) to authenticated;

-- 5. 图纸写入 RPC（同一版本契约）
create or replace function public.save_drawing_document(
  document_id text,
  expected_revision integer,
  document_payload jsonb
) returns table (revision integer, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  next_revision integer;
  next_updated_at timestamptz;
begin
  if not public.can_edit_documents() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if document_id is null
    or length(btrim(document_id)) not between 1 and 200
    or document_payload is null
    or jsonb_typeof(document_payload) <> 'object'
    or (document_payload->>'id') is distinct from document_id
    or jsonb_typeof(document_payload->'updatedAt') is distinct from 'number' then
    raise exception 'Invalid drawing document' using errcode = '22023';
  end if;

  if expected_revision is null then
    if exists (select 1 from public.drawings where id = document_id) then
      raise exception 'Document already exists' using errcode = 'P0002';
    end if;
    insert into public.drawings (id, owner_id, document)
      values (document_id, auth.uid(), document_payload)
      returning drawings.revision, drawings.updated_at into next_revision, next_updated_at;
  else
    update public.drawings d
      set document = document_payload,
          updated_at = now()
      where d.id = document_id
        and d.owner_id = auth.uid()
        and d.revision = expected_revision
      returning d.revision, d.updated_at into next_revision, next_updated_at;
    if next_revision is null then
      if exists (select 1 from public.drawings where id = document_id and owner_id = auth.uid()) then
        raise exception 'Version conflict' using errcode = 'P0002';
      end if;
      raise exception 'Document not found' using errcode = 'P0002';
    end if;
  end if;

  return query select next_revision, next_updated_at;
end $$;
revoke all on function public.save_drawing_document(text,integer,jsonb) from public, anon;
grant execute on function public.save_drawing_document(text,integer,jsonb) to authenticated;

create or replace function public.delete_drawing_document(
  document_id text,
  expected_revision integer
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_edit_documents() then raise exception 'Forbidden' using errcode = '42501'; end if;
  delete from public.drawings
    where id = document_id
      and owner_id = auth.uid()
      and revision = expected_revision;
  if not found then
    if exists (select 1 from public.drawings where id = document_id and owner_id = auth.uid()) then
      raise exception 'Version conflict' using errcode = 'P0002';
    end if;
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.delete_drawing_document(text,integer) from public, anon;
grant execute on function public.delete_drawing_document(text,integer) to authenticated;

-- 6. 收紧直接写权限：所有写入只能通过带版本校验的 RPC；保留 SELECT 与原 RLS。
revoke insert, update, delete on public.projects, public.drawings from anon, authenticated;
grant select on public.projects, public.drawings to authenticated;

commit;
