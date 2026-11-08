import { describe, expect, it, vi } from "vitest";

import {
  diffGoals,
  GOAL_SETTLE_DELAYS_MS,
  settledGoalChanges,
  summarizeGoals,
} from "@/lib/sms/goals";
import {
  runPlannerTool,
  type PlannerOperations,
  type ToolContext,
} from "@/lib/sms/tools";

const USER_ID = "00000000-0000-4000-8000-0000000000c1";
const TASK = "00000000-0000-4000-8000-0000000000c2";
const GYM = "00000000-0000-4000-8000-0000000000c3";
const READ = "00000000-0000-4000-8000-0000000000c4";

function metric(id: string, name: string, count: number, target = 4) {
  return {
    id,
    userId: USER_ID,
    name,
    keywords: [name.toLowerCase()],
    targetCount: target,
    period: "week" as const,
    endsOn: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    periodStart: "2026-11-08",
    periodEnd: "2026-11-14",
    currentCount: count,
    history: [
      { periodStart: "2026-11-01", periodEnd: "2026-11-07", count: 2 },
      { periodStart: "2026-11-08", periodEnd: "2026-11-14", count },
    ],
    days: [],
  };
}

function result(...metrics: ReturnType<typeof metric>[]) {
  return { anchor: "2026-11-09", metrics };
}

describe("goal progress", () => {
  it("summarizes goals with what remains and earlier periods on request", () => {
    expect(summarizeGoals(result(metric(GYM, "Gym", 3)))).toEqual([
      {
        goal_id: GYM,
        name: "Gym",
        period: "week",
        period_start: "2026-11-08",
        period_end: "2026-11-14",
        count: 3,
        target: 4,
        remaining: 1,
        met: false,
        ends_on: null,
        keywords: ["gym"],
      },
    ]);

    const [withHistory] = summarizeGoals(result(metric(GYM, "Gym", 5)), {
      includeHistory: true,
    });
    expect(withHistory).toMatchObject({ remaining: 0, met: true });
    expect(withHistory.previous_periods).toEqual([
      { start: "2026-11-01", end: "2026-11-07", count: 2 },
    ]);
  });

  it("reports only goals whose count moved, and flags a target just reached", () => {
    const before = result(metric(GYM, "Gym", 3), metric(READ, "Read", 1));
    const after = result(metric(GYM, "Gym", 4), metric(READ, "Read", 1));
    expect(diffGoals(before, after)).toEqual([
      {
        goal: "Gym",
        period_start: "2026-11-08",
        period_end: "2026-11-14",
        before: 3,
        after: 4,
        target: 4,
        reached_target: true,
      },
    ]);

    // Already past the target: moving further is not "reached" again.
    expect(
      diffGoals(result(metric(GYM, "Gym", 4)), result(metric(GYM, "Gym", 5)))[0]
        .reached_target,
    ).toBe(false);
  });

  it("re-reads after a delay until the change shows up", async () => {
    const before = result(metric(GYM, "Gym", 3));
    const reads = [before, before, result(metric(GYM, "Gym", 4))];
    const read = vi.fn(async () => reads.shift()!);
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});

    const changes = await settledGoalChanges(read, before, sleep);
    expect(changes.map((change) => change.after)).toEqual([4]);
    expect(read).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(
      GOAL_SETTLE_DELAYS_MS.filter((ms) => ms > 0),
    );
  });

  it("stops early when the first read already shows the change", async () => {
    const before = result(metric(GYM, "Gym", 3));
    const read = vi.fn(async () => result(metric(GYM, "Gym", 4)));
    const sleep = vi.fn(async () => {});

    await settledGoalChanges(read, before, sleep);
    expect(read).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after the last re-read when nothing moves", async () => {
    const before = result(metric(GYM, "Gym", 3));
    const read = vi.fn(async () => before);
    expect(await settledGoalChanges(read, before, async () => {})).toEqual([]);
    expect(read).toHaveBeenCalledTimes(GOAL_SETTLE_DELAYS_MS.length);
  });
});

