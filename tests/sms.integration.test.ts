import { expect, it } from "vitest";

import { DailyPlannerService } from "@/lib/daily-planner/service";
import { SmsConversationService } from "@/lib/sms/service";
import { runPlannerTool, type ToolContext } from "@/lib/sms/tools";
import { describeDatabase, useTestDatabase } from "./support/database";

const OWNER = "00000000-0000-4000-8000-000000000501";
const OTHER = "00000000-0000-4000-8000-000000000502";
const DAY = "2026-11-09";

describeDatabase("sms assistant database integration", () => {
  const { db } = useTestDatabase([OWNER, OTHER]);
  const planner = new DailyPlannerService(db);
  const conversation = new SmsConversationService(db);
  const context: ToolContext = {
    planner,
    userId: OWNER,
    timeZone: "America/New_York",
  };

  async function call(name: string, input: unknown) {
    const outcome = await runPlannerTool(context, name, input);
    if (outcome.isError) throw new Error(`${name}: ${outcome.content}`);
    return JSON.parse(outcome.content);
  }

  it("drives the planner end to end through the tools", async () => {
    const dentist = await call("add_task", {
      title: "Call dentist",
      date: DAY,
      start_time: "15:00",
      end_time: "15:30",
    });
    const essay = await call("add_task", { title: "Essay draft", date: DAY });
    const gym = await call("add_task", { title: "Gym", date: DAY });

    expect(await call("list_tasks", { from: DAY })).toEqual({
      days: [
        {
          date: DAY,
          tasks: [
            {
              task_id: dentist.task_id,
              title: "Call dentist",
              done: false,
              start: "15:00",
              end: "15:30",
            },
            { task_id: essay.task_id, title: "Essay draft", done: false },
            { task_id: gym.task_id, title: "Gym", done: false },
          ],
        },
      ],
    });

    // Each write bumps the version; the tools track it without being told.
    await call("set_task_done", { task_id: gym.task_id, done: true });
    await call("update_task", { task_id: gym.task_id, title: "Leg day" });
    await call("reorder_day", { date: DAY, task_ids: [essay.task_id] });
    await call("schedule_task", {
      task_id: dentist.task_id,
      date: "2026-11-10",
      start_time: "09:00",
    });

    const day = await call("list_tasks", { from: DAY, to: "2026-11-10" });
    expect(day.days).toEqual([
      {
        date: DAY,
        tasks: [
          { task_id: essay.task_id, title: "Essay draft", done: false },
          { task_id: gym.task_id, title: "Leg day", done: true },
        ],
      },
      {
        date: "2026-11-10",
        tasks: [
          {
            task_id: dentist.task_id,
            title: "Call dentist",
            done: false,
            start: "09:00",
          },
        ],
      },
    ]);

    await call("delete_task", { task_id: essay.task_id });
    expect(
      (await call("list_tasks", { from: DAY })).days[0].tasks,
    ).toHaveLength(1);
    await call("restore_task", { task_id: essay.task_id });
    expect(
      (await call("list_tasks", { from: DAY })).days[0].tasks,
    ).toHaveLength(2);

    await call("schedule_task", { task_id: gym.task_id, date: null });
    expect(
      (await call("list_tasks", { from: DAY, include_unscheduled: true }))
        .unscheduled,
    ).toEqual([{ task_id: gym.task_id, title: "Leg day", done: true }]);
  });

  it("reports goal progress a completion moves, using real keyword matching", async () => {
    const sleeps: number[] = [];
    const goalContext: ToolContext = {
      ...context,
      // Sunday 8 November, evening in New York: the week of 8–14 November.
      now: () => new Date("2026-11-09T01:00:00Z"),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    };
    const done = async (taskId: string, value = true) => {
      const outcome = await runPlannerTool(goalContext, "set_task_done", {
        task_id: taskId,
        done: value,
      });
      if (outcome.isError) throw new Error(outcome.content);
      return JSON.parse(outcome.content).goal_changes;
    };

    await planner.createMetric(OWNER, {
      name: "Gym",
      keywords: ["gym"],
      targetCount: 2,
      period: "week",
    });
    const first = await planner.createTask(OWNER, {
      title: "Gym session",
      plannerDate: "2026-11-09",
    });
    const second = await planner.createTask(OWNER, {
      title: "Leg day at the gym",
      plannerDate: "2026-11-10",
    });
    const lastWeek = await planner.createTask(OWNER, {
      title: "Gym",
      plannerDate: "2026-11-03",
    });
    const unrelated = await planner.createTask(OWNER, {
      title: "Call dentist",
      plannerDate: "2026-11-09",
    });

    expect(await done(first.task.id)).toEqual([
      {
        goal: "Gym",
        period_start: "2026-11-08",
        period_end: "2026-11-14",
        before: 0,
        after: 1,
        target: 2,
        reached_target: false,
      },
    ]);
    expect(await done(second.task.id)).toEqual([
      expect.objectContaining({ before: 1, after: 2, reached_target: true }),
    ]);
    // Counted toward its own week, not the current one.
    expect(await done(lastWeek.task.id)).toEqual([
      expect.objectContaining({
        period_start: "2026-11-01",
        before: 0,
        after: 1,
      }),
    ]);
    expect(await done(second.task.id, false)).toEqual([
      expect.objectContaining({ before: 2, after: 1 }),
    ]);
    // No first-read change in any of those, so no waiting.
    expect(sleeps).toEqual([]);

    // A task no goal counts settles for every re-read, then reports nothing.
    expect(await done(unrelated.task.id)).toEqual([]);
    expect(sleeps).toEqual([400, 1000]);

    const goals = await runPlannerTool(goalContext, "get_goals", {});
    expect(JSON.parse(goals.content).goals).toEqual([
      expect.objectContaining({
        name: "Gym",
        count: 1,
        target: 2,
        remaining: 1,
        period_start: "2026-11-08",
      }),
    ]);
  });

  it("cannot reach another user's task", async () => {
    const { task } = await planner.createTask(OTHER, {
      title: "Not yours",
      plannerDate: DAY,
    });
    const outcome = await runPlannerTool(context, "delete_task", {
      task_id: task.id,
    });
    expect(outcome).toEqual({ content: "Resource not found", isError: true });
    expect((await planner.findTask(OTHER, task.id))?.deletedAt).toBeNull();
  });

  it("lets one poll hold the owner's lease at a time", async () => {
    const first = await conversation.acquirePollLease(OWNER, 60_000);
    expect(first).toEqual(expect.any(String));
    expect(await conversation.acquirePollLease(OWNER, 60_000)).toBeNull();
    // Another owner's lease is separate.
    expect(await conversation.acquirePollLease(OTHER, 60_000)).not.toBeNull();

    // A stale holder's release does not free a lease it no longer holds.
    await conversation.releasePollLease(OWNER, crypto.randomUUID());
    expect(await conversation.acquirePollLease(OWNER, 60_000)).toBeNull();

    await conversation.releasePollLease(OWNER, first!);
    const second = await conversation.acquirePollLease(OWNER, 1);
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);

    // An expired lease is taken over without being released.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await conversation.acquirePollLease(OWNER, 60_000)).not.toBeNull();
  });

  it("records a text once and returns recent history oldest first", async () => {
    const first = await conversation.recordInbound(
      OWNER,
      "SM-int-1",
      "add milk",
    );
    expect(first).not.toBeNull();
    expect(
      await conversation.recordInbound(OWNER, "SM-int-1", "add milk"),
    ).toBeNull();

    await conversation.recordOutbound(
      OWNER,
      "SM-int-2",
      "Added milk.",
      "add_task {} -> {}",
    );
    const second = await conversation.recordInbound(OWNER, "SM-int-3", "undo");

    expect(await conversation.recentHistory(OWNER, second!.id)).toEqual([
      { direction: "inbound", body: "add milk", toolLog: null },
      {
        direction: "outbound",
        body: "Added milk.",
        toolLog: "add_task {} -> {}",
      },
    ]);
    expect(await conversation.recentHistory(OTHER, second!.id)).toEqual([]);
  });
});
