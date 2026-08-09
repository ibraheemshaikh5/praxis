create type public.build_note_priority as enum ('p0', 'p1', 'p2', 'p3');

create type public.build_note_status as enum ('open', 'dispatched', 'done');

create table public.build_note_dispatches (
  id uuid primary key default gen_random_uuid() not null,
  user_id uuid not null,
  page_key text not null,
  prompt text not null,
  session_id text not null,
  session_url text not null,
  note_count integer not null,
  created_at timestamp with time zone default now() not null,
  constraint build_note_dispatches_user_id_profiles_id_fk foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint build_note_dispatches_id_user_id_key unique (id, user_id),
  constraint build_note_dispatches_page_key_check
    check (length(page_key) between 1 and 500 and page_key like '/%'),
  -- The routine fire endpoint rejects a payload longer than this.
  constraint build_note_dispatches_prompt_length_check
    check (length(prompt) between 1 and 65536),
  constraint build_note_dispatches_session_id_length_check
    check (length(session_id) between 1 and 200),
  constraint build_note_dispatches_session_url_check
    check (length(session_url) between 1 and 2000 and session_url like 'https://%'),
  constraint build_note_dispatches_note_count_check check (note_count > 0)
);

create index build_note_dispatches_user_page_idx
  on public.build_note_dispatches (user_id, page_key, created_at desc);

create table public.build_notes (
  id uuid primary key default gen_random_uuid() not null,
  user_id uuid not null,
  page_key text not null,
  body text not null,
  priority public.build_note_priority default 'p2' not null,
  status public.build_note_status default 'open' not null,
  position integer default 1024 not null,
  last_dispatch_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint build_notes_id_user_id_key unique (id, user_id),
  constraint build_notes_user_id_profiles_id_fk foreign key (user_id)
    references public.profiles (id) on delete cascade,
  -- The column list is required: a bare `set null` would also null user_id,
  -- which is not nullable, so removing a dispatch would fail.
  constraint build_notes_last_dispatch_owner_fk
    foreign key (last_dispatch_id, user_id)
    references public.build_note_dispatches (id, user_id)
    on delete set null (last_dispatch_id),
  constraint build_notes_page_key_check
    check (length(page_key) between 1 and 500 and page_key like '/%'),
  constraint build_notes_body_length_check
    check (length(trim(body)) between 1 and 2000),
  constraint build_notes_position_positive_check check (position > 0)
);

create index build_notes_user_page_order_idx
  on public.build_notes (user_id, page_key, priority, position);

create trigger build_notes_set_updated_at
  before update on public.build_notes
  for each row execute function public.set_updated_at();

-- Carry the free-form page notes over as P2 items, one per non-blank line,
-- with list markers stripped. page_notes is left in place so the original text
-- stays recoverable until it is dropped in a follow-up migration.
insert into public.build_notes (user_id, page_key, body, priority, position)
select
  source.user_id,
  source.page_key,
  source.body,
  'p2'::public.build_note_priority,
  1024 * source.ordinality
from (
  select
    note.user_id,
    note.page_key,
    left(trim(regexp_replace(line.value, '^\s*[-*+]\s+', '')), 2000) as body,
    line.ordinality
  from public.page_notes note
  cross join lateral unnest(string_to_array(note.content, E'\n'))
    with ordinality as line (value, ordinality)
) source
where length(trim(source.body)) > 0;

alter table public.build_note_dispatches enable row level security;
alter table public.build_notes enable row level security;

revoke all on table public.build_note_dispatches from anon, authenticated;
revoke all on table public.build_notes from anon, authenticated;

-- Dispatches are an append-only record of what was sent to the agent.
grant select, insert on table public.build_note_dispatches to authenticated;
grant all on table public.build_note_dispatches to service_role;

grant select, insert, update, delete on table public.build_notes to authenticated;
grant all on table public.build_notes to service_role;

create policy build_note_dispatches_select_own
  on public.build_note_dispatches
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy build_note_dispatches_insert_own
  on public.build_note_dispatches
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy build_notes_select_own
  on public.build_notes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy build_notes_insert_own
  on public.build_notes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy build_notes_update_own
  on public.build_notes
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy build_notes_delete_own
  on public.build_notes
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
