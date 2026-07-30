import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/daily-planner/errors";
import {
  calendarDateInTimeZone,
  validateTimeBlock,
} from "@/lib/daily-planner/time";

describe("planner time zones", () => {
  it("calculates Eastern calendar dates around the DST boundary", () => {
    expect(
      calendarDateInTimeZone(
        new Date("2026-03-08T04:30:00.000Z"),
        "America/New_York",
      ),
    ).toBe("2026-03-07");
    expect(
      calendarDateInTimeZone(
        new Date("2026-03-08T07:30:00.000Z"),
        "America/New_York",
      ),
    ).toBe("2026-03-08");
  });

  it("accepts an in-day time block", () => {
    expect(() =>
      validateTimeBlock(
        "2026-07-29",
        "America/New_York",
        "2026-07-29T09:00:00-04:00",
        "2026-07-29T10:00:00-04:00",
      ),
    ).not.toThrow();
  });

  it("rejects cross-day and invalid-zone time blocks", () => {
    expect(() =>
      validateTimeBlock(
        "2026-07-29",
        "America/New_York",
        "2026-07-29T23:30:00-04:00",
        "2026-07-30T00:30:00-04:00",
      ),
    ).toThrow(ValidationError);
    expect(() =>
      validateTimeBlock(
        "2026-07-29",
        "Not/A_Time_Zone",
        "2026-07-29T09:00:00-04:00",
      ),
    ).toThrow(ValidationError);
  });
});
