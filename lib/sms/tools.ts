import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import {
  createApplicationSchema,
  type CreateApplicationInput,
} from "@/lib/applications/contracts";
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
import type { Application } from "@/lib/db/schema";

import { PostingUnreadableError, type PostingReader } from "./firecrawl";
import { settledGoalChanges, summarizeGoals } from "./goals";
import { clockTimeIn, dateIn, timeBlockOn, todayIn } from "./local-time";

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
  | "findActivePlannerDate"
  | "listMetrics"
>;

type TrackedApplication = Pick<
  Application,
  "applicationNumber" | "cycle" | "company" | "title" | "notes" | "appliedOn"
>;

/** The application tracker operations the SMS agent is allowed to perform. */
export type ApplicationOperations = {
  /**
   * The current cycle's applications, after pulling in rows added straight
   * to the spreadsheet, so a duplicate check sees those too.
   */
  list(
    userId: string,
    signal?: AbortSignal,
  ): Promise<{ cycle: string; applications: TrackedApplication[] }>;
  /** Creates one; `list` has just refreshed the cycle from the sheet. */
  create(
    userId: string,
    input: CreateApplicationInput,
    signal?: AbortSignal,
  ): Promise<TrackedApplication>;
  /** Absent when no Firecrawl key is configured. */
  readPosting?: PostingReader;
};

