create or replace function public.increment_course_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version = old.version + 1;
  return new;
end;
$$;

revoke all on function public.increment_course_version() from public;

-- Check constraints cannot contain subqueries, so per-element rules for a day
-- list live in an immutable helper, as metric keywords do.
create or replace function public.course_days_valid(
  days integer[],
  lowest integer,
  highest integer,
  min_len integer,
  max_len integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    coalesce(array_length(days, 1), 0) between min_len and max_len
    and array_position(days, null) is null
    and (
      select coalesce(bool_and(day between lowest and highest), true)
      from unnest(days) as day
    )
    and (
      select count(distinct day) = count(*)
      from unnest(days) as day
    ),
    false
  );
$$;

revoke all on function public.course_days_valid(integer[], integer, integer, integer, integer) from public;
grant execute on function public.course_days_valid(integer[], integer, integer, integer, integer) to authenticated;
grant execute on function public.course_days_valid(integer[], integer, integer, integer, integer) to service_role;

create table public.courses (
  id uuid primary key default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  term text not null,
  starts_on date not null,
  ends_on date not null,
  color_key text not null default 'sky',
  notes text,
  version integer not null default 1,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint courses_id_user_id_key unique (id, user_id),
  constraint courses_user_id_profiles_id_fk foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint courses_name_length_check check (length(btrim(name)) between 1 and 120),
  constraint courses_term_length_check check (length(btrim(term)) between 1 and 60),
  constraint courses_notes_length_check check (notes is null or length(notes) <= 20000),
  constraint courses_color_key_check check (color_key in ('olive', 'sage', 'apricot', 'rose', 'sky', 'ink')),
  -- A term bounds how far ahead recurring work is written into the planner.
  constraint courses_term_range_check check (ends_on >= starts_on and ends_on - starts_on <= 400),
  constraint courses_version_positive_check check (version > 0)
);

create table public.course_exams (
  id uuid primary key default gen_random_uuid() not null,
  course_id uuid not null,
  user_id uuid not null,
  title text not null,
  exam_on date not null,
  exam_time time,
  -- Days ahead of the exam that get a planner reminder; empty means day-of only.
  reminder_days integer[] not null default '{7,3,1}',
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint course_exams_id_user_id_key unique (id, user_id),
  constraint course_exams_course_owner_fk foreign key (course_id, user_id)
    references public.courses (id, user_id) on delete cascade,
  constraint course_exams_title_length_check check (length(btrim(title)) between 1 and 200),
  constraint course_exams_exam_on_check check (exam_on between date '1900-01-01' and date '2400-01-01'),
  constraint course_exams_reminder_days_check check (public.course_days_valid(reminder_days, 1, 60, 0, 10)),
  constraint course_exams_notes_length_check check (notes is null or length(notes) <= 20000)
);

create table public.course_assignments (
  id uuid primary key default gen_random_uuid() not null,
  course_id uuid not null,
  user_id uuid not null,
  title text not null,
  -- 0 is Sunday through 6 is Saturday, as JavaScript counts them.
  weekdays integer[] not null,
  due_time time,
  starts_on date,
  ends_on date,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint course_assignments_id_user_id_key unique (id, user_id),
  constraint course_assignments_course_owner_fk foreign key (course_id, user_id)
    references public.courses (id, user_id) on delete cascade,
  constraint course_assignments_title_length_check check (length(btrim(title)) between 1 and 200),
  constraint course_assignments_weekdays_check check (public.course_days_valid(weekdays, 0, 6, 1, 7)),
  constraint course_assignments_range_check check (
    starts_on is null or ends_on is null or ends_on >= starts_on
  ),
  constraint course_assignments_notes_length_check check (notes is null or length(notes) <= 20000)
);

-- Every planner task written from an exam or a recurring assignment is linked
-- back to its source and the date the rule produced it, so a later edit can
-- find what it wrote and a task is never written twice for one date.
create table public.course_tasks (
  task_id uuid primary key not null,
  user_id uuid not null,
  course_id uuid not null,
  exam_id uuid,
  assignment_id uuid,
  occurs_on date not null,
  created_at timestamp with time zone default now() not null,
  constraint course_tasks_task_owner_fk foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete cascade,
  constraint course_tasks_course_owner_fk foreign key (course_id, user_id)
    references public.courses (id, user_id) on delete cascade,
  constraint course_tasks_exam_owner_fk foreign key (exam_id, user_id)
    references public.course_exams (id, user_id) on delete cascade,
  constraint course_tasks_assignment_owner_fk foreign key (assignment_id, user_id)
    references public.course_assignments (id, user_id) on delete cascade,
  constraint course_tasks_one_source_check check ((exam_id is null) <> (assignment_id is null))
);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

create trigger courses_increment_version
  before update on public.courses
  for each row execute function public.increment_course_version();

create trigger course_exams_set_updated_at
  before update on public.course_exams
  for each row execute function public.set_updated_at();

create trigger course_assignments_set_updated_at
  before update on public.course_assignments
  for each row execute function public.set_updated_at();

create index courses_user_term_idx
  on public.courses (user_id, starts_on desc, name);

create index course_exams_course_idx
  on public.course_exams (user_id, course_id, exam_on);

create index course_assignments_course_idx
  on public.course_assignments (user_id, course_id, created_at);

create unique index course_tasks_exam_occurrence_key
  on public.course_tasks (exam_id, occurs_on)
  where exam_id is not null;

create unique index course_tasks_assignment_occurrence_key
  on public.course_tasks (assignment_id, occurs_on)
  where assignment_id is not null;

create index course_tasks_course_idx
  on public.course_tasks (user_id, course_id);

alter table public.courses enable row level security;
alter table public.course_exams enable row level security;
alter table public.course_assignments enable row level security;
alter table public.course_tasks enable row level security;

revoke all on table public.courses from anon, authenticated;
revoke all on table public.course_exams from anon, authenticated;
revoke all on table public.course_assignments from anon, authenticated;
revoke all on table public.course_tasks from anon, authenticated;
grant select, insert, update, delete on table public.courses to authenticated;
grant select, insert, update, delete on table public.course_exams to authenticated;
grant select, insert, update, delete on table public.course_assignments to authenticated;
grant select on table public.course_tasks to authenticated;
grant all on table public.courses to service_role;
grant all on table public.course_exams to service_role;
grant all on table public.course_assignments to service_role;
grant all on table public.course_tasks to service_role;

create policy courses_select_own
  on public.courses for select to authenticated
  using ((select auth.uid()) = user_id);

create policy courses_insert_own
  on public.courses for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy courses_update_own
  on public.courses for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy courses_delete_own
  on public.courses for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy course_exams_select_own
  on public.course_exams for select to authenticated
  using ((select auth.uid()) = user_id);

create policy course_exams_insert_own
  on public.course_exams for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy course_exams_update_own
  on public.course_exams for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy course_exams_delete_own
  on public.course_exams for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy course_assignments_select_own
  on public.course_assignments for select to authenticated
  using ((select auth.uid()) = user_id);

create policy course_assignments_insert_own
  on public.course_assignments for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy course_assignments_update_own
  on public.course_assignments for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy course_assignments_delete_own
  on public.course_assignments for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy course_tasks_select_own
  on public.course_tasks for select to authenticated
  using ((select auth.uid()) = user_id);
