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

export const buildNotePriority = pgEnum("build_note_priority", [
  "p0",
  "p1",
  "p2",
  "p3",
]);

export const buildNoteStatus = pgEnum("build_note_status", [
  "open",
  "dispatched",
  "done",
]);

export const buildNoteDispatches = pgTable(
  "build_note_dispatches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    pageKey: text("page_key").notNull(),
    prompt: text("prompt").notNull(),
    sessionId: text("session_id").notNull(),
    sessionUrl: text("session_url").notNull(),
    noteCount: integer("note_count").notNull(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    unique("build_note_dispatches_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "build_note_dispatches_user_id_profiles_id_fk",
      columns: [table.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    check(
      "build_note_dispatches_page_key_check",
      sql`length(${table.pageKey}) between 1 and 500 and ${table.pageKey} like '/%'`,
    ),
    // The routine fire endpoint rejects a payload longer than this.
    check(
      "build_note_dispatches_prompt_length_check",
      sql`length(${table.prompt}) between 1 and 65536`,
    ),
    check(
      "build_note_dispatches_session_id_length_check",
      sql`length(${table.sessionId}) between 1 and 200`,
    ),
    check(
      "build_note_dispatches_session_url_check",
      sql`length(${table.sessionUrl}) between 1 and 2000 and ${table.sessionUrl} like 'https://%'`,
    ),
    check(
      "build_note_dispatches_note_count_check",
      sql`${table.noteCount} > 0`,
    ),
    index("build_note_dispatches_user_page_idx").on(
      table.userId,
      table.pageKey,
      table.createdAt.desc(),
    ),
  ],
);

export const buildNotes = pgTable(
  "build_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    pageKey: text("page_key").notNull(),
    body: text("body").notNull(),
    priority: buildNotePriority("priority").default("p2").notNull(),
    status: buildNoteStatus("status").default("open").notNull(),
    position: integer("position").default(1024).notNull(),
    lastDispatchId: uuid("last_dispatch_id"),
    ...timestamps,
  },
  (table) => [
    unique("build_notes_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "build_notes_user_id_profiles_id_fk",
      columns: [table.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    // The migration declares `on delete set null (last_dispatch_id)`, scoped to
    // that column so the cascade does not try to null the non-nullable user_id.
    // Drizzle cannot express the column list, so the action is omitted here.
    foreignKey({
      name: "build_notes_last_dispatch_owner_fk",
      columns: [table.lastDispatchId, table.userId],
      foreignColumns: [buildNoteDispatches.id, buildNoteDispatches.userId],
    }),
    check(
      "build_notes_page_key_check",
      sql`length(${table.pageKey}) between 1 and 500 and ${table.pageKey} like '/%'`,
    ),
    check(
      "build_notes_body_length_check",
      sql`length(trim(${table.body})) between 1 and 2000`,
    ),
    check("build_notes_position_positive_check", sql`${table.position} > 0`),
    index("build_notes_user_page_order_idx").on(
      table.userId,
      table.pageKey,
      table.priority,
      table.position,
    ),
  ],
);

export type BuildNote = typeof buildNotes.$inferSelect;
export type NewBuildNote = typeof buildNotes.$inferInsert;
export type BuildNoteDispatch = typeof buildNoteDispatches.$inferSelect;
export type NewBuildNoteDispatch = typeof buildNoteDispatches.$inferInsert;
