/**
 * A meeting is recorded as the calendar day it happened on, so everything here
 * works in `YYYY-MM-DD` strings and never converts them to instants: parsing
 * one as a Date would move it across a day boundary west of UTC.
 */

const MS_PER_DAY = 86_400_000;

export function todayCalendarDate(now = new Date()) {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string) {
  return Math.round((utcValue(to) - utcValue(from)) / MS_PER_DAY);
}

export function formatCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(Date.UTC(year, month - 1, day));
}

/**
 * How long ago, in the terms the answer is actually wanted in. Anything past a
 * month is a date rather than a count, because "47 days ago" is not a fact
 * anyone holds in their head.
 */
export function elapsedLabel(metOn: string, today = todayCalendarDate()) {
  const days = daysBetween(metOn, today);

  if (days < 0) return formatCalendarDate(metOn);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 31) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }

  return formatCalendarDate(metOn);
}

/** The elapsed form once the browser knows its own day, the date until then. */
export function metLabel(metOn: string, today: string | null) {
  return today ? elapsedLabel(metOn, today) : formatCalendarDate(metOn);
}

function utcValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}
