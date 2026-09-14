import { expect, it } from "vitest";

import { CoursesService } from "@/lib/courses/service";
import { DailyPlannerService } from "@/lib/daily-planner/service";
import { calendarDateInTimeZone } from "@/lib/daily-planner/time";
import { addPlannerDaysToKey, parsePlannerDate } from "@/lib/planner/dates";
import { describeDatabase, useTestDatabase } from "./support/database";

const USER_ONE = "00000000-0000-4000-8000-000000000031";
const USER_TWO = "00000000-0000-4000-8000-000000000032";

describeDatabase("courses database integration", () => {
  const { db } = useTestDatabase([USER_ONE, USER_TWO]);
  const service = new CoursesService(db);
  const planner = new DailyPlannerService(db);

  // Rules only write from today on, so every date is measured from it.
  const today = calendarDateInTimeZone(new Date(), "America/New_York");
  const day = (offset: number) => addPlannerDaysToKey(today, offset);

  async function plannerTasks(userId: string, from: string, to: string) {
    const { entries } = await planner.listPlanner(userId, {
      from,
      to,
      inbox: "false",
    });
    return entries
      .filter((entry) => !entry.closedAt)
      .map((entry) => ({
        date: entry.plannerDate,
        title: entry.task.title,
        startsAt: entry.startsAt?.toISOString() ?? null,
        colorKey: entry.task.colorKey,
        deleted: entry.task.deletedAt !== null,
      }));
  }

  it("writes exam reminders into the planner and follows the exam when it moves", async () => {
    const course = await service.createCourse(USER_ONE, {
      name: "CS 161",
      term: "Fall",
      startsOn: day(-10),
      endsOn: day(120),
      colorKey: "rose",
    });

    const exam = await service.createExam(USER_ONE, course.id, {
      title: "Midterm",
      examOn: day(10),
      examTime: "14:00",
      reminderDays: [7, 3, 1],
    });

    let tasks = await plannerTasks(USER_ONE, day(0), day(30));
    expect(tasks.map(({ date, title }) => [date, title])).toEqual([
      [day(3), "CS 161 · Midterm in 7 days"],
      [day(7), "CS 161 · Midterm in 3 days"],
      [day(9), "CS 161 · Midterm tomorrow"],
      [day(10), "CS 161 · Midterm"],
    ]);
    expect(tasks.every((task) => task.colorKey === "rose")).toBe(true);
    expect(tasks[3].startsAt).not.toBeNull();

    // Moving the exam two days out keeps the one date both schedules share,
    // retires the rest, and writes the new dates.
    const before = await plannerTasks(USER_ONE, day(9), day(9));
    await service.updateExam(USER_ONE, course.id, exam.id, {
      examOn: day(12),
    });

    tasks = await plannerTasks(USER_ONE, day(0), day(30));
    expect(tasks.map(({ date, title }) => [date, title])).toEqual([
      [day(5), "CS 161 · Midterm in 7 days"],
      [day(9), "CS 161 · Midterm in 3 days"],
      [day(11), "CS 161 · Midterm tomorrow"],
      [day(12), "CS 161 · Midterm"],
    ]);
    expect(before[0].title).toBe("CS 161 · Midterm tomorrow");

    // A course rename reaches every task it wrote.
    await service.updateCourse(USER_ONE, course.id, {
      name: "CS 162",
      expectedVersion: 1,
    });
    tasks = await plannerTasks(USER_ONE, day(0), day(30));
    expect(tasks.every((task) => task.title.startsWith("CS 162 · "))).toBe(
      true,
    );

    // Removing the exam takes its upcoming tasks with it.
    await service.deleteExam(USER_ONE, course.id, exam.id);
    expect(await plannerTasks(USER_ONE, day(0), day(30))).toEqual([]);
  });

  it("writes recurring work weekly and leaves what the owner did alone", async () => {
    const course = await service.createCourse(USER_ONE, {
      name: "Math 54",
      term: "Fall",
      startsOn: day(0),
      endsOn: day(27),
    });
    const weekday = parsePlannerDate(day(1)).getUTCDay();

    const assignment = await service.createAssignment(USER_ONE, course.id, {
      title: "Problem set",
      weekdays: [weekday],
      dueTime: "23:00",
    });

    let tasks = await plannerTasks(USER_ONE, day(0), day(30));
    expect(tasks.map(({ date }) => date)).toEqual([
      day(1),
      day(8),
      day(15),
      day(22),
    ]);

    // Ticking one off keeps it even after the rule stops wanting that day;
    // the others go with the rule.
    const { entries } = await planner.listPlanner(USER_ONE, {
      from: day(1),
      to: day(1),
      inbox: "false",
    });
    await planner.setCompletion(USER_ONE, entries[0].taskId, {
      completed: true,
      expectedVersion: entries[0].task.version,
    });

    await service.updateAssignment(USER_ONE, course.id, assignment.id, {
      weekdays: [(weekday + 1) % 7],
    });
    tasks = await plannerTasks(USER_ONE, day(0), day(30));
    expect(tasks.map(({ date }) => date)).toEqual([
      day(1),
      day(2),
      day(9),
      day(16),
      day(23),
    ]);

    // Another user sees none of it.
    expect(await plannerTasks(USER_TWO, day(0), day(30))).toEqual([]);
    await expect(service.getCourse(USER_TWO, course.id)).rejects.toMatchObject({
      status: 404,
    });

    // Removing the class clears the upcoming tasks and keeps the done one.
    await service.deleteCourse(USER_ONE, course.id);
    tasks = await plannerTasks(USER_ONE, day(0), day(30));
    expect(tasks.map(({ date }) => date)).toEqual([day(1)]);
    expect(await service.listCourses(USER_ONE)).toEqual([]);
  });

  it("rejects a stale course edit", async () => {
    const course = await service.createCourse(USER_ONE, {
      name: "Physics 7A",
      term: "Fall",
      startsOn: day(0),
      endsOn: day(60),
    });

    await service.updateCourse(USER_ONE, course.id, {
      term: "Fall 2026",
      expectedVersion: 1,
    });
    await expect(
      service.updateCourse(USER_ONE, course.id, {
        term: "Spring",
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.updateCourse(USER_ONE, course.id, {
        endsOn: day(-1),
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
