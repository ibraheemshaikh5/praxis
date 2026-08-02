create type public.application_status as enum (
  'applied',
  'oa_received',
  'oa_completed',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'ghosted'
);

create type public.sheet_sync_status as enum ('pending', 'synced', 'failed');

-- Like increment_task_version(), except spreadsheet bookkeeping is not owner
-- intent: recording a sync result must not invalidate an editor's version.
create or replace function public.increment_application_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.cycle,
    new.application_number,
    new.company,
    new.title,
    new.status,
    new.notes,
    new.applied_on
  ) is distinct from (
    old.cycle,
    old.application_number,
    old.company,
    old.title,
    old.status,
    old.notes,
    old.applied_on
  ) then
    new.version = old.version + 1;
  else
    new.version = old.version;
  end if;

  return new;
end;
$$;

revoke all on function public.increment_application_version() from public;

create table public.applications (
  id uuid primary key default gen_random_uuid() not null,
  user_id uuid not null,
  cycle text not null default 'S27',
  application_number integer not null,
  company text not null,
  title text not null,
  status public.application_status not null default 'applied',
  notes text,
  applied_on date not null,
  sheet_sync_status public.sheet_sync_status not null default 'pending',
  sheet_synced_at timestamp with time zone,
  sheet_sync_error text,
  version integer not null default 1,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint applications_id_user_id_key unique (id, user_id),
  -- Mirrors the spreadsheet's "#" column: one sequence per recruiting cycle.
  constraint applications_user_cycle_number_key unique (user_id, cycle, application_number),
  constraint applications_user_id_profiles_id_fk foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint applications_cycle_format_check check (cycle ~ '^[A-Za-z]{1,3}[0-9]{2}$'),
  constraint applications_number_positive_check check (application_number > 0),
  constraint applications_company_length_check check (length(trim(company)) between 1 and 200),
  constraint applications_title_length_check check (length(trim(title)) between 1 and 200),
  constraint applications_notes_length_check check (notes is null or length(notes) <= 5000),
  constraint applications_version_positive_check check (version > 0)
);

create table public.google_connections (
  user_id uuid primary key,
  google_email text,
  refresh_token_ciphertext text not null,
  scope text not null,
  spreadsheet_id text,
  last_imported_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint google_connections_user_id_profiles_id_fk foreign key (user_id)
    references public.profiles (id) on delete cascade
);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

create trigger applications_increment_version
  before update on public.applications
  for each row execute function public.increment_application_version();

create trigger google_connections_set_updated_at
  before update on public.google_connections
  for each row execute function public.set_updated_at();

create index applications_user_cycle_idx
  on public.applications (user_id, cycle, application_number desc);

create index applications_user_sync_idx
  on public.applications (user_id, sheet_sync_status);

alter table public.applications enable row level security;
alter table public.google_connections enable row level security;

revoke all on table public.applications from anon, authenticated;
revoke all on table public.google_connections from anon, authenticated;

grant select, insert, update on table public.applications to authenticated;
grant usage on type public.application_status to authenticated;
grant usage on type public.sheet_sync_status to authenticated;

grant all on table public.applications to service_role;
grant all on table public.google_connections to service_role;

create policy applications_select_own
  on public.applications
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy applications_insert_own
  on public.applications
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy applications_update_own
  on public.applications
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- google_connections intentionally has no authenticated grants or policies:
-- the encrypted refresh token must never be reachable from a browser session,
-- so it is readable only over the app's own connection and by service_role.
