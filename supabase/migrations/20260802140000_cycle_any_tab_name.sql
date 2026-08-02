-- The cycle names a spreadsheet tab, and the owner's tabs are not all seasons:
-- "F25/W26 Internship" and "YC Automator Batch 1" are as legitimate as "S27".
alter table public.applications
  drop constraint applications_cycle_format_check;

alter table public.applications
  add constraint applications_cycle_length_check
  check (length(trim(cycle)) between 1 and 100);
