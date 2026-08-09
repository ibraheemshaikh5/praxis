create table public.whiteboards (
  id uuid primary key default gen_random_uuid() not null,
  user_id uuid not null,
  page_key text not null,
  title text not null,
  document jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint whiteboards_user_id_profiles_id_fk foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint whiteboards_page_key_check
    check (length(page_key) between 1 and 500 and page_key like '/%'),
  constraint whiteboards_title_length_check
    check (length(btrim(title)) between 1 and 200),
  constraint whiteboards_document_object_check
    check (jsonb_typeof(document) = 'object'),
  constraint whiteboards_document_size_check
    check (octet_length(document::text) <= 4194304)
);

create index whiteboards_user_page_updated_idx
  on public.whiteboards (user_id, page_key, updated_at desc);

create trigger whiteboards_set_updated_at
  before update on public.whiteboards
  for each row execute function public.set_updated_at();

alter table public.whiteboards enable row level security;

revoke all on table public.whiteboards from anon, authenticated;
grant select, insert, update, delete on table public.whiteboards to authenticated;
grant all on table public.whiteboards to service_role;

create policy whiteboards_select_own
  on public.whiteboards
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy whiteboards_insert_own
  on public.whiteboards
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy whiteboards_update_own
  on public.whiteboards
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy whiteboards_delete_own
  on public.whiteboards
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
