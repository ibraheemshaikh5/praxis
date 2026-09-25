/**
 * Display forms for the class tracker. Calendar dates stay strings; a time of
 * day is the HH:MM the owner typed, never an instant.
 */

import { formatCalendarDate } from "@/lib/rolodex/dates";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Monday through Sunday, the order a week is planned in. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function weekdaysLabel(weekdays: number[]) {
  const sorted = WEEK_ORDER.filter((day) => weekdays.includes(day));
  if (sorted.length === 7) return "Every day";
  if (sorted.length === 5 && !sorted.includes(0) && !sorted.includes(6)) {
    return "Weekdays";
  }
  return sorted.map((day) => WEEKDAY_SHORT[day]).join(", ");
}

/** "14:05:00" from Postgres and "14:05" from an input both read as 2:05 PM. */
export function timeOfDayLabel(value: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  const period = hours < 12 ? "AM" : "PM";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function reminderDaysLabel(reminderDays: number[]) {
  if (reminderDays.length === 0) return "Day of";
  const days = [...reminderDays].sort((a, b) => b - a);
  return `${days.join(", ")} ${days.length === 1 && days[0] === 1 ? "day" : "days"} before`;
}

export function dateRangeLabel(startsOn: string, endsOn: string) {
  return `${formatCalendarDate(startsOn)} – ${formatCalendarDate(endsOn)}`;
}

/** The exam nearest ahead of today, or the last one when they are all past. */
export function nextExam<T extends { examOn: string }>(
  exams: T[],
  today: string | null,
): T | null {
  if (exams.length === 0) return null;
  const sorted = [...exams].sort((a, b) => a.examOn.localeCompare(b.examOn));
  if (!today) return sorted[0];
  return sorted.find((exam) => exam.examOn >= today) ?? null;
}