/** One task, one goal; completing the task moves the goal by one. */
function goalPlanner(options: {
  plannerDate: string | null;
  completedAt?: Date | null;
  goals?: boolean;
}) {
  const task = {
    id: TASK,
    title: "Gym",
    completedAt: options.completedAt ?? null,
    deletedAt: null,
    version: 1,
  };
  const planner = {
    findTask: vi.fn(async () => task),
    findActivePlannerDate: vi.fn(async () => options.plannerDate),
    setCompletion: vi.fn(
      async (
        _userId: string,
        _id: string,
        input: { completed: boolean; expectedVersion: number },
      ) => {
        task.completedAt = input.completed ? new Date() : null;
        task.version += 1;
        return task;
      },
    ),
    listMetrics: vi.fn(async (_userId: string, query: { anchor: string }) =>
      options.goals === false
        ? { anchor: query.anchor, metrics: [] }
        : result(metric(GYM, "Gym", task.completedAt ? 3 : 2)),
    ),
  };
  const sleep = vi.fn(async () => {});
  const context: ToolContext = {
    planner: planner as unknown as PlannerOperations,
    userId: USER_ID,
    timeZone: "America/New_York",
    // 2026-11-09 03:00 UTC is still the evening of 8 November in New York.
    now: () => new Date("2026-11-09T03:00:00Z"),
    sleep,
  };
  return { planner, context, sleep };
}

describe("set_task_done goal tracking", () => {
  it("reports the goal a completion moved, for the task's planner day", async () => {
    const { planner, context } = goalPlanner({ plannerDate: "2026-11-02" });
    const outcome = await runPlannerTool(context, "set_task_done", {
      task_id: TASK,
      done: true,
    });

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.content).goal_changes).toEqual([
      expect.objectContaining({ goal: "Gym", before: 2, after: 3 }),
    ]);
    // Last week's task changes last week's progress, not this week's.
    for (const [, query] of planner.listMetrics.mock.calls) {
      expect(query).toEqual({ anchor: "2026-11-02" });
    }
  });

  it("uses today in the owner's zone for an unscheduled task", async () => {
    const { planner, context } = goalPlanner({ plannerDate: null });
    await runPlannerTool(context, "set_task_done", {
      task_id: TASK,
      done: true,
    });
    expect(planner.listMetrics.mock.calls[0][1]).toEqual({
      anchor: "2026-11-08",
    });
  });

  it("reopening an unscheduled task looks at the day it was completed", async () => {
    const { planner, context } = goalPlanner({
      plannerDate: null,
      completedAt: new Date("2026-11-05T15:00:00Z"),
    });
    const outcome = await runPlannerTool(context, "set_task_done", {
      task_id: TASK,
      done: false,
    });
    expect(planner.listMetrics.mock.calls[0][1]).toEqual({
      anchor: "2026-11-05",
    });
    expect(JSON.parse(outcome.content).goal_changes).toEqual([
      expect.objectContaining({ before: 3, after: 2 }),
    ]);
  });

  it("skips the goal reads and the wait when there is nothing to compare", async () => {
    const noGoals = goalPlanner({ plannerDate: null, goals: false });
    await runPlannerTool(noGoals.context, "set_task_done", {
      task_id: TASK,
      done: true,
    });
    expect(noGoals.planner.listMetrics).toHaveBeenCalledTimes(1);
    expect(noGoals.sleep).not.toHaveBeenCalled();

    const alreadyDone = goalPlanner({
      plannerDate: null,
      completedAt: new Date(),
    });
    const outcome = await runPlannerTool(alreadyDone.context, "set_task_done", {
      task_id: TASK,
      done: true,
    });
    expect(alreadyDone.planner.listMetrics).not.toHaveBeenCalled();
    // Rewriting would move completed_at, and the task's goal credit, to now.
    expect(alreadyDone.planner.setCompletion).not.toHaveBeenCalled();
    expect(JSON.parse(outcome.content)).toMatchObject({
      unchanged: true,
      goal_changes: [],
    });
  });

  it("answers get_goals for today by default, or a given date", async () => {
    const { planner, context } = goalPlanner({ plannerDate: null });
    const outcome = await runPlannerTool(context, "get_goals", {});
    expect(planner.listMetrics.mock.calls[0][1]).toEqual({
      anchor: "2026-11-08",
    });
    expect(JSON.parse(outcome.content)).toMatchObject({
      goals: [{ name: "Gym", count: 2, target: 4, remaining: 2 }],
    });

    await runPlannerTool(context, "get_goals", { date: "2026-10-01" });
    expect(planner.listMetrics.mock.calls[1][1]).toEqual({
      anchor: "2026-10-01",
    });
  });
});
