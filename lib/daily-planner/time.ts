import { ValidationError } from "./errors";

export function calendarDateInTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );

    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    throw new ValidationError("The profile time zone is invalid");
  }
}

export function validateTimeBlock(
  plannerDate: string,
  timeZone: string,
  startsAt?: string | null,
  endsAt?: string | null,
) {
  if (!startsAt && !endsAt) return;
  if (!startsAt) throw new ValidationError("An end time requires a start time");

  const start = new Date(startsAt);
  if (calendarDateInTimeZone(start, timeZone) !== plannerDate) {
    throw new ValidationError(
      "The start time must fall within the planner day",
    );
  }

  if (endsAt) {
    const end = new Date(endsAt);
    if (end <= start) {
      throw new ValidationError("The end time must be later than the start");
    }
    if (calendarDateInTimeZone(end, timeZone) !== plannerDate) {
      throw new ValidationError("Time blocks cannot cross planner days");
    }
  }
}
