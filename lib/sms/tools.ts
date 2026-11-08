import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import {
  createTaskSchema,
  plannerRangeQuerySchema,
  reorderPlannerSchema,
  scheduleTaskSchema,
} from "@/lib/daily-planner/contracts";
import {
  ConflictError,
  NotFoundError,
  PlannerError,
  ValidationError,
} from "@/lib/daily-planner/errors";
import type { DailyPlannerService } from "@/lib/daily-planner/service";
import { minutesInTimeZone, zonedDateTimeToIso } from "@/lib/planner/timeline";

/** The planner operations the SMS agent is allowed to perform. */
export type PlannerOperations = Pick<
  DailyPlannerService,
  | "listPlanner"
  | "createTask"
  | "updateTask"
  | "setCompletion"
  | "scheduleTask"
  | "reorderPlanner"
  | "deleteTask"
  | "restoreTask"
  | "findTask"
>;

export type ToolContext = {
  planner: PlannerOperations;
  userId: string;
  timeZone: string;
};

export type ToolOutcome = { content: string; isError: boolean };

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Calendar date, YYYY-MM-DD, in the owner's time zone");
const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .describe("24-hour local time, HH:MM");
const taskId = z.string().uuid().describe("Task id from list_tasks");

const listTasksInput = z.object({
  from: calendarDate,
  to: calendarDate
    .optional()
    .describe("Last date to include; defaults to `from`. At most 31 days."),
  include_unscheduled: z
    .boolean()
    .optional()
    .describe("Also return tasks that have no date"),
});

const addTaskInput = z.object({
  title: z.string().trim().min(1).max(500),
  date: calendarDate.optional().describe("Omit to leave the task unscheduled"),
  start_time: clockTime.optional(),
  end_time: clockTime.optional(),
  notes: z.string().max(50_000).optional(),
});

const updateTaskInput = z.object({
  task_id: taskId,
  title: z.string().trim().min(1).max(500).optional(),
  notes: z.string().max(50_000).nullable().optional(),
});

const setDoneInput = z.object({
  task_id: taskId,
  done: z.boolean(),
});

const scheduleTaskInput = z.object({
  task_id: taskId,
  date: calendarDate
    .nullable()
    .describe("New date, or null to remove the task from the planner"),
  start_time: clockTime.optional(),
  end_time: clockTime.optional(),
});

const reorderDayInput = z.object({
  date: calendarDate,
  task_ids: z
    .array(taskId)
    .min(1)
    .describe(
      "Tasks in the order they should appear. Tasks on that day that are not listed keep their relative order after these.",
    ),
});

const taskOnlyInput = z.object({ task_id: taskId });

type ToolSpec<T> = {
  description: string;
  input: z.ZodType<T>;
  run: (context: ToolContext, input: T) => Promise<unknown>;
};

// Each spec is typed against its own schema where it is written, then erased:
// runPlannerTool only ever passes a value its schema has just parsed.
function tool<T>(spec: ToolSpec<T>) {
  return spec as unknown as ToolSpec<unknown>;
}

