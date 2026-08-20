alter type public.knowledge_item_kind add value 'video';

-- Anything that is not a book is its link. Written against 'book' rather than
-- the new value, which cannot be referenced until this transaction commits.
alter table public.knowledge_items
  drop constraint knowledge_items_article_url_check;

alter table public.knowledge_items
  add constraint knowledge_items_link_url_check
  check (kind = 'book' or url is not null);
