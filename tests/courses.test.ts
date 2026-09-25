import { describe, expect, it } from "vitest";

import {
  createAssignmentSchema,
  createCourseSchema,
  createExamSchema,
  updateCourseSchema,
  updateExamSchema,
} from "@/lib/courses/contracts";
import {
  nextExam,
  reminderDaysLabel,
  timeOfDayLabel,
  weekdaysLabel,
} from "@/lib/courses/format";
import {
  assignmentOccurrences,
  courseTaskTitle,
  examOccurrences,
  timeOfDayToMinutes,
} from "@/lib/courses/schedule";

const TIME_ZONE = "America/New_York";

const course = {
  name: "CS 161",
  startsOn: "2026-09-01",
  endsOn: "2026-12-15",
};

describe("exam occurrences", () => {
  it("writes a reminder for each lead day and the exam itself", () => {
    const occurrences = examOccurrences(
      course,
      {
        title: "Midterm 1",
        examOn: "2026-10-10",
        examTime: "14:30",
        reminderDays: [7, 3, 1],
        notes: "Chapters 1 to 5",
      },
      "2026-09-13",
      TIME_ZONE,
    );

    expect(occurrences.map(({ occursOn, title }) => [occursOn, title])).toEqual(
      [
        ["2026-10-03", "CS 161 · Midterm 1 in 7 days"],
        ["2026-10-07", "CS 161 · Midterm 1 in 3 days"],
        ["2026-10-09", "CS 161 · Midterm 1 tomorrow"],
        ["2026-10-10", "CS 161 · Midterm 1"],
      ],
    );
    // Only the exam itself carries the time; it is 2:30 PM Eastern.
    expect(
      occurrences.slice(0, 3).every((item) => item.startsAt === null),
    ).toBe(true);
    expect(occurrences[3].startsAt).toBe("2026-10-10T18:30:00.000Z");
    expect(occurrences.every((item) => item.notes === "Chapters 1 to 5")).toBe(
      true,
    );
  });

  it("drops reminders whose day has already passed, and a past exam entirely", () => {
    const exam = {
      title: "Final",
      examOn: "2026-09-15",
      examTime: null,
      reminderDays: [7, 3, 1],
      notes: null,
    };

    expect(
      examOccurrences(course, exam, "2026-09-13", TIME_ZONE).map(
        ({ occursOn }) => occursOn,
      ),
    ).toEqual(["2026-09-14", "2026-09-15"]);
    expect(examOccurrences(course, exam, "2026-09-16", TIME_ZONE)).toEqual([]);
  });

  it("reads a Postgres time with seconds the same as an input time", () => {
    expect(timeOfDayToMinutes("09:05:00")).toBe(545);
    expect(timeOfDayToMinutes("09:05")).toBe(545);
    expect(timeOfDayToMinutes(null)).toBeNull();
  });
});

describe("assignment occurrences", () => {
  const assignment = {
    title: "Problem set",
    weekdays: [2, 4],
    dueTime: "23:59",
    startsOn: null,
    endsOn: null,
    notes: null,
  };

  it("lands on each chosen weekday from today to the end of the term", () => {
    const occurrences = assignmentOccurrences(
      course,
      assignment,
      "2026-12-01",
      TIME_ZONE,
    );

    expect(occurrences.map(({ occursOn }) => occursOn)).toEqual([
      "2026-12-01",
      "2026-12-03",
      "2026-12-08",
      "2026-12-10",
      "2026-12-15",
    ]);
    expect(occurrences[0].title).toBe(courseTaskTitle("CS 161", "Problem set"));
    // 11:59 PM Eastern, in December, is 04:59 UTC the next day.
    expect(occurrences[0].startsAt).toBe("2026-12-02T04:59:00.000Z");
  });

  it("starts at the term when today is earlier, and stays inside it", () => {
    const occurrences = assignmentOccurrences(
      course,
      {
        ...assignment,
        weekdays: [1],
        startsOn: "2026-08-01",
        endsOn: "2027-06-01",
      },
      "2026-01-01",
      TIME_ZONE,
    );

    expect(occurrences[0].occursOn).toBe("2026-09-07");
    expect(occurrences.at(-1)?.occursOn).toBe("2026-12-14");
  });

  it("honours a narrower range of its own and yields nothing past it", () => {
    const occurrences = assignmentOccurrences(
      course,
      { ...assignment, startsOn: "2026-10-01", endsOn: "2026-10-10" },
      "2026-09-13",
      TIME_ZONE,
    );

    expect(occurrences.map(({ occursOn }) => occursOn)).toEqual([
      "2026-10-01",
      "2026-10-06",
      "2026-10-08",
    ]);
    expect(
      assignmentOccurrences(course, assignment, "2026-12-16", TIME_ZONE),
    ).toEqual([]);
  });
});

