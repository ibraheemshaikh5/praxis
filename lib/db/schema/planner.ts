import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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

export const plannerEntryClosureReason = pgEnum(
  "planner_entry_closure_reason",
  ["moved", "unscheduled"],
);

export const attachmentUploadStatus = pgEnum("attachment_upload_status", [
  "pending",
  "ready",
  "failed",
]);

export const metricPeriod = pgEnum("metric_period", ["day", "week", "month"]);

export const metricLinkState = pgEnum("metric_link_state", [
  "included",
  "excluded",
]);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(),
    timeZone: text("time_zone").default("America/New_York").notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "profiles_time_zone_not_blank",
      sql`length(trim(${table.timeZone})) > 0`,
    ),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    title: text("title").notNull(),
    titleNormalized: text("title_normalized").generatedAlwaysAs(
      sql`lower(regexp_replace(title, '[^a-zA-Z0-9 ]', '', 'g'))`,
    ),
    notes: text("notes"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      mode: "date",
    }),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("tasks_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "tasks_user_id_profiles_id_fk",
      columns: [table.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    check(
      "tasks_title_length_check",
      sql`length(trim(${table.title})) between 1 and 500`,
    ),
    check(
      "tasks_notes_length_check",
      sql`${table.notes} is null or length(${table.notes}) <= 50000`,
    ),
    check("tasks_version_positive_check", sql`${table.version} > 0`),
    index("tasks_user_state_idx").on(
      table.userId,
      table.deletedAt,
      table.completedAt,
    ),
    index("tasks_user_created_idx").on(table.userId, table.createdAt),
    index("tasks_title_trgm_idx").using(
      "gin",
      sql`${table.titleNormalized} extensions.gin_trgm_ops`,
    ),
  ],
);

export const plannerEntries = pgTable(
  "planner_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id").notNull(),
    userId: uuid("user_id").notNull(),
    plannerDate: date("planner_date", { mode: "string" }).notNull(),
    position: integer("position").default(1024).notNull(),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }),
    timeZone: text("time_zone").default("America/New_York").notNull(),
    closedAt: timestamp("closed_at", {
      withTimezone: true,
      mode: "date",
    }),
    closureReason: plannerEntryClosureReason("closure_reason"),
    movedFromEntryId: uuid("moved_from_entry_id"),
    ...timestamps,
  },
  (table) => [
    unique("planner_entries_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "planner_entries_task_owner_fk",
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "planner_entries_moved_from_owner_fk",
      columns: [table.movedFromEntryId, table.userId],
      foreignColumns: [table.id, table.userId],
    }).onDelete("restrict"),
    unique("planner_entries_moved_from_entry_key").on(table.movedFromEntryId),
    uniqueIndex("planner_entries_one_active_per_task_idx")
      .on(table.taskId)
      .where(sql`${table.closedAt} is null`),
    index("planner_entries_active_day_order_idx")
      .on(table.userId, table.plannerDate, table.position)
      .where(sql`${table.closedAt} is null`),
    index("planner_entries_day_history_idx").on(
      table.userId,
      table.plannerDate,
      table.createdAt,
    ),
    check(
      "planner_entries_position_positive_check",
      sql`${table.position} > 0`,
    ),
    check(
      "planner_entries_time_zone_not_blank",
      sql`length(trim(${table.timeZone})) > 0`,
    ),
    check(
      "planner_entries_time_range_check",
      sql`
        (${table.startsAt} is null and ${table.endsAt} is null)
        or (
          ${table.startsAt} is not null
          and (${table.endsAt} is null or ${table.endsAt} > ${table.startsAt})
          and timezone(${table.timeZone}, ${table.startsAt})::date = ${table.plannerDate}
          and (
            ${table.endsAt} is null
            or timezone(${table.timeZone}, ${table.endsAt})::date = ${table.plannerDate}
          )
        )
      `,
    ),
    check(
      "planner_entries_closure_check",
      sql`
        (
          ${table.closedAt} is null
          and ${table.closureReason} is null
        )
        or (
          ${table.closedAt} is not null
          and ${table.closureReason} = 'unscheduled'
        )
        or (
          ${table.closedAt} is not null
          and ${table.closureReason} = 'moved'
        )
      `,
    ),
    check(
      "planner_entries_not_own_predecessor_check",
      sql`${table.movedFromEntryId} is null or ${table.movedFromEntryId} <> ${table.id}`,
    ),
  ],
);

export const taskAttachments = pgTable(
  "task_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id").notNull(),
    userId: uuid("user_id").notNull(),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    uploadStatus: attachmentUploadStatus("upload_status")
      .default("pending")
      .notNull(),
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => [
    unique("task_attachments_id_user_id_key").on(table.id, table.userId),
    unique("task_attachments_storage_path_key").on(table.storagePath),
    foreignKey({
      name: "task_attachments_task_owner_fk",
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
    }).onDelete("cascade"),
    check(
      "task_attachments_file_name_length_check",
      sql`length(trim(${table.fileName})) between 1 and 255`,
    ),
    check(
      "task_attachments_byte_size_check",
      sql`${table.byteSize} between 1 and 26214400`,
    ),
    check(
      "task_attachments_storage_path_owner_check",
      sql`${table.storagePath} like ${table.userId}::text || '/%'`,
    ),
    check(
      "task_attachments_mime_type_check",
      sql`${table.mimeType} in (
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'application/pdf',
        'text/plain',
        'text/markdown'
      )`,
    ),
    index("task_attachments_task_idx").on(
      table.userId,
      table.taskId,
      table.deletedAt,
    ),
    index("task_attachments_pending_idx")
      .on(table.createdAt)
      .where(sql`${table.uploadStatus} = 'pending'`),
  ],
);

export const metrics = pgTable(
  "metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    keywords: text("keywords").array().notNull(),
    targetCount: integer("target_count").notNull(),
    period: metricPeriod("period").notNull(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => [
    unique("metrics_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "metrics_user_id_profiles_id_fk",
      columns: [table.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    check(
      "metrics_name_length_check",
      sql`length(trim(${table.name})) between 1 and 120`,
    ),
    check(
      "metrics_target_count_check",
      sql`${table.targetCount} between 1 and 1000`,
    ),
    check(
      "metrics_keywords_check",
      sql`public.metric_keywords_valid(${table.keywords})`,
    ),
    index("metrics_user_active_idx").on(table.userId, table.archivedAt),
  ],
);

export const taskMetricLinks = pgTable(
  "task_metric_links",
  {
    taskId: uuid("task_id").notNull(),
    metricId: uuid("metric_id").notNull(),
    userId: uuid("user_id").notNull(),
    state: metricLinkState("state").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "task_metric_links_pkey",
      columns: [table.taskId, table.metricId],
    }),
    foreignKey({
      name: "task_metric_links_task_owner_fk",
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "task_metric_links_metric_owner_fk",
      columns: [table.metricId, table.userId],
      foreignColumns: [metrics.id, metrics.userId],
    }).onDelete("cascade"),
    index("task_metric_links_user_metric_idx").on(table.userId, table.metricId),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type PlannerEntry = typeof plannerEntries.$inferSelect;
export type NewPlannerEntry = typeof plannerEntries.$inferInsert;
export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type NewTaskAttachment = typeof taskAttachments.$inferInsert;
export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;
export type TaskMetricLink = typeof taskMetricLinks.$inferSelect;
export type NewTaskMetricLink = typeof taskMetricLinks.$inferInsert;
