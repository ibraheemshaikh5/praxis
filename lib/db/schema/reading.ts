import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { profiles } from "./planner";

const timestamps = {
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
};

export const readingItemKind = pgEnum("reading_item_kind", ["book", "article"]);

export const readingItems = pgTable(
  "reading_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    kind: readingItemKind("kind").notNull(),
    title: text("title").notNull(),
    author: text("author"),
    /** Publication for an article, publisher or edition note for a book. */
    source: text("source"),
    url: text("url"),
    pdfUrl: text("pdf_url"),
    imageUrl: text("image_url"),
    /**
     * Editions of one book carry different covers; the owner picks which one
     * matches the copy they hold, so the alternatives stay on the row.
     */
    coverOptions: text("cover_options").array().notNull().default([]),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("reading_items_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "reading_items_user_id_profiles_id_fk",
      columns: [table.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    check(
      "reading_items_title_length_check",
      sql`length(trim(${table.title})) between 1 and 300`,
    ),
    check(
      "reading_items_author_length_check",
      sql`${table.author} is null or length(trim(${table.author})) between 1 and 200`,
    ),
    check(
      "reading_items_source_length_check",
      sql`${table.source} is null or length(trim(${table.source})) between 1 and 200`,
    ),
    check(
      "reading_items_url_check",
      sql`${table.url} is null or ((${table.url} like 'http://%' or ${table.url} like 'https://%') and length(${table.url}) <= 2000)`,
    ),
    check(
      "reading_items_pdf_url_check",
      sql`${table.pdfUrl} is null or ((${table.pdfUrl} like 'http://%' or ${table.pdfUrl} like 'https://%') and length(${table.pdfUrl}) <= 2000)`,
    ),
    check(
      "reading_items_image_url_check",
      sql`${table.imageUrl} is null or ((${table.imageUrl} like 'http://%' or ${table.imageUrl} like 'https://%') and length(${table.imageUrl}) <= 2000)`,
    ),
    // An article is the link; without it there is nothing to reopen.
    check(
      "reading_items_article_url_check",
      sql`${table.kind} <> 'article' or ${table.url} is not null`,
    ),
    check(
      "reading_items_cover_options_check",
      sql`public.reading_covers_valid(${table.coverOptions})`,
    ),
    check("reading_items_version_positive_check", sql`${table.version} > 0`),
    index("reading_items_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    // Re-pasting a link is a lookup, not a second copy.
    uniqueIndex("reading_items_user_url_key")
      .on(table.userId, table.url)
      .where(sql`${table.url} is not null`),
  ],
);

export type ReadingItem = typeof readingItems.$inferSelect;
export type NewReadingItem = typeof readingItems.$inferInsert;
