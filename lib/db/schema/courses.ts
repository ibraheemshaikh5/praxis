import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { profiles, tasks } from "./planner";

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

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    term: text("term").notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    colorKey: text("color_key").default("sky").notNull(),
    notes: text("notes"),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("courses_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "courses_user_id_profiles_id_fk",
      columns: [table.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    check(
      "courses_name_length_check",
      sql`length(btrim(${table.name})) between 1 and 120`,
    ),
    check(
      "courses_term_length_check",
      sql`length(btrim(${table.term})) between 1 and 60`,
    ),
    check(
      "courses_notes_length_check",
      sql`${table.notes} is null or length(${table.notes}) <= 20000`,
    ),
    check(
      "courses_color_key_check",
      sql`${table.colorKey} in ('olive', 'sage', 'apricot', 'rose', 'sky', 'ink')`,
    ),
    // A term bounds how far ahead recurring work is written into the planner.
    check(
      "courses_term_range_check",
      sql`${table.endsOn} >= ${table.startsOn} and ${table.endsOn} - ${table.startsOn} <= 400`,
    ),
    check("courses_version_positive_check", sql`${table.version} > 0`),
    index("courses_user_term_idx").on(
      table.userId,
      table.startsOn.desc(),
      table.name,
    ),
  ],
);

export const courseExams = pgTable(
  "course_exams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id").notNull(),
    userId: uuid("user_id").notNull(),
    title: text("title").notNull(),
    examOn: date("exam_on", { mode: "string" }).notNull(),
    examTime: time("exam_time"),
    /** Days ahead of the exam that get a planner reminder; empty is day-of only. */
    reminderDays: integer("reminder_days")
      .array()
      .default(sql`'{7,3,1}'`)
      .notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    unique("course_exams_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "course_exams_course_owner_fk",
      columns: [table.courseId, table.userId],
      foreignColumns: [courses.id, courses.userId],
    }).onDelete("cascade"),
    check(
      "course_exams_title_length_check",
      sql`length(btrim(${table.title})) between 1 and 200`,
    ),
    check(
      "course_exams_exam_on_check",
      sql`${table.examOn} between date '1900-01-01' and date '2400-01-01'`,
    ),
    check(
      "course_exams_reminder_days_check",
      sql`public.course_days_valid(${table.reminderDays}, 1, 60, 0, 10)`,
    ),
    check(
      "course_exams_notes_length_check",
      sql`${table.notes} is null or length(${table.notes}) <= 20000`,
    ),
    index("course_exams_course_idx").on(
      table.userId,
      table.courseId,
      table.examOn,
    ),
  ],
);

export const courseAssignments = pgTable(
  "course_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id").notNull(),
    userId: uuid("user_id").notNull(),
    title: text("title").notNull(),
    /** 0 is Sunday through 6 is Saturday, as JavaScript counts them. */
    weekdays: integer("weekdays").array().notNull(),
    dueTime: time("due_time"),
    startsOn: date("starts_on", { mode: "string" }),
    endsOn: date("ends_on", { mode: "string" }),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    unique("course_assignments_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "course_assignments_course_owner_fk",
      columns: [table.courseId, table.userId],
      foreignColumns: [courses.id, courses.userId],
    }).onDelete("cascade"),
    check(
      "course_assignments_title_length_check",
      sql`length(btrim(${table.title})) between 1 and 200`,
    ),
    check(
      "course_assignments_weekdays_check",
      sql`public.course_days_valid(${table.weekdays}, 0, 6, 1, 7)`,
    ),
    check(
      "course_assignments_range_check",
      sql`${table.startsOn} is null or ${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`,
    ),
    check(
      "course_assignments_notes_length_check",
      sql`${table.notes} is null or length(${table.notes}) <= 20000`,
    ),
    index("course_assignments_course_idx").on(
      table.userId,
      table.courseId,
      table.createdAt,
    ),
  ],
);

/**
 * Every planner task written from an exam or a recurring assignment is linked
 * back to its source and the date the rule produced it, so a later edit can
 * find what it wrote and a task is never written twice for one date.
 */
export const courseTasks = pgTable(
  "course_tasks",
  {
    taskId: uuid("task_id").primaryKey(),
    userId: uuid("user_id").notNull(),
    courseId: uuid("course_id").notNull(),
    examId: uuid("exam_id"),
    assignmentId: uuid("assignment_id"),
    occursOn: date("occurs_on", { mode: "string" }).notNull(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    foreignKey({
      name: "course_tasks_task_owner_fk",
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "course_tasks_course_owner_fk",
      columns: [table.courseId, table.userId],
      foreignColumns: [courses.id, courses.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "course_tasks_exam_owner_fk",
      columns: [table.examId, table.userId],
      foreignColumns: [courseExams.id, courseExams.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "course_tasks_assignment_owner_fk",
      columns: [table.assignmentId, table.userId],
      foreignColumns: [courseAssignments.id, courseAssignments.userId],
    }).onDelete("cascade"),
    check(
      "course_tasks_one_source_check",
      sql`(${table.examId} is null) <> (${table.assignmentId} is null)`,
    ),
    uniqueIndex("course_tasks_exam_occurrence_key")
      .on(table.examId, table.occursOn)
      .where(sql`${table.examId} is not null`),
    uniqueIndex("course_tasks_assignment_occurrence_key")
      .on(table.assignmentId, table.occursOn)
      .where(sql`${table.assignmentId} is not null`),
    index("course_tasks_course_idx").on(table.userId, table.courseId),
  ],
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type CourseExam = typeof courseExams.$inferSelect;
export type NewCourseExam = typeof courseExams.$inferInsert;
export type CourseAssignment = typeof courseAssignments.$inferSelect;
export type NewCourseAssignment = typeof courseAssignments.$inferInsert;
export type CourseTask = typeof courseTasks.$inferSelect;
export type NewCourseTask = typeof courseTasks.$inferInsert;
