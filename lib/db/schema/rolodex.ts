import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
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

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    /**
     * The one line the profile leads with; company and role are the parsed
     * form of the same thing when a provider could separate them.
     */
    headline: text("headline"),
    company: text("company"),
    role: text("role"),
    location: text("location"),
    linkedinUrl: text("linkedin_url"),
    email: text("email"),
    phone: text("phone"),
    xUrl: text("x_url"),
    avatarUrl: text("avatar_url"),
    /** What stays true about the person, as opposed to a single meeting. */
    notes: text("notes"),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("connections_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "connections_user_id_profiles_id_fk",
      columns: [table.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    check(
      "connections_name_length_check",
      sql`length(btrim(${table.name})) between 1 and 200`,
    ),
    check(
      "connections_headline_length_check",
      sql`${table.headline} is null or length(btrim(${table.headline})) between 1 and 300`,
    ),
    check(
      "connections_company_length_check",
      sql`${table.company} is null or length(btrim(${table.company})) between 1 and 200`,
    ),
    check(
      "connections_role_length_check",
      sql`${table.role} is null or length(btrim(${table.role})) between 1 and 200`,
    ),
    check(
      "connections_location_length_check",
      sql`${table.location} is null or length(btrim(${table.location})) between 1 and 200`,
    ),
    check(
      "connections_linkedin_url_check",
      sql`${table.linkedinUrl} is null or (${table.linkedinUrl} like 'https://www.linkedin.com/in/%' and length(${table.linkedinUrl}) <= 500)`,
    ),
    check(
      "connections_email_check",
      sql`${table.email} is null or (length(btrim(${table.email})) between 3 and 320 and ${table.email} like '%_@_%')`,
    ),
    // Phone numbers are written however the owner wrote them down; the only
    // thing worth enforcing is that there is something there.
    check(
      "connections_phone_check",
      sql`${table.phone} is null or length(btrim(${table.phone})) between 1 and 50`,
    ),
    check(
      "connections_x_url_check",
      sql`${table.xUrl} is null or (${table.xUrl} like 'https://x.com/%' and length(${table.xUrl}) <= 300)`,
    ),
    check(
      "connections_avatar_url_check",
      sql`${table.avatarUrl} is null or ((${table.avatarUrl} like 'http://%' or ${table.avatarUrl} like 'https://%') and length(${table.avatarUrl}) <= 2000)`,
    ),
    check(
      "connections_notes_length_check",
      sql`${table.notes} is null or length(${table.notes}) <= 50000`,
    ),
    check("connections_version_positive_check", sql`${table.version} > 0`),
    index("connections_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    // Pasting a profile again is a lookup, not a second card for the same
    // person.
    uniqueIndex("connections_user_linkedin_url_key")
      .on(table.userId, table.linkedinUrl)
      .where(sql`${table.linkedinUrl} is not null`),
  ],
);

export const connectionMeetings = pgTable(
  "connection_meetings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id").notNull(),
    userId: uuid("user_id").notNull(),
    metOn: date("met_on", { mode: "string" }).notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    unique("connection_meetings_id_user_id_key").on(table.id, table.userId),
    // The composite reference keeps a meeting and its person under one owner.
    foreignKey({
      name: "connection_meetings_connection_owner_fk",
      columns: [table.connectionId, table.userId],
      foreignColumns: [connections.id, connections.userId],
    }).onDelete("cascade"),
    check(
      "connection_meetings_met_on_check",
      sql`${table.metOn} between date '1900-01-01' and date '2400-01-01'`,
    ),
    check(
      "connection_meetings_notes_length_check",
      sql`${table.notes} is null or length(${table.notes}) <= 20000`,
    ),
    index("connection_meetings_connection_met_idx").on(
      table.userId,
      table.connectionId,
      table.metOn.desc(),
    ),
  ],
);

export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
export type ConnectionMeeting = typeof connectionMeetings.$inferSelect;
export type NewConnectionMeeting = typeof connectionMeetings.$inferInsert;
