import { ValidationError } from "@/lib/daily-planner/errors";
import { calendarDateInTimeZone } from "@/lib/daily-planner/time";
import {
  minutesInTimeZone,
  minutesToTimeInput,
  timeInputToMinutes,
  zonedDateTimeToIso,
} from "@/lib/planner/timeline";

// The model reads and writes wall-clock dates and HH:MM times in the owner's
// zone; the planner stores instants. These convert between the two.

export function todayIn(timeZone: string, now = new Date()) {
  return calendarDateInTimeZone(now, timeZone);
}

export function dateIn(timestamp: Date, timeZone: string) {
  return calendarDateInTimeZone(timestamp, timeZone);
}

export function clockTimeIn(timestamp: Date, timeZone: string) {
  return minutesToTimeInput(
    minutesInTimeZone(timestamp.toISOString(), timeZone),
  );
}

/**
 * The planner's time-block fields for a date and optional HH:MM times. No
 * times clears the block; a time needs a date, and an end needs a start.
 */
export function timeBlockOn(
  date: string | null,
  times: { start_time?: string; end_time?: string },
  timeZone: string,
) {
  if (!times.start_time && !times.end_time) {
    return { startsAt: null, endsAt: null };
  }
  if (!date) throw new ValidationError("A time needs a date");
  if (!times.start_time) {
    throw new ValidationError("An end time needs a start time");
  }

  return {
    startsAt: instantAt(date, times.start_time, timeZone),
    endsAt: times.end_time ? instantAt(date, times.end_time, timeZone) : null,
  };
}

function instantAt(date: string, time: string, timeZone: string) {
  const minutes = timeInputToMinutes(time);
  if (minutes === null) throw new ValidationError(`Invalid time: ${time}`);
  return zonedDateTimeToIso(date, minutes, timeZone);
}
