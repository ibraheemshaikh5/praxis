create table public.page_notes (
  id uuid primary key default gen_random_uuid() not null,
  user_id uuid not null,
  page_key text not null,
  content text default '' not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint page_notes_user_page_key unique (user_id, page_key),
  constraint page_notes_user_id_profiles_id_fk foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint page_notes_page_key_check
    check (length(page_key) between 1 and 500 and page_key like '/%'),
  constraint page_notes_content_length_check check (length(content) <= 50000)
);

create index page_notes_user_updated_idx
  on public.page_notes (user_id, updated_at);

create trigger page_notes_set_updated_at
  before update on public.page_notes
  for each row execute function public.set_updated_at();

alter table public.page_notes enable row level security;

revoke all on table public.page_notes from anon, authenticated;
grant select, insert, update on table public.page_notes to authenticated;
grant all on table public.page_notes to service_role;

create policy page_notes_select_own
  on public.page_notes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy page_notes_insert_own
  on public.page_notes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy page_notes_update_own
  on public.page_notes
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