export type ToolContext = {
  planner: PlannerOperations;
  applications: ApplicationOperations;
  userId: string;
  timeZone: string;
  /** Overridable for tests; defaults to the clock and a real timer. */
  now?: () => Date;
  /**
   * Milliseconds left before the agent must reply. Slow outside calls (a
   * posting scrape, the spreadsheet mirror) are cut off when it runs out.
   */
  remainingMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
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

const getGoalsInput = z.object({
  date: calendarDate
    .optional()
    .describe("Show the goal periods containing this date; defaults to today"),
  include_history: z
    .boolean()
    .optional()
    .describe(
      "Also return counts for the seven periods before the current one",
    ),
});

const addApplicationInput = z.object({
  url: z
    .string()
    .max(2000)
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "Expected an http(s) link")
    .optional()
    .describe("Link to the job posting"),
  company: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("Only when the text names it; otherwise read from the link"),
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Job title. Only when the text names it; otherwise read from the link",
    ),
  applied_on: calendarDate.optional().describe("Defaults to today"),
  // Leaves room for the link within the tracker's 5,000-character notes.
  notes: z.string().max(2500).optional(),
});

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
        ...timeBlockOn(input.date ?? null, input, context.timeZone),
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
    description:
      "Mark a task done, or not done. The result lists any goal whose progress changed as a result, with its count before and after.",
    input: setDoneInput,
    run: (context, input) => setTaskDone(context, input),
  }),
  get_goals: tool({
    description:
      "List the owner's goals with progress for the current period (day, week or month): count, target, what remains, and whether it is met. A completed task counts toward a goal when its title matches one of the goal's keywords.",
    input: getGoalsInput,
    run: async (context, input) => {
      const result = await context.planner.listMetrics(context.userId, {
        anchor: input.date ?? today(context),
      });
      return {
        date: result.anchor,
        goals: summarizeGoals(result, {
          includeHistory: input.include_history ?? false,
        }),
      };
    },
  }),
  schedule_task: tool({
    description:
      "Move a task to another day, set or clear its time block, or take it off the planner. Its existing time block is cleared unless start_time is given.",
    input: scheduleTaskInput,
    run: (context, input) =>
      withCurrentVersion(context, input.task_id, async (version) => {
        const body = scheduleTaskSchema.parse({
          plannerDate: input.date,
          ...timeBlockOn(input.date, input, context.timeZone),
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
  add_application: tool({
    description:
      "Log a job application the owner has sent. Given a link, the company and job title are read from the posting; pass company or title only to fill in or correct what the posting says. An application already tracked under the same link, or the same company and title, is not added again.",
    input: addApplicationInput,
    run: (context, input) => addApplication(context, input),
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
    if (
      error instanceof PlannerError ||
      error instanceof PostingUnreadableError
    ) {
      return { content: error.message, isError: true };
    }
    if (error instanceof z.ZodError) {
      return { content: z.prettifyError(error), isError: true };
    }
    throw error;
  }
}

/**
 * Completes (or reopens) a task and reports how goal progress moved.
 *
 * A completed task counts toward its planner day, or the day it was completed
 * when it has none, so progress is compared for the period containing that
 * day rather than today: ticking off yesterday's task changes yesterday's
 * week. Progress is read before the write and again after it, re-reading a
 * few times over about a second and a half before concluding nothing moved.
 */
async function setTaskDone(
  context: ToolContext,
  input: z.infer<typeof setDoneInput>,
) {
  const { planner, userId } = context;
  const current = await planner.findTask(userId, input.task_id);
  if (!current || current.deletedAt) throw new NotFoundError();

  // Writing again would move completed_at to now, and a completed task's goal
  // credit with it: repeating "done" for yesterday's task must change nothing.
  if ((current.completedAt !== null) === input.done) {
    return {
      task_id: current.id,
      title: current.title,
      done: input.done,
      unchanged: true,
      goal_changes: [],
    };
  }

  const anchor =
    (await planner.findActivePlannerDate(userId, input.task_id)) ??
    (!input.done && current.completedAt
      ? dateIn(current.completedAt, context.timeZone)
      : today(context));

  // With no goals there is nothing to compare: skip the reads and the wait.
  const before = await planner.listMetrics(userId, { anchor });
  const tracked = before.metrics.length > 0;

  const task = await withCurrentVersion(context, input.task_id, (version) =>
    planner.setCompletion(userId, input.task_id, {
      completed: input.done,
      expectedVersion: version,
    }),
  );

  const goalChanges = tracked
    ? await settledGoalChanges(
        () => planner.listMetrics(userId, { anchor }),
        before,
        context.sleep,
      )
    : [];

  return {
    task_id: task.id,
    title: task.title,
    done: input.done,
    goal_changes: goalChanges,
  };
}

/**
 * Records an application, reading the company and title from the posting
 * when the text gives a link. Details stated in the text win over the page.
 * The link is kept in the notes, which is also how a repeat is recognised:
 * a link already tracked is reported before any scrape, so an expired posting
 * still answers "already tracked".
 */
async function addApplication(
  context: ToolContext,
  input: z.infer<typeof addApplicationInput>,
) {
  const { applications, userId } = context;
  const signal = untilDeadline(context);

  const { applications: tracked } = await applications.list(userId, signal);
  const sameLink = input.url
    ? tracked.find((application) => notesLink(application.notes, input.url!))
    : undefined;
  if (sameLink) {
    return { ...describeApplication(sameLink), already_tracked: true };
  }

  let { company, title } = input;
  if ((!company || !title) && input.url) {
    if (!applications.readPosting) {
      throw new ValidationError(
        "Links can't be read here; ask for the company and job title",
      );
    }
    const posting = await applications.readPosting(input.url, signal);
    company ??= posting.company ?? undefined;
    title ??= posting.title ?? undefined;
  }

  if (!company || !title) {
    const missing = [!company && "company", !title && "job title"]
      .filter(Boolean)
      .join(" and ");
    throw new ValidationError(
      input.url
        ? `The posting doesn't say the ${missing}; ask for it`
        : `Provide a link or the ${missing}`,
    );
  }

  const same = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;
  const sameRole = tracked.find(
    (application) =>
      same(application.company, company) && same(application.title, title),
  );
  if (sameRole) {
    return { ...describeApplication(sameRole), already_tracked: true };
  }

  // The tracker's own contract: rejects an impossible date (2026-02-30) here,
  // as an error the model can explain, rather than at the database.
  const body = createApplicationSchema.parse({
    company,
    title,
    appliedOn: input.applied_on ?? today(context),
    notes: [input.notes?.trim(), input.url].filter(Boolean).join("\n") || null,
  });
  return describeApplication(await applications.create(userId, body, signal));
}

/** Whether the notes hold this exact link, ignoring a trailing slash. */
function notesLink(notes: string | null, url: string) {
  const bare = (value: string) => value.replace(/\/+$/, "");
  return (notes ?? "")
    .split(/\s+/)
    .some((token) => token !== "" && bare(token) === bare(url));
}

function untilDeadline(context: ToolContext) {
  const remaining = context.remainingMs?.();
  return remaining === undefined
    ? undefined
    : AbortSignal.timeout(Math.max(0, remaining));
}

function describeApplication(application: TrackedApplication) {
  return {
    number: application.applicationNumber,
    cycle: application.cycle,
    company: application.company,
    title: application.title,
    applied_on: application.appliedOn,
  };
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
        ? { start: clockTimeIn(entry.startsAt, context.timeZone) }
        : {}),
      ...(entry.endsAt
        ? { end: clockTimeIn(entry.endsAt, context.timeZone) }
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

function today(context: ToolContext) {
  return todayIn(context.timeZone, context.now?.());
}
