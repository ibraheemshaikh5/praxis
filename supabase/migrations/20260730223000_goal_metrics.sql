create extension if not exists pg_trgm with schema extensions;

create type public.metric_period as enum ('day', 'week', 'month');
create type public.metric_link_state as enum ('included', 'excluded');

-- Check constraints cannot contain subqueries, so per-element keyword rules
-- live in an immutable helper instead of an inline expression.
create or replace function public.metric_keywords_valid(keywords text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    coalesce(array_length(keywords, 1), 0) between 1 and 20
    and array_position(keywords, null) is null
    and (
      select coalesce(bool_and(length(btrim(keyword)) between 1 and 60), false)
      from unnest(keywords) as keyword
    ),
    false
  );
$$;

revoke all on function public.metric_keywords_valid(text[]) from public;
grant execute on function public.metric_keywords_valid(text[]) to authenticated;
grant execute on function public.metric_keywords_valid(text[]) to service_role;

create table public.metrics (
  id uuid primary key default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  keywords text[] not null,
  target_count integer not null,
  period public.metric_period not null,
  archived_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint metrics_id_user_id_key unique (id, user_id),
  constraint metrics_user_id_profiles_id_fk foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint metrics_name_length_check check (length(trim(name)) between 1 and 120),
  constraint metrics_target_count_check check (target_count between 1 and 1000),
  constraint metrics_keywords_check check (public.metric_keywords_valid(keywords))
);

create table public.task_metric_links (
  task_id uuid not null,
  metric_id uuid not null,
  user_id uuid not null,
  state public.metric_link_state not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint task_metric_links_pkey primary key (task_id, metric_id),
  constraint task_metric_links_task_owner_fk foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete cascade,
  constraint task_metric_links_metric_owner_fk foreign key (metric_id, user_id)
    references public.metrics (id, user_id) on delete cascade
);

create trigger metrics_set_updated_at
  before update on public.metrics
  for each row execute function public.set_updated_at();

create trigger task_metric_links_set_updated_at
  before update on public.task_metric_links
  for each row execute function public.set_updated_at();

create index metrics_user_active_idx on public.metrics (user_id, archived_at);
create index task_metric_links_user_metric_idx
  on public.task_metric_links (user_id, metric_id);

alter table public.tasks
  add column title_normalized text
  generated always as (lower(regexp_replace(title, '[^a-zA-Z0-9 ]', '', 'g'))) stored;

create index tasks_title_trgm_idx
  on public.tasks using gin (title_normalized extensions.gin_trgm_ops);

alter table public.metrics enable row level security;
alter table public.task_metric_links enable row level security;

revoke all on table public.metrics from anon, authenticated;
revoke all on table public.task_metric_links from anon, authenticated;

-- Clearing a link override is a real row delete, but tasks and planner_entries
-- expose no delete grant either; the API performs it over the app connection.
grant select, insert, update on table public.metrics to authenticated;
grant select, insert, update on table public.task_metric_links to authenticated;
grant usage on type public.metric_period to authenticated;
grant usage on type public.metric_link_state to authenticated;

grant all on table public.metrics to service_role;
grant all on table public.task_metric_links to service_role;

create policy metrics_select_own
  on public.metrics
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy metrics_insert_own
  on public.metrics
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy metrics_update_own
  on public.metrics
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy task_metric_links_select_own
  on public.task_metric_links
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy task_metric_links_insert_own
  on public.task_metric_links
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy task_metric_links_update_own
  on public.task_metric_links
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
