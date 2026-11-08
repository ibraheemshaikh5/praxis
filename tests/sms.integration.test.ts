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
