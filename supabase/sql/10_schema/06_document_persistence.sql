-- User-owned document persistence and immutable recovery versions.

create table if not exists public.project_document_versions (
  project_id uuid not null references public.projects(id) on delete cascade,
  revision bigint not null check (revision > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  schema_version integer not null check (schema_version > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  primary key (project_id, revision)
);

create table if not exists public.drawing_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public."user"(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 200),
  drawing_json jsonb not null check (jsonb_typeof(drawing_json) = 'object'),
  schema_version integer not null check (schema_version > 0),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public."user"(id) on delete set null
);

create table if not exists public.drawing_document_versions (
  drawing_id uuid not null references public.drawing_documents(id) on delete cascade,
  revision bigint not null check (revision > 0),
  drawing_json jsonb not null check (jsonb_typeof(drawing_json) = 'object'),
  schema_version integer not null check (schema_version > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  primary key (drawing_id, revision)
);

create index if not exists project_document_versions_lookup_idx
  on public.project_document_versions (project_id, revision desc);
create index if not exists drawing_documents_owner_updated_idx
  on public.drawing_documents (owner_id, updated_at desc)
  where deleted_at is null;
create index if not exists drawing_documents_project_idx
  on public.drawing_documents (project_id, updated_at desc)
  where deleted_at is null;
create index if not exists drawing_document_versions_lookup_idx
  on public.drawing_document_versions (drawing_id, revision desc);

