-- The reading list became the knowledge section. Renames keep the rows, the
-- grants, and the policies; only the names move.

alter type public.reading_item_kind rename to knowledge_item_kind;

alter function public.reading_covers_valid(text[])
  rename to knowledge_covers_valid;

alter function public.increment_reading_item_version()
  rename to increment_knowledge_item_version;

alter table public.reading_items rename to knowledge_items;

alter table public.knowledge_items
  rename constraint reading_items_id_user_id_key to knowledge_items_id_user_id_key;
alter table public.knowledge_items
  rename constraint reading_items_user_id_profiles_id_fk to knowledge_items_user_id_profiles_id_fk;
alter table public.knowledge_items
  rename constraint reading_items_title_length_check to knowledge_items_title_length_check;
alter table public.knowledge_items
  rename constraint reading_items_author_length_check to knowledge_items_author_length_check;
alter table public.knowledge_items
  rename constraint reading_items_source_length_check to knowledge_items_source_length_check;
alter table public.knowledge_items
  rename constraint reading_items_url_check to knowledge_items_url_check;
alter table public.knowledge_items
  rename constraint reading_items_pdf_url_check to knowledge_items_pdf_url_check;
alter table public.knowledge_items
  rename constraint reading_items_image_url_check to knowledge_items_image_url_check;
alter table public.knowledge_items
  rename constraint reading_items_article_url_check to knowledge_items_article_url_check;
alter table public.knowledge_items
  rename constraint reading_items_cover_options_check to knowledge_items_cover_options_check;
alter table public.knowledge_items
  rename constraint reading_items_version_positive_check to knowledge_items_version_positive_check;

alter index public.reading_items_user_created_idx
  rename to knowledge_items_user_created_idx;
alter index public.reading_items_user_url_key
  rename to knowledge_items_user_url_key;

alter trigger reading_items_set_updated_at on public.knowledge_items
  rename to knowledge_items_set_updated_at;
alter trigger reading_items_increment_version on public.knowledge_items
  rename to knowledge_items_increment_version;

alter policy reading_items_select_own on public.knowledge_items
  rename to knowledge_items_select_own;
alter policy reading_items_insert_own on public.knowledge_items
  rename to knowledge_items_insert_own;
alter policy reading_items_update_own on public.knowledge_items
  rename to knowledge_items_update_own;
alter policy reading_items_delete_own on public.knowledge_items
  rename to knowledge_items_delete_own;
