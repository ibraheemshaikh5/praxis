import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
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

export const whiteboards = pgTable(
  "whiteboards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    pageKey: text("page_key").notNull(),
    title: text("title").notNull(),
    // The document half of a tldraw editor snapshot. tldraw owns this shape
    // and migrates it on load, so Praxis stores it opaquely and only bounds
    // its size.
    document: jsonb("document")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "whiteboards_user_id_profiles_id_fk",
      columns: [table.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    check(
      "whiteboards_page_key_check",
      sql`length(${table.pageKey}) between 1 and 500 and ${table.pageKey} like '/%'`,
    ),
    check(
      "whiteboards_title_length_check",
      sql`length(btrim(${table.title})) between 1 and 200`,
    ),
    check(
      "whiteboards_document_object_check",
      sql`jsonb_typeof(${table.document}) = 'object'`,
    ),
    check(
      "whiteboards_document_size_check",
      sql`octet_length(${table.document}::text) <= 4194304`,
    ),
    index("whiteboards_user_page_updated_idx").on(
      table.userId,
      table.pageKey,
      table.updatedAt.desc(),
    ),
  ],
);

export type Whiteboard = typeof whiteboards.$inferSelect;
export type NewWhiteboard = typeof whiteboards.$inferInsert;
