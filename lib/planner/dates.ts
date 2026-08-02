/**
 * Planner calendar helpers.
 *
 * A planner day is identified by a `YYYY-MM-DD` string. In memory it is carried
 * as a `Date` anchored at 12:00 UTC so that adding days never trips over a DST
 * boundary, and every read uses the UTC accessors.
 */

const MS_PER_DAY = 86_400_000;

/** Days per planner fetch. The API rejects ranges longer than 31 days. */
export const PLANNER_PAGE_DAYS = 28;

export type PlannerDateKey = string;

export function plannerDateKey(date: Date): PlannerDateKey {
  return date.toISOString().slice(0, 10);
}

export function parsePlannerDate(key: PlannerDateKey): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function addPlannerDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

export function addPlannerDaysToKey(
  key: PlannerDateKey,
  amount: number,
): PlannerDateKey {
  return plannerDateKey(addPlannerDays(parsePlannerDate(key), amount));
}

/** Whole days from `a` to `b`, positive when `b` is later. */
export function differenceInPlannerDays(
  a: PlannerDateKey,
  b: PlannerDateKey,
): number {
  return Math.round(
    (parsePlannerDate(b).getTime() - parsePlannerDate(a).getTime()) /
      MS_PER_DAY,
  );
}

/** Today's calendar date in the given IANA time zone. */
export function getPlannerToday(timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "numeric",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 12),
  );
}

export function getPlannerTodayKey(timeZone: string): PlannerDateKey {
  return plannerDateKey(getPlannerToday(timeZone));
}

/**
 * Pages are anchored to the Unix epoch rather than to today, so a given date
 * always belongs to the same page and cached pages stay valid across midnight.
 */
export function plannerPageIndex(key: PlannerDateKey): number {
  const epochDay = Math.floor(parsePlannerDate(key).getTime() / MS_PER_DAY);
  return Math.floor(epochDay / PLANNER_PAGE_DAYS);
}

export function plannerPageRange(pageIndex: number): {
  from: PlannerDateKey;
  to: PlannerDateKey;
} {
  const startMs =
    pageIndex * PLANNER_PAGE_DAYS * MS_PER_DAY + MS_PER_DAY / 2;
  const from = new Date(startMs);

  return {
    from: plannerDateKey(from),
    to: plannerDateKey(addPlannerDays(from, PLANNER_PAGE_DAYS - 1)),
  };
}

/** Every day key in a page, in ascending order. */
export function plannerPageDayKeys(pageIndex: number): PlannerDateKey[] {
  const { from } = plannerPageRange(pageIndex);
  const start = parsePlannerDate(from);

  return Array.from({ length: PLANNER_PAGE_DAYS }, (_, offset) =>
    plannerDateKey(addPlannerDays(start, offset)),
  );
}

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
});

const monthDayFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const shortWeekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
});

export function formatWeekday(key: PlannerDateKey): string {
  return weekdayFormatter.format(parsePlannerDate(key));
}

export function formatShortWeekday(key: PlannerDateKey): string {
  return shortWeekdayFormatter.format(parsePlannerDate(key));
}

export function formatMonthDay(key: PlannerDateKey): string {
  return monthDayFormatter.format(parsePlannerDate(key));
}

export function formatDayNumber(key: PlannerDateKey): number {
  return parsePlannerDate(key).getUTCDate();
}

/** Formats a stored time block for display in the planner day's time zone. */
export function formatTimeBlock(
  startsAt: string | null,
  endsAt: string | null,
  timeZone: string,
): string | null {
  if (!startsAt) return null;

  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  const start = formatter.format(new Date(startsAt));
  if (!endsAt) return start;

  return `${start} – ${formatter.format(new Date(endsAt))}`;
}
