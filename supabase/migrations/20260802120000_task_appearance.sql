alter table public.tasks
  add column icon_key text not null default 'check',
  add column color_key text not null default 'olive';

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
