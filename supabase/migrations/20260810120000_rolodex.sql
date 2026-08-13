create or replace function public.increment_connection_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version = old.version + 1;
  return new;
end;
$$;

revoke all on function public.increment_connection_version() from public;

create table public.connections (
  id uuid primary key default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  -- The one line the profile leads with; company and role are the parsed form
  -- of the same thing when a provider could separate them.
  headline text,
  company text,
  "role" text,
  location text,
  linkedin_url text,
  email text,
  phone text,
  x_url text,
  avatar_url text,
  -- What stays true about the person, as opposed to a single meeting.
  notes text,
  version integer not null default 1,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint connections_id_user_id_key unique (id, user_id),
  constraint connections_user_id_profiles_id_fk foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint connections_name_length_check check (length(btrim(name)) between 1 and 200),
  constraint connections_headline_length_check check (headline is null or length(btrim(headline)) between 1 and 300),
  constraint connections_company_length_check check (company is null or length(btrim(company)) between 1 and 200),
  constraint connections_role_length_check check ("role" is null or length(btrim("role")) between 1 and 200),
  constraint connections_location_length_check check (location is null or length(btrim(location)) between 1 and 200),
  constraint connections_linkedin_url_check check (
    linkedin_url is null
    or (linkedin_url like 'https://www.linkedin.com/in/%' and length(linkedin_url) <= 500)
  ),
  constraint connections_email_check check (
    email is null
    or (length(btrim(email)) between 3 and 320 and email like '%_@_%')
  ),
  -- Phone numbers are written however the owner wrote them down; the only
  -- thing worth enforcing is that there is something there.
  constraint connections_phone_check check (phone is null or length(btrim(phone)) between 1 and 50),
  constraint connections_x_url_check check (
    x_url is null
    or (x_url like 'https://x.com/%' and length(x_url) <= 300)
  ),
  constraint connections_avatar_url_check check (
    avatar_url is null
    or ((avatar_url like 'http://%' or avatar_url like 'https://%') and length(avatar_url) <= 2000)
  ),
  constraint connections_notes_length_check check (notes is null or length(notes) <= 50000),
  constraint connections_version_positive_check check (version > 0)
);

create table public.connection_meetings (
  id uuid primary key default gen_random_uuid() not null,
  connection_id uuid not null,
  user_id uuid not null,
  met_on date not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint connection_meetings_id_user_id_key unique (id, user_id),
  -- The composite reference keeps a meeting and its person under one owner.
  constraint connection_meetings_connection_owner_fk foreign key (connection_id, user_id)
    references public.connections (id, user_id) on delete cascade,
  constraint connection_meetings_met_on_check check (met_on between date '1900-01-01' and date '2400-01-01'),
  constraint connection_meetings_notes_length_check check (notes is null or length(notes) <= 20000)
);

create trigger connections_set_updated_at
  before update on public.connections
  for each row execute function public.set_updated_at();

create trigger connections_increment_version
  before update on public.connections
  for each row execute function public.increment_connection_version();

create trigger connection_meetings_set_updated_at
  before update on public.connection_meetings
  for each row execute function public.set_updated_at();

create index connections_user_created_idx
  on public.connections (user_id, created_at desc);

-- Pasting a profile again is a lookup, not a second card for the same person.
create unique index connections_user_linkedin_url_key
  on public.connections (user_id, linkedin_url)
  where linkedin_url is not null;

create index connection_meetings_connection_met_idx
  on public.connection_meetings (user_id, connection_id, met_on desc);

alter table public.connections enable row level security;
alter table public.connection_meetings enable row level security;

revoke all on table public.connections from anon, authenticated;
revoke all on table public.connection_meetings from anon, authenticated;
grant select, insert, update, delete on table public.connections to authenticated;
grant select, insert, update, delete on table public.connection_meetings to authenticated;
grant all on table public.connections to service_role;
grant all on table public.connection_meetings to service_role;

create policy connections_select_own
  on public.connections
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy connections_insert_own
  on public.connections
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy connections_update_own
  on public.connections
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy connections_delete_own
  on public.connections
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy connection_meetings_select_own
  on public.connection_meetings
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy connection_meetings_insert_own
  on public.connection_meetings
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy connection_meetings_update_own
  on public.connection_meetings
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy connection_meetings_delete_own
  on public.connection_meetings
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
