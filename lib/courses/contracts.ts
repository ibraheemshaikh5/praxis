import { z } from "zod";

import { TASK_COLOR_KEYS } from "@/lib/daily-planner/appearance";

import { DEFAULT_REMINDER_DAYS, MAX_TERM_DAYS } from "./schedule";

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD calendar date")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value)
    );
  }, "Invalid calendar date");

const expectedVersion = z.number().int().positive();

const courseName = z.string().trim().min(1).max(120);
const term = z.string().trim().min(1).max(60);
const colorKey = z.enum(TASK_COLOR_KEYS);
const notes = z.string().max(20_000).nullable();
const title = z.string().trim().min(1).max(200);

/** A wall-clock time in the profile time zone, as a time input writes it. */
const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a time as HH:MM");

/** Days ahead of the exam, highest first, with repeats dropped. */
const reminderDays = z
  .array(z.number().int().min(1).max(60))
  .max(10)
  .transform((days) => [...new Set(days)].sort((a, b) => b - a));

/** 0 is Sunday through 6 is Saturday, in week order with repeats dropped. */
const weekdays = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

export function termRangeIssue(startsOn: string, endsOn: string) {
  const days =
    (Date.parse(`${endsOn}T00:00:00.000Z`) -
      Date.parse(`${startsOn}T00:00:00.000Z`)) /
    86_400_000;

  if (days < 0) return "The term must end on or after the day it starts";
  if (days > MAX_TERM_DAYS) {
    return `A term can span at most ${MAX_TERM_DAYS} days`;
  }
  return null;
}

export const createCourseSchema = z
  .object({
    name: courseName,
    term,
    startsOn: calendarDate,
    endsOn: calendarDate,
    colorKey: colorKey.optional(),
    notes: notes.optional(),
  })
  .superRefine(({ startsOn, endsOn }, context) => {
    const issue = termRangeIssue(startsOn, endsOn);
    if (issue) {
      context.addIssue({ code: "custom", message: issue, path: ["endsOn"] });
    }
  });

const COURSE_FIELDS = [
  "name",
  "term",
  "startsOn",
  "endsOn",
  "colorKey",
  "notes",
] as const;

export const updateCourseSchema = z
  .object({
    name: courseName.optional(),
    term: term.optional(),
    startsOn: calendarDate.optional(),
    endsOn: calendarDate.optional(),
    colorKey: colorKey.optional(),
    notes: notes.optional(),
    expectedVersion,
  })
  .refine(
    (input) => COURSE_FIELDS.some((field) => input[field] !== undefined),
    { message: "Provide at least one field to update" },
  );

export const createExamSchema = z.object({
  title,
  examOn: calendarDate,
  examTime: timeOfDay.nullable().optional(),
  reminderDays: reminderDays.default(DEFAULT_REMINDER_DAYS),
  notes: notes.optional(),
});

export const updateExamSchema = z
  .object({
    title: title.optional(),
    examOn: calendarDate.optional(),
    examTime: timeOfDay.nullable().optional(),
    reminderDays: reminderDays.optional(),
    notes: notes.optional(),
  })
  .refine(
    ({ title, examOn, examTime, reminderDays, notes }) =>
      title !== undefined ||
      examOn !== undefined ||
      examTime !== undefined ||
      reminderDays !== undefined ||
      notes !== undefined,
    { message: "Provide at least one field to update" },
  );

function validateAssignmentRange(
  value: { startsOn?: string | null; endsOn?: string | null },
  context: z.RefinementCtx,
) {
  if (value.startsOn && value.endsOn && value.endsOn < value.startsOn) {
    context.addIssue({
      code: "custom",
      message: "The end date must be on or after the start date",
      path: ["endsOn"],
    });
  }
}

export const createAssignmentSchema = z
  .object({
    title,
    weekdays,
    dueTime: timeOfDay.nullable().optional(),
    startsOn: calendarDate.nullable().optional(),
    endsOn: calendarDate.nullable().optional(),
    notes: notes.optional(),
  })
  .superRefine(validateAssignmentRange);

export const updateAssignmentSchema = z
  .object({
    title: title.optional(),
    weekdays: weekdays.optional(),
    dueTime: timeOfDay.nullable().optional(),
    startsOn: calendarDate.nullable().optional(),
    endsOn: calendarDate.nullable().optional(),
    notes: notes.optional(),
  })
  .refine(
    ({ title, weekdays, dueTime, startsOn, endsOn, notes }) =>
      title !== undefined ||
      weekdays !== undefined ||
      dueTime !== undefined ||
      startsOn !== undefined ||
      endsOn !== undefined ||
      notes !== undefined,
    { message: "Provide at least one field to update" },
  )
  .superRefine(validateAssignmentRange);

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
