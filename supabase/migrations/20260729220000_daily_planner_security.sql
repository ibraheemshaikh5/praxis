alter table public.profiles
  add constraint profiles_id_auth_users_fk
  foreign key (id)
  references auth.users (id)
  on delete cascade;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public;

create trigger create_profile_after_user_insert
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create trigger planner_entries_set_updated_at
  before update on public.planner_entries
  for each row execute function public.set_updated_at();

create trigger task_attachments_set_updated_at
  before update on public.task_attachments
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.planner_entries enable row level security;
alter table public.task_attachments enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.planner_entries from anon, authenticated;
revoke all on table public.task_attachments from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.tasks to authenticated;
grant select, insert, update on table public.planner_entries to authenticated;
grant select, insert, update on table public.task_attachments to authenticated;
grant usage on type public.attachment_upload_status to authenticated;
grant usage on type public.planner_entry_closure_reason to authenticated;

grant all on table public.profiles to service_role;
grant all on table public.tasks to service_role;
grant all on table public.planner_entries to service_role;
grant all on table public.task_attachments to service_role;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy tasks_select_own
  on public.tasks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy tasks_insert_own
  on public.tasks
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy tasks_update_own
  on public.tasks
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy planner_entries_select_own
  on public.planner_entries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy planner_entries_insert_own
  on public.planner_entries
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy planner_entries_update_own
  on public.planner_entries
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy task_attachments_select_own
  on public.task_attachments
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy task_attachments_insert_own
  on public.task_attachments
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy task_attachments_update_own
  on public.task_attachments
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'task-attachments',
  'task-attachments',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/pdf',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy task_attachments_objects_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy task_attachments_objects_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy task_attachments_objects_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
