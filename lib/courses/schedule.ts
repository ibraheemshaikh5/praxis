/**
 * Turns an exam or a recurring assignment into the planner tasks it stands
 * for. Everything here is a pure function of calendar strings, so the service
 * can diff its output against what it wrote last time.
 */

import {
  addPlannerDaysToKey,
  differenceInPlannerDays,
  parsePlannerDate,
} from "@/lib/planner/dates";
import { zonedDateTimeToIso } from "@/lib/planner/timeline";

/** Reminders land a week, three days, and a day ahead unless told otherwise. */
export const DEFAULT_REMINDER_DAYS = [7, 3, 1];

/** The longest term a course may declare, and so the furthest a rule reaches. */
export const MAX_TERM_DAYS = 400;

export type Occurrence = {
  occursOn: string;
  title: string;
  notes: string | null;
  startsAt: string | null;
};

export type CourseForSchedule = {
  name: string;
  startsOn: string;
  endsOn: string;
};

export type ExamForSchedule = {
  title: string;
  examOn: string;
  examTime: string | null;
  reminderDays: number[];
  notes: string | null;
};

export type AssignmentForSchedule = {
  title: string;
  weekdays: number[];
  dueTime: string | null;
  startsOn: string | null;
  endsOn: string | null;
  notes: string | null;
};

/** Generated tasks lead with the class so the planner reads at a glance. */
export function courseTaskTitle(courseName: string, label: string) {
  return `${courseName} · ${label}`;
}

export function reminderLabel(examTitle: string, daysAhead: number) {
  if (daysAhead === 1) return `${examTitle} tomorrow`;
  return `${examTitle} in ${daysAhead} days`;
}

/** Postgres returns `time` as HH:MM:SS; inputs and the API speak HH:MM. */
export function timeOfDayToMinutes(value: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * The reminder tasks ahead of an exam plus the exam itself. Dates already
 * behind `today` are left out: a reminder for a day that has passed is noise,
 * and the service leaves history alone.
 */
export function examOccurrences(
  course: Pick<CourseForSchedule, "name">,
  exam: ExamForSchedule,
  today: string,
  timeZone: string,
): Occurrence[] {
  const occurrences: Occurrence[] = [];
  const days = [...new Set(exam.reminderDays)]
    .filter((day) => day > 0)
    .sort((a, b) => b - a);

  for (const day of days) {
    const occursOn = addPlannerDaysToKey(exam.examOn, -day);
    if (occursOn < today) continue;
    occurrences.push({
      occursOn,
      title: courseTaskTitle(course.name, reminderLabel(exam.title, day)),
      notes: exam.notes,
      startsAt: null,
    });
  }

  if (exam.examOn >= today) {
    const minutes = timeOfDayToMinutes(exam.examTime);
    occurrences.push({
      occursOn: exam.examOn,
      title: courseTaskTitle(course.name, exam.title),
      notes: exam.notes,
      startsAt:
        minutes === null
          ? null
          : zonedDateTimeToIso(exam.examOn, minutes, timeZone),
    });
  }

  return occurrences;
}

/**
 * One task per matching weekday from today (or the later start) to the end of
 * the assignment's range, never reaching past the course's own term.
 */
export function assignmentOccurrences(
  course: CourseForSchedule,
  assignment: AssignmentForSchedule,
  today: string,
  timeZone: string,
): Occurrence[] {
  const weekdays = new Set(assignment.weekdays);
  const from = [assignment.startsOn ?? course.startsOn, course.startsOn, today]
    .sort()
    .at(-1)!;
  const to = [assignment.endsOn ?? course.endsOn, course.endsOn].sort()[0];
  const span = differenceInPlannerDays(from, to);
  if (span < 0) return [];

  const minutes = timeOfDayToMinutes(assignment.dueTime);
  const title = courseTaskTitle(course.name, assignment.title);
  const occurrences: Occurrence[] = [];

  for (let offset = 0; offset <= Math.min(span, MAX_TERM_DAYS); offset += 1) {
    const occursOn = addPlannerDaysToKey(from, offset);
    if (!weekdays.has(parsePlannerDate(occursOn).getUTCDay())) continue;
    occurrences.push({
      occursOn,
      title,
      notes: assignment.notes,
      startsAt:
        minutes === null
          ? null
          : zonedDateTimeToIso(occursOn, minutes, timeZone),
    });
  }

  return occurrences;
}
