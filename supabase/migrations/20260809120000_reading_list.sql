create type public.reading_item_kind as enum ('book', 'article');

-- Check constraints cannot contain subqueries, so per-element cover rules live
-- in an immutable helper instead of an inline expression.
create or replace function public.reading_covers_valid(covers text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    coalesce(array_length(covers, 1), 0) between 0 and 12
    and array_position(covers, null) is null
    and (
      select coalesce(
        bool_and(cover like 'https://%' and length(cover) <= 2000),
        true
      )
      from unnest(covers) as cover
    ),
    false
  );
$$;

revoke all on function public.reading_covers_valid(text[]) from public;
grant execute on function public.reading_covers_valid(text[]) to authenticated;
grant execute on function public.reading_covers_valid(text[]) to service_role;

create or replace function public.increment_reading_item_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version = old.version + 1;
  return new;
end;
$$;

revoke all on function public.increment_reading_item_version() from public;

create table public.reading_items (
  id uuid primary key default gen_random_uuid() not null,
  user_id uuid not null,
  kind public.reading_item_kind not null,
  title text not null,
  author text,
  -- Publication for an article, publisher or edition note for a book.
  source text,
  url text,
  pdf_url text,
  image_url text,
  -- Editions of one book carry different covers; the owner picks which one
  -- matches the copy they hold, so the alternatives stay on the row.
  cover_options text[] not null default '{}',
  version integer not null default 1,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint reading_items_id_user_id_key unique (id, user_id),
  constraint reading_items_user_id_profiles_id_fk foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint reading_items_title_length_check check (length(trim(title)) between 1 and 300),
  constraint reading_items_author_length_check check (author is null or length(trim(author)) between 1 and 200),
  constraint reading_items_source_length_check check (source is null or length(trim(source)) between 1 and 200),
  constraint reading_items_url_check check (
    url is null
    or ((url like 'http://%' or url like 'https://%') and length(url) <= 2000)
  ),
  constraint reading_items_pdf_url_check check (
    pdf_url is null
    or ((pdf_url like 'http://%' or pdf_url like 'https://%') and length(pdf_url) <= 2000)
  ),
  constraint reading_items_image_url_check check (
    image_url is null
    or ((image_url like 'http://%' or image_url like 'https://%') and length(image_url) <= 2000)
  ),
  -- An article is the link; without it there is nothing to reopen.
  constraint reading_items_article_url_check check (kind <> 'article' or url is not null),
  constraint reading_items_cover_options_check check (public.reading_covers_valid(cover_options)),
  constraint reading_items_version_positive_check check (version > 0)
);

create trigger reading_items_set_updated_at
  before update on public.reading_items
  for each row execute function public.set_updated_at();

create trigger reading_items_increment_version
  before update on public.reading_items
  for each row execute function public.increment_reading_item_version();

create index reading_items_user_created_idx
  on public.reading_items (user_id, created_at desc);

-- Re-pasting a link is a lookup, not a second copy.
create unique index reading_items_user_url_key
  on public.reading_items (user_id, url)
  where url is not null;

alter table public.reading_items enable row level security;

revoke all on table public.reading_items from anon, authenticated;
grant select, insert, update, delete on table public.reading_items to authenticated;
grant usage on type public.reading_item_kind to authenticated;
grant all on table public.reading_items to service_role;

create policy reading_items_select_own
  on public.reading_items
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy reading_items_insert_own
  on public.reading_items
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy reading_items_update_own
  on public.reading_items
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy reading_items_delete_own
  on public.reading_items
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
