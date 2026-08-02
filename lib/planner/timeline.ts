export const MINUTES_PER_DAY = 1_440;
export const SNAP_MINUTES = 15;
export const DEFAULT_DURATION_MINUTES = 30;

export type TimelineInterval = { id: string; start: number; end: number };
export type TimelineLayout = { column: number; columns: number };

export function startOfPlannerWeek(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

export function plannerWeek(dateKey: string) {
  const monday = startOfPlannerWeek(dateKey);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function addDays(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function snapMinutes(minutes: number) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function pointerToTimelineMinutes(
  pointerY: number,
  timelineTop: number,
  timelineHeight: number,
) {
  return clamp(
    snapMinutes(
      ((pointerY - timelineTop) / timelineHeight) * MINUTES_PER_DAY * 2,
    ),
    0,
    MINUTES_PER_DAY * 2 - SNAP_MINUTES,
  );
}

export function clampTimelineStart(start: number, duration: number) {
  return clamp(start, 0, MINUTES_PER_DAY - SNAP_MINUTES - duration);
}

export function clampTimelineDuration(start: number, duration: number) {
  return clamp(duration, SNAP_MINUTES, MINUTES_PER_DAY - SNAP_MINUTES - start);
}

export function minutesInTimeZone(timestamp: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return Number(values.hour) * 60 + Number(values.minute);
}

export function zonedDateTimeToIso(
  dateKey: string,
  minutes: number,
  timeZone: string,
) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const targetUtc = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minutes / 60),
    minutes % 60,
  );
  let candidate = targetUtc - offsetAt(new Date(targetUtc), timeZone);
  candidate = targetUtc - offsetAt(new Date(candidate), timeZone);
  return new Date(candidate).toISOString();
}

export function timeLabel(minutes: number) {
  const normalized =
    ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(normalized % 60).padStart(2, "0")} ${suffix}`;
}

export function layoutOverlaps(intervals: TimelineInterval[]) {
  const result = new Map<string, TimelineLayout>();
  const sorted = [...intervals].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  let group: TimelineInterval[] = [];
  let groupEnd = -1;

  function commitGroup() {
    if (!group.length) return;
    const active: Array<{ end: number; column: number }> = [];
    const assigned = new Map<string, number>();
    let columnCount = 1;

    for (const interval of group) {
      for (let index = active.length - 1; index >= 0; index -= 1) {
        if (active[index]!.end <= interval.start) active.splice(index, 1);
      }
      const occupied = new Set(active.map(({ column }) => column));
      let column = 0;
      while (occupied.has(column)) column += 1;
      active.push({ column, end: interval.end });
      assigned.set(interval.id, column);
      columnCount = Math.max(columnCount, column + 1);
    }

    for (const interval of group) {
      result.set(interval.id, {
        column: assigned.get(interval.id) ?? 0,
        columns: columnCount,
      });
    }
    group = [];
  }

  for (const interval of sorted) {
    if (group.length && interval.start >= groupEnd) commitGroup();
    group.push(interval);
    groupEnd = Math.max(groupEnd, interval.end);
  }
  commitGroup();
  return result;
}

function offsetAt(date: Date, timeZone: string) {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
}
