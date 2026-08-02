-- Renamed from 20260802120000, which collided with the applications migration
-- and so was never recorded or applied. Databases carrying the old version row
-- already have these columns, from the collision or from a hand repair, so
-- every statement below tolerates a database that already looks like the
-- result.
alter table public.tasks
  add column if not exists icon_key text not null default 'check',
  add column if not exists color_key text not null default 'olive';

alter table public.tasks
  drop constraint if exists tasks_icon_key_check,
  drop constraint if exists tasks_color_key_check;

alter table public.tasks
  add constraint tasks_icon_key_check
    check (icon_key in (
      'check',
      'briefcase',
      'book',
      'dumbbell',
      'heart',
      'leaf',
      'utensils',
      'sparkles'
    )),
  add constraint tasks_color_key_check
    check (color_key in ('olive', 'sage', 'apricot', 'rose', 'sky', 'ink'));
