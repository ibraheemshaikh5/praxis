import { describe, expect, it } from "vitest";

import {
  addDays,
  clampTimelineDuration,
  clampTimelineStart,
  layoutOverlaps,
  minutesInTimeZone,
  minutesToTimeInput,
  plannerWeek,
  pointerToDayMinutes,
  pointerToTimelineMinutes,
  resolveAutoPlacement,
  snapMinutes,
  startOfPlannerWeek,
  timeInputToMinutes,
  zonedDateTimeToIso,
} from "@/lib/planner/timeline";

describe("planner timeline", () => {
  it("builds Monday-first weeks across boundaries", () => {
    expect(startOfPlannerWeek("2026-07-30")).toBe("2026-07-27");
    expect(plannerWeek("2027-01-01")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("snaps to quarter hours", () => {
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(15);
    expect(snapMinutes(68)).toBe(75);
  });

  it("converts pointer positions and keeps blocks inside one planner day", () => {
    expect(pointerToTimelineMinutes(250, 100, 1_000)).toBe(435);
    expect(pointerToDayMinutes(350, 100, 1_000)).toBe(360);
    expect(clampTimelineStart(1_430, 30)).toBe(1_395);
    expect(clampTimelineDuration(1_395, 60)).toBe(30);
  });

  it("converts compact time inputs", () => {
    expect(timeInputToMinutes("09:45")).toBe(585);
    expect(timeInputToMinutes("25:00")).toBeNull();
    expect(minutesToTimeInput(585)).toBe("09:45");
  });

  it("places consecutive tasks after the latest task or current quarter", () => {
    expect(
      resolveAutoPlacement({
        duration: 30,
        isToday: true,
        latestEnd: 600,
        nowMinutes: 617,
      }),
    ).toEqual({ dayOffset: 0, start: 630 });
    expect(
      resolveAutoPlacement({
        duration: 30,
        isToday: false,
        latestEnd: null,
        nowMinutes: 1_000,
      }),
    ).toEqual({ dayOffset: 0, start: 480 });
    expect(
      resolveAutoPlacement({
        duration: 60,
        isToday: false,
        latestEnd: 1_410,
        nowMinutes: 0,
      }),
    ).toEqual({ dayOffset: 1, start: 480 });
  });

  it("converts Eastern wall times across DST", () => {
    const winter = zonedDateTimeToIso("2026-01-15", 540, "America/New_York");
    const summer = zonedDateTimeToIso("2026-07-15", 540, "America/New_York");
    expect(winter).toBe("2026-01-15T14:00:00.000Z");
    expect(summer).toBe("2026-07-15T13:00:00.000Z");
    expect(minutesInTimeZone(summer, "America/New_York")).toBe(540);
  });

  it("lays overlapping tasks side by side", () => {
    const layout = layoutOverlaps([
      { id: "a", start: 60, end: 120 },
      { id: "b", start: 90, end: 150 },
      { id: "c", start: 150, end: 180 },
    ]);
    expect(layout.get("a")).toEqual({ column: 0, columns: 2 });
    expect(layout.get("b")).toEqual({ column: 1, columns: 2 });
    expect(layout.get("c")).toEqual({ column: 0, columns: 1 });
  });
});
