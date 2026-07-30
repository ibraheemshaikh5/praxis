create or replace function public.increment_task_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version = old.version + 1;
  return new;
end;
$$;

revoke all on function public.increment_task_version() from public;

create trigger tasks_increment_version
  before update on public.tasks
  for each row execute function public.increment_task_version();
