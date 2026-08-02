import { sql } from "drizzle-orm";
import {
  check,
  date,
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

export const applicationStatus = pgEnum("application_status", [
  "applied",
  "oa_received",
  "oa_completed",
  "interview",
  "offer",
  "accepted",
  "rejected",
  "ghosted",
]);

export const sheetSyncStatus = pgEnum("sheet_sync_status", [
  "pending",
  "synced",
  "failed",
]);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    cycle: text("cycle").default("S27").notNull(),
    applicationNumber: integer("application_number").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    status: applicationStatus("status").default("applied").notNull(),
    notes: text("notes"),
    appliedOn: date("applied_on", { mode: "string" }).notNull(),
    sheetSyncStatus: sheetSyncStatus("sheet_sync_status")
      .default("pending")
      .notNull(),
    sheetSyncedAt: timestamp("sheet_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
    sheetSyncError: text("sheet_sync_error"),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("applications_id_user_id_key").on(table.id, table.userId),
    // Mirrors the spreadsheet's "#" column: one sequence per recruiting cycle.
    unique("applications_user_cycle_number_key").on(
      table.userId,
      table.cycle,
      table.applicationNumber,
    ),
    foreignKey({
      name: "applications_user_id_profiles_id_fk",
      columns: [table.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    check(
      "applications_cycle_length_check",
      sql`length(trim(${table.cycle})) between 1 and 100`,
    ),
    check(
      "applications_number_positive_check",
      sql`${table.applicationNumber} > 0`,
    ),
    check(
      "applications_company_length_check",
      sql`length(trim(${table.company})) between 1 and 200`,
    ),
    check(
      "applications_title_length_check",
      sql`length(trim(${table.title})) between 1 and 200`,
    ),
    check(
      "applications_notes_length_check",
      sql`${table.notes} is null or length(${table.notes}) <= 5000`,
    ),
    check("applications_version_positive_check", sql`${table.version} > 0`),
    index("applications_user_cycle_idx").on(
      table.userId,
      table.cycle,
      table.applicationNumber.desc(),
    ),
    index("applications_user_sync_idx").on(table.userId, table.sheetSyncStatus),
  ],
);

/**
 * Holds the encrypted Google refresh token. No `authenticated` grants or RLS
 * policies exist for this table; it is reachable only over the app connection.
 */
export const googleConnections = pgTable(
  "google_connections",
  {
    userId: uuid("user_id").primaryKey(),
    googleEmail: text("google_email"),
    refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
    scope: text("scope").notNull(),
    spreadsheetId: text("spreadsheet_id"),
    lastImportedAt: timestamp("last_imported_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "google_connections_user_id_profiles_id_fk",
      columns: [table.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
  ],
);

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type GoogleConnection = typeof googleConnections.$inferSelect;
export type NewGoogleConnection = typeof googleConnections.$inferInsert;
