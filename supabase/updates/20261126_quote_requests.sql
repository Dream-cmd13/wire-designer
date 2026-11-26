begin;

create table if not exists public.quote_requests (
  id uuid primary key,
  receipt text not null unique default ('RFQ-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 16))),
  payload jsonb not null check (jsonb_typeof(payload->'files') = 'array' and jsonb_array_length(payload->'files') between 0 and 5),
  status text not null default 'uploading' check (status in ('uploading', 'pending', 'following', 'quoted', 'closed')),
  assignee_id uuid references auth.users(id) on delete set null,
  follow_up_note text not null default '' check (length(follow_up_note) <= 4000),
  last_updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((submitted_at is null) = (status = 'uploading'))
);
create index if not exists quote_requests_created_idx on public.quote_requests (created_at);
create index if not exists quote_requests_submitted_idx on public.quote_requests (submitted_at desc, id) where submitted_at is not null;

insert into storage.buckets (id, name, public, file_size_limit)
values ('quote-request-files', 'quote-request-files', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create or replace function public.can_handle_quote_requests() returns boolean
language sql stable security definer set search_path = '' as $$
  select not public.password_change_required() and exists (
    select 1 from public.user_roles where user_id = auth.uid() and role in ('sales', 'admin')
  );
$$;

alter table public.quote_requests enable row level security;
revoke all on public.quote_requests from public, anon, authenticated;
grant select on public.quote_requests to authenticated;
grant select, delete on public.quote_requests to service_role;
drop policy if exists "staff read submitted quote requests" on public.quote_requests;
create policy "staff read submitted quote requests" on public.quote_requests for select to authenticated
using (submitted_at is not null and (select public.can_handle_quote_requests()));
drop policy if exists "staff read submitted quote request files" on storage.objects;
create policy "staff read submitted quote request files" on storage.objects for select to authenticated
using (bucket_id = 'quote-request-files' and exists (
  select 1 from public.quote_requests as q
  where q.id::text = split_part(storage.objects.name, '/', 1) and q.submitted_at is not null
));

create or replace function public.prepare_quote_request(request_id uuid, request_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existing public.quote_requests%rowtype;
  recent timestamptz := now() - interval '1 hour';
  contact_phone text := regexp_replace(request_payload->>'phone', '^\+', '');
  contact_email text := request_payload->>'email';
begin
  -- Serialize admission so concurrent requests cannot bypass the hourly quota or duplicate a submission.
  perform pg_advisory_xact_lock(623831729501427319::bigint);
  select * into existing from public.quote_requests where id = request_id;
  if found then
    if existing.payload <> request_payload then return jsonb_build_object('state', 'conflict'); end if;
    if existing.submitted_at is not null then return jsonb_build_object('state', 'received', 'receipt', existing.receipt); end if;
    if existing.created_at <= now() - interval '2 hours' then return jsonb_build_object('state', 'expired'); end if;
    return jsonb_build_object('state', 'uploading');
  end if;
  if (select count(*) from public.quote_requests where created_at > recent) >= 200
    or (select count(*) from public.quote_requests where created_at > recent and (
      (contact_phone <> '' and regexp_replace(payload->>'phone', '^\+', '') = contact_phone)
      or (contact_email <> '' and payload->>'email' = contact_email)
    )) >= 5 then
    return jsonb_build_object('state', 'rate_limited');
  end if;
  insert into public.quote_requests (id, payload) values (request_id, request_payload);
  return jsonb_build_object('state', 'uploading');
end;
$$;

create or replace function public.finalize_quote_request(request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existing public.quote_requests%rowtype;
begin
  select * into existing from public.quote_requests where id = request_id for update;
  if not found then return jsonb_build_object('state', 'expired'); end if;
  if existing.submitted_at is not null then
    return jsonb_build_object('state', 'received', 'receipt', existing.receipt, 'created', false);
  end if;
  if existing.created_at <= now() - interval '2 hours' then return jsonb_build_object('state', 'expired'); end if;
  if exists (
    select 1 from jsonb_array_elements(existing.payload->'files') with ordinality as file(entry, position)
    where not exists (
      select 1 from storage.objects where bucket_id = 'quote-request-files'
        and name = request_id::text || '/' || (file.position - 1)::text
        and metadata->>'size' = file.entry->>'size'
    )
  ) then return jsonb_build_object('state', 'missing_files'); end if;
  update public.quote_requests set status = 'pending', submitted_at = now(), updated_at = now() where id = request_id;
  return jsonb_build_object('state', 'received', 'receipt', existing.receipt, 'created', true);
end;
$$;

create or replace function public.update_quote_request(request_id uuid, expected_updated_at timestamptz, next_status text, note text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existing public.quote_requests%rowtype;
  actor uuid := auth.uid();
  is_admin boolean;
  clean_note text := btrim(coalesce(note, ''));
begin
  if not public.can_handle_quote_requests() then raise exception '无询价处理权限' using errcode = '42501'; end if;
  select exists(select 1 from public.user_roles where user_id = actor and role = 'admin') into is_admin;
  select * into existing from public.quote_requests where id = request_id and submitted_at is not null for update;
  if not found or existing.updated_at is distinct from expected_updated_at then
    raise exception '询价已更新，请刷新后重试' using errcode = '40001';
  end if;
  if existing.assignee_id is not null and existing.assignee_id <> actor and not is_admin then
    raise exception '该询价已由其他专员接单' using errcode = '42501';
  end if;
  if next_status is null or not (
    (existing.status = 'pending' and next_status = 'following') or
    (existing.status = 'following' and next_status in ('following', 'quoted', 'closed')) or
    (existing.status = 'quoted' and next_status in ('quoted', 'closed'))
  ) then raise exception '不支持该状态变更' using errcode = '22023'; end if;
  if length(clean_note) > 4000 or (next_status = 'quoted' and clean_note = '') then
    raise exception '请填写报价记录，记录最多 4000 字' using errcode = '22023';
  end if;
  update public.quote_requests
    set status = next_status, follow_up_note = clean_note, assignee_id = coalesce(existing.assignee_id, actor),
      last_updated_by = actor, updated_at = clock_timestamp()
    where id = request_id returning * into existing;
  return to_jsonb(existing);
end;
$$;

revoke all on function public.can_handle_quote_requests(), public.update_quote_request(uuid,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.can_handle_quote_requests(), public.update_quote_request(uuid,timestamptz,text,text) to authenticated;
revoke all on function public.prepare_quote_request(uuid,jsonb), public.finalize_quote_request(uuid) from public, anon, authenticated;
grant execute on function public.prepare_quote_request(uuid,jsonb), public.finalize_quote_request(uuid) to service_role;

commit;
