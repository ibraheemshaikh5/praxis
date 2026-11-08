import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { profiles } from "./planner";

export const smsDirection = pgEnum("sms_direction", ["inbound", "outbound"]);

export const smsMessages = pgTable(
  "sms_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    direction: smsDirection("direction").notNull(),
    providerSid: text("provider_sid"),
    body: text("body").notNull(),
    toolLog: text("tool_log"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "sms_messages_user_id_profiles_id_fk",
      columns: [table.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    unique("sms_messages_provider_sid_key").on(table.providerSid),
    check(
      "sms_messages_provider_sid_length_check",
      sql`${table.providerSid} is null or length(${table.providerSid}) between 1 and 64`,
    ),
    check("sms_messages_body_length_check", sql`length(${table.body}) <= 1600`),
    check(
      "sms_messages_tool_log_length_check",
      sql`${table.toolLog} is null or length(${table.toolLog}) <= 8000`,
    ),
    index("sms_messages_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
  ],
);

export type SmsMessage = typeof smsMessages.$inferSelect;