describe("course contracts", () => {
  it("accepts a term and rejects one that ends before it starts", () => {
    expect(
      createCourseSchema.parse({
        name: "  CS 161 ",
        term: "Fall 2026",
        startsOn: "2026-09-01",
        endsOn: "2026-12-15",
      }),
    ).toMatchObject({ name: "CS 161" });
    expect(
      createCourseSchema.safeParse({
        name: "CS 161",
        term: "Fall 2026",
        startsOn: "2026-12-15",
        endsOn: "2026-09-01",
      }).success,
    ).toBe(false);
    expect(
      createCourseSchema.safeParse({
        name: "CS 161",
        term: "Fall 2026",
        startsOn: "2026-01-01",
        endsOn: "2027-06-01",
      }).success,
    ).toBe(false);
  });

  it("requires a field to update and a version to update against", () => {
    expect(updateCourseSchema.safeParse({ expectedVersion: 1 }).success).toBe(
      false,
    );
    expect(
      updateCourseSchema.safeParse({ name: "CS 162", expectedVersion: 1 })
        .success,
    ).toBe(true);
    expect(updateExamSchema.safeParse({}).success).toBe(false);
  });

  it("defaults, sorts, and dedupes reminder days", () => {
    expect(
      createExamSchema.parse({ title: "Midterm", examOn: "2026-10-10" })
        .reminderDays,
    ).toEqual([7, 3, 1]);
    expect(
      createExamSchema.parse({
        title: "Midterm",
        examOn: "2026-10-10",
        reminderDays: [1, 3, 3, 14],
      }).reminderDays,
    ).toEqual([14, 3, 1]);
    expect(
      createExamSchema.safeParse({
        title: "Midterm",
        examOn: "2026-10-10",
        reminderDays: [0],
      }).success,
    ).toBe(false);
    expect(
      createExamSchema.safeParse({
        title: "Midterm",
        examOn: "2026-10-10",
        examTime: "9:00",
      }).success,
    ).toBe(false);
  });

  it("orders weekdays and needs at least one", () => {
    expect(
      createAssignmentSchema.parse({ title: "Reading", weekdays: [4, 2, 4] })
        .weekdays,
    ).toEqual([2, 4]);
    expect(
      createAssignmentSchema.safeParse({ title: "Reading", weekdays: [] })
        .success,
    ).toBe(false);
    expect(
      createAssignmentSchema.safeParse({
        title: "Reading",
        weekdays: [1],
        startsOn: "2026-10-10",
        endsOn: "2026-10-01",
      }).success,
    ).toBe(false);
  });
});

describe("course labels", () => {
  it("names a set of weekdays the way a syllabus would", () => {
    expect(weekdaysLabel([1, 3])).toBe("Mon, Wed");
    expect(weekdaysLabel([0, 6])).toBe("Sat, Sun");
    expect(weekdaysLabel([1, 2, 3, 4, 5])).toBe("Weekdays");
    expect(weekdaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
  });

  it("formats a time of day and a reminder schedule", () => {
    expect(timeOfDayLabel("14:30:00")).toBe("2:30 PM");
    expect(timeOfDayLabel("00:05")).toBe("12:05 AM");
    expect(timeOfDayLabel(null)).toBeNull();
    expect(reminderDaysLabel([7, 3, 1])).toBe("7, 3, 1 days before");
    expect(reminderDaysLabel([1])).toBe("1 day before");
    expect(reminderDaysLabel([])).toBe("Day of");
  });

  it("picks the exam nearest ahead of today", () => {
    const exams = [
      { id: "b", examOn: "2026-11-01" },
      { id: "a", examOn: "2026-10-01" },
    ];
    expect(nextExam(exams, "2026-10-15")?.id).toBe("b");
    expect(nextExam(exams, "2026-09-01")?.id).toBe("a");
    expect(nextExam(exams, "2026-12-01")).toBeNull();
    expect(nextExam(exams, null)?.id).toBe("a");
  });
});