const TOOL_SPECS: Record<string, ToolSpec<unknown>> = {
  list_tasks: tool({
    description:
      "List planner tasks for a date range, in planner order, with completion state and local times. Use before changing a task to find its id.",
    input: listTasksInput,
    run: (context, input) => listTasks(context, input),
  }),
  add_task: tool({
    description:
      "Create a task. With a date it goes on that planner day; start_time and end_time make it a time block on that day.",
    input: addTaskInput,
    run: async (context, input) => {
      const body = createTaskSchema.parse({
        title: input.title,
        notes: input.notes,
        plannerDate: input.date ?? null,
        ...timeBlock(context, input.date ?? null, input),
      });
      const { task, entry } = await context.planner.createTask(
        context.userId,
        body,
      );
      return { task_id: task.id, title: task.title, date: entry?.plannerDate };
    },
  }),
  update_task: tool({
    description: "Rename a task or replace its notes.",
    input: updateTaskInput,
    run: (context, input) => {
      if (input.title === undefined && input.notes === undefined) {
        throw new ValidationError("Provide a title or notes to change");
      }
      return withCurrentVersion(context, input.task_id, async (version) => {
        const task = await context.planner.updateTask(
          context.userId,
          input.task_id,
          {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            expectedVersion: version,
          },
        );
        return { task_id: task.id, title: task.title };
      });
    },
  }),
  set_task_done: tool({
    description: "Mark a task done, or not done.",
    input: setDoneInput,
    run: (context, input) =>
      withCurrentVersion(context, input.task_id, async (version) => {
        const task = await context.planner.setCompletion(
          context.userId,
          input.task_id,
          { completed: input.done, expectedVersion: version },
        );
        return { task_id: task.id, title: task.title, done: input.done };
      }),
  }),
  schedule_task: tool({
    description:
      "Move a task to another day, set or clear its time block, or take it off the planner. Its existing time block is cleared unless start_time is given.",
    input: scheduleTaskInput,
    run: (context, input) =>
      withCurrentVersion(context, input.task_id, async (version) => {
        const body = scheduleTaskSchema.parse({
          plannerDate: input.date,
          ...timeBlock(context, input.date, input),
          expectedVersion: version,
        });
        const { task, entry } = await context.planner.scheduleTask(
          context.userId,
          input.task_id,
          body,
        );
        return {
          task_id: task.id,
          title: task.title,
          date: entry?.plannerDate ?? null,
        };
      }),
  }),
  reorder_day: tool({
    description: "Change the order of tasks on one planner day.",
    input: reorderDayInput,
    run: (context, input) => reorderDay(context, input),
  }),
  delete_task: tool({
    description:
      "Delete a task. It can be brought back with restore_task for 30 days.",
    input: taskOnlyInput,
    run: (context, input) =>
      withCurrentVersion(context, input.task_id, async (version) => {
        const task = await context.planner.deleteTask(
          context.userId,
          input.task_id,
          version,
        );
        return { task_id: task.id, title: task.title, deleted: true };
      }),
  }),
  restore_task: tool({
    description: "Bring back a task deleted in the last 30 days.",
    input: taskOnlyInput,
    run: (context, input) =>
      withCurrentVersion(
        context,
        input.task_id,
        async (version) => {
          const task = await context.planner.restoreTask(
            context.userId,
            input.task_id,
            version,
          );
          return { task_id: task.id, title: task.title, restored: true };
        },
        { allowDeleted: true },
      ),
  }),
};

export const plannerTools: Anthropic.Beta.BetaTool[] = Object.entries(
  TOOL_SPECS,
).map(([name, spec]) => {
  const schema: Record<string, unknown> = z.toJSONSchema(spec.input, {
    io: "input",
  });
  delete schema.$schema;
  return {
    name,
    description: spec.description,
    input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
  };
});

/**
 * Runs one tool call. Planner errors (not found, validation, a conflict that
 * survived the retry) come back as an error result the model can explain;
 * anything else is a bug and propagates.
 */
export async function runPlannerTool(
  context: ToolContext,
  name: string,
  rawInput: unknown,
): Promise<ToolOutcome> {
  const spec = Object.hasOwn(TOOL_SPECS, name) ? TOOL_SPECS[name] : undefined;
  if (!spec) return { content: `Unknown tool: ${name}`, isError: true };

  const parsed = spec.input.safeParse(rawInput);
  if (!parsed.success) {
    return { content: z.prettifyError(parsed.error), isError: true };
  }

  try {
    const result = await spec.run(context, parsed.data);
    return { content: JSON.stringify(result), isError: false };
  } catch (error) {
    if (error instanceof PlannerError) {
      return { content: error.message, isError: true };
    }
    if (error instanceof z.ZodError) {
      return { content: z.prettifyError(error), isError: true };
    }
    throw error;
  }
}

async function listTasks(
  context: ToolContext,
  input: z.infer<typeof listTasksInput>,
) {
  const query = plannerRangeQuerySchema.parse({
    from: input.from,
    to: input.to ?? input.from,
    inbox: input.include_unscheduled ? "true" : "false",
  });
  const { entries, inbox } = await context.planner.listPlanner(
    context.userId,
    query,
  );

  const days = new Map<string, unknown[]>();
  for (const entry of entries) {
    if (entry.closedAt) continue;
    const tasks = days.get(entry.plannerDate) ?? [];
    tasks.push({
      task_id: entry.task.id,
      title: entry.task.title,
      done: entry.task.completedAt !== null,
      ...(entry.startsAt
        ? { start: localTime(entry.startsAt, context.timeZone) }
        : {}),
      ...(entry.endsAt
        ? { end: localTime(entry.endsAt, context.timeZone) }
        : {}),
      ...(entry.task.notes ? { notes: entry.task.notes.slice(0, 500) } : {}),
    });
    days.set(entry.plannerDate, tasks);
  }

  return {
    days: [...days].map(([date, tasks]) => ({ date, tasks })),
    ...(input.include_unscheduled
      ? {
          unscheduled: inbox.map((task) => ({
            task_id: task.id,
            title: task.title,
            done: task.completedAt !== null,
          })),
        }
      : {}),
  };
}

async function reorderDay(
  context: ToolContext,
  input: z.infer<typeof reorderDayInput>,
) {
  const { entries } = await context.planner.listPlanner(
    context.userId,
    plannerRangeQuerySchema.parse({ from: input.date, to: input.date }),
  );
  const open = entries.filter((entry) => !entry.closedAt);
  const entryByTask = new Map(open.map((entry) => [entry.task.id, entry.id]));

  const missing = input.task_ids.filter((id) => !entryByTask.has(id));
  if (missing.length > 0) {
    throw new NotFoundError(`Not on ${input.date}: ${missing.join(", ")}`);
  }

  const requested = new Set(input.task_ids);
  const orderedTaskIds = [
    ...input.task_ids,
    ...open.map((entry) => entry.task.id).filter((id) => !requested.has(id)),
  ];

  await context.planner.reorderPlanner(
    context.userId,
    reorderPlannerSchema.parse({
      plannerDate: input.date,
      orderedEntryIds: orderedTaskIds.map((id) => entryByTask.get(id)!),
    }),
  );

  const titleByTask = new Map(
    open.map((entry) => [entry.task.id, entry.task.title]),
  );
  return {
    date: input.date,
    order: orderedTaskIds.map((id) => titleByTask.get(id)),
  };
}

/**
 * Writes are guarded by the task's version. The model never sees versions, so
 * each write reads the current one first, and retries once if the task changed
 * in between (an edit from the web app, say).
 */
async function withCurrentVersion<T>(
  context: ToolContext,
  id: string,
  write: (version: number) => Promise<T>,
  { allowDeleted = false } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const task = await context.planner.findTask(context.userId, id);
    if (!task || (!allowDeleted && task.deletedAt)) throw new NotFoundError();

    try {
      return await write(task.version);
    } catch (error) {
      if (error instanceof ConflictError && attempt === 0) continue;
      throw error;
    }
  }
}

function timeBlock(
  context: ToolContext,
  date: string | null,
  input: { start_time?: string; end_time?: string },
) {
  if (!input.start_time && !input.end_time) {
    return { startsAt: null, endsAt: null };
  }
  if (!date) throw new ValidationError("A time needs a date");
  if (!input.start_time) {
    throw new ValidationError("An end time needs a start time");
  }

  return {
    startsAt: toIso(date, input.start_time, context.timeZone),
    endsAt: input.end_time
      ? toIso(date, input.end_time, context.timeZone)
      : null,
  };
}

function toIso(date: string, time: string, timeZone: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return zonedDateTimeToIso(date, hours * 60 + minutes, timeZone);
}

function localTime(timestamp: Date, timeZone: string) {
  const minutes = minutesInTimeZone(timestamp.toISOString(), timeZone);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
