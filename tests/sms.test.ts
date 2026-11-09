import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/daily-planner/errors";
import { REPLIES, runSmsAgent, type MessageCreator } from "@/lib/sms/agent";
import { readAssistantConfig, type AssistantConfig } from "@/lib/sms/config";
import {
  firecrawlPostingReader,
  type JobPosting,
  type PostingReader,
} from "@/lib/sms/firecrawl";
import { SMS_MAX_LENGTH, truncateSms } from "@/lib/sms/limits";
import {
  plannerTools,
  runPlannerTool,
  type ApplicationOperations,
  type PlannerOperations,
  type ToolContext,
} from "@/lib/sms/tools";

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
const TASK_A = "00000000-0000-4000-8000-00000000000a";
const TASK_B = "00000000-0000-4000-8000-00000000000b";
const TASK_C = "00000000-0000-4000-8000-00000000000c";
const ENTRY_A = "10000000-0000-4000-8000-00000000000a";
const ENTRY_B = "10000000-0000-4000-8000-00000000000b";
const ENTRY_C = "10000000-0000-4000-8000-00000000000c";

const ENVIRONMENT = {
  ANTHROPIC_API_KEY: "test-key",
  SMS_OWNER_PHONE: "+15551234567",
  SMS_OWNER_USER_ID: USER_ID,
  SENDBLUE_API_KEY: "sb-key",
  SENDBLUE_API_SECRET: "sb-secret",
  SENDBLUE_FROM_NUMBER: "+15550001111",
};

const ASSISTANT: AssistantConfig = {
  ownerPhone: "+15551234567",
  ownerUserId: USER_ID,
  model: undefined,
  firecrawlApiKey: undefined,
  sendblue: {
    apiKey: "sb-key",
    apiSecret: "sb-secret",
    fromNumber: "+15550001111",
  },
};

describe("message limits", () => {
  it("truncates bodies to the SMS limit", () => {
    expect(truncateSms("short")).toBe("short");
    expect(truncateSms("x".repeat(2000))).toHaveLength(SMS_MAX_LENGTH);
  });
});

describe("configuration", () => {
  it("reads a complete environment", () => {
    expect(
      readAssistantConfig({
        ...ENVIRONMENT,
        SMS_AGENT_MODEL: "claude-sonnet-5-5",
        FIRECRAWL_API_KEY: "fc-key",
      }),
    ).toEqual({
      ...ASSISTANT,
      model: "claude-sonnet-5-5",
      firecrawlApiKey: "fc-key",
    });
  });

  it("is null unless every required variable is valid", () => {
    expect(readAssistantConfig({})).toBeNull();
    expect(
      readAssistantConfig({ ...ENVIRONMENT, SMS_OWNER_PHONE: "555-123-4567" }),
    ).toBeNull();
    // A blank value counts as missing, as an empty line in .env reads.
    expect(
      readAssistantConfig({ ...ENVIRONMENT, ANTHROPIC_API_KEY: "  " }),
    ).toBeNull();
    expect(
      readAssistantConfig({ ...ENVIRONMENT, SENDBLUE_FROM_NUMBER: "" }),
    ).toBeNull();
  });
});

type FakeTask = {
  id: string;
  title: string;
  notes: string | null;
  completedAt: Date | null;
  deletedAt: Date | null;
  version: number;
};

type FakeEntry = {
  id: string;
  taskId: string;
  plannerDate: string;
  position: number;
  startsAt: Date | null;
  endsAt: Date | null;
};

/** An in-memory stand-in for the slice of the planner service tools use. */
function fakePlanner() {
  const tasks = new Map<string, FakeTask>();
  const entries: FakeEntry[] = [];

  const add = (
    id: string,
    entryId: string,
    title: string,
    position: number,
  ) => {
    tasks.set(id, {
      id,
      title,
      notes: null,
      completedAt: null,
      deletedAt: null,
      version: 1,
    });
    entries.push({
      id: entryId,
      taskId: id,
      plannerDate: "2026-11-08",
      position,
      startsAt: null,
      endsAt: null,
    });
  };
  add(TASK_A, ENTRY_A, "Laundry", 1024);
  add(TASK_B, ENTRY_B, "Essay draft", 2048);
  add(TASK_C, ENTRY_C, "Gym", 3072);

  const requireVersion = (id: string, expected: number) => {
    const task = tasks.get(id);
    if (!task) throw new Error("missing");
    if (task.version !== expected) throw new ConflictError();
    task.version += 1;
    return task;
  };

  const planner = {
    listPlanner: vi.fn(
      async (_userId: string, query: { from: string; to: string }) => ({
        entries: entries
          .filter(
            (entry) =>
              entry.plannerDate >= query.from &&
              entry.plannerDate <= query.to &&
              !tasks.get(entry.taskId)!.deletedAt,
          )
          .sort((a, b) => a.position - b.position)
          .map((entry) => ({
            ...entry,
            closedAt: null,
            task: tasks.get(entry.taskId)!,
          })),
        inbox: [],
      }),
    ),
    createTask: vi.fn(
      async (_userId: string, input: Record<string, unknown>) => ({
        task: { id: TASK_C, title: input.title },
        entry: input.plannerDate ? { plannerDate: input.plannerDate } : null,
      }),
    ),
    updateTask: vi.fn(
      async (
        _userId: string,
        id: string,
        input: { title?: string; expectedVersion: number },
      ) => {
        const task = requireVersion(id, input.expectedVersion);
        if (input.title) task.title = input.title;
        return task;
      },
    ),
    setCompletion: vi.fn(
      async (
        _userId: string,
        id: string,
        input: { completed: boolean; expectedVersion: number },
      ) => {
        const task = requireVersion(id, input.expectedVersion);
        task.completedAt = input.completed ? new Date() : null;
        return task;
      },
    ),
    scheduleTask: vi.fn(
      async (
        _userId: string,
        id: string,
        input: { plannerDate: string | null; expectedVersion: number },
      ) => ({
        task: requireVersion(id, input.expectedVersion),
        entry: input.plannerDate ? { plannerDate: input.plannerDate } : null,
      }),
    ),
    reorderPlanner: vi.fn(
      async (_userId: string, input: { orderedEntryIds: string[] }) => input,
    ),
    deleteTask: vi.fn(async (_userId: string, id: string, version: number) => {
      const task = requireVersion(id, version);
      task.deletedAt = new Date();
      return task;
    }),
    restoreTask: vi.fn(async (_userId: string, id: string, version: number) => {
      const task = requireVersion(id, version);
      task.deletedAt = null;
      return task;
    }),
    findTask: vi.fn(async (_userId: string, id: string) => tasks.get(id)),
    findActivePlannerDate: vi.fn(
      async (_userId: string, id: string) =>
        entries.find((entry) => entry.taskId === id)?.plannerDate ?? null,
    ),
    listMetrics: vi.fn(async (_userId: string, query: { anchor: string }) => ({
      anchor: query.anchor,
      metrics: [] as unknown[],
    })),
  };

  return {
    tasks,
    planner,
    context: {
      planner: planner as unknown as PlannerOperations,
      applications: {} as ApplicationOperations,
      userId: USER_ID,
      timeZone: "America/New_York",
    } satisfies ToolContext,
  };
}

describe("planner tools", () => {
  it("describes every tool with an object schema", () => {
    expect(plannerTools.map((tool) => tool.name)).toEqual([
      "list_tasks",
      "add_task",
      "update_task",
      "set_task_done",
      "get_goals",
      "schedule_task",
      "reorder_day",
      "delete_task",
      "add_application",
      "restore_task",
    ]);
    for (const tool of plannerTools) {
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema).not.toHaveProperty("$schema");
    }
  });

  it("lists a day in planner order", async () => {
    const { context } = fakePlanner();
    const outcome = await runPlannerTool(context, "list_tasks", {
      from: "2026-11-08",
    });
    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.content)).toEqual({
      days: [
        {
          date: "2026-11-08",
          tasks: [
            { task_id: TASK_A, title: "Laundry", done: false },
            { task_id: TASK_B, title: "Essay draft", done: false },
            { task_id: TASK_C, title: "Gym", done: false },
          ],
        },
      ],
    });
  });

  it("converts local times in the owner's zone when adding", async () => {
    const { context, planner } = fakePlanner();
    const outcome = await runPlannerTool(context, "add_task", {
      title: "Call dentist",
      date: "2026-11-09",
      start_time: "15:00",
      end_time: "15:30",
    });
    expect(outcome.isError).toBe(false);
    // 3pm Eastern on 9 November is after the DST change, so UTC-5.
    expect(planner.createTask).toHaveBeenCalledWith(USER_ID, {
      title: "Call dentist",
      plannerDate: "2026-11-09",
      startsAt: "2026-11-09T20:00:00.000Z",
      endsAt: "2026-11-09T20:30:00.000Z",
    });
  });

  it("refuses a time without a date", async () => {
    const { context, planner } = fakePlanner();
    const outcome = await runPlannerTool(context, "add_task", {
      title: "Call dentist",
      start_time: "15:00",
    });
    expect(outcome).toEqual({ content: "A time needs a date", isError: true });
    expect(planner.createTask).not.toHaveBeenCalled();
  });

  it("reports malformed input instead of calling the planner", async () => {
    const { context, planner } = fakePlanner();
    const outcome = await runPlannerTool(context, "set_task_done", {
      task_id: "laundry",
      done: true,
    });
    expect(outcome.isError).toBe(true);
    expect(planner.setCompletion).not.toHaveBeenCalled();

    expect(await runPlannerTool(context, "drop_table", {})).toEqual({
      content: "Unknown tool: drop_table",
      isError: true,
    });
  });

  it("writes with the current version and retries once after a conflict", async () => {
    const { context, planner, tasks } = fakePlanner();
    const original = planner.setCompletion.getMockImplementation()!;
    // Simulate an edit from the web app landing between the read and write.
    planner.setCompletion.mockImplementationOnce(async (...args) => {
      tasks.get(TASK_A)!.version += 1;
      return original(...args);
    });

    const outcome = await runPlannerTool(context, "set_task_done", {
      task_id: TASK_A,
      done: true,
    });
    expect(outcome.isError).toBe(false);
    expect(planner.setCompletion).toHaveBeenCalledTimes(2);
    expect(tasks.get(TASK_A)!.completedAt).not.toBeNull();
  });

  it("reorders a day, keeping unmentioned tasks after the named ones", async () => {
    const { context, planner } = fakePlanner();
    const outcome = await runPlannerTool(context, "reorder_day", {
      date: "2026-11-08",
      task_ids: [TASK_C],
    });
    expect(outcome.isError).toBe(false);
    expect(planner.reorderPlanner).toHaveBeenCalledWith(USER_ID, {
      plannerDate: "2026-11-08",
      orderedEntryIds: [ENTRY_C, ENTRY_A, ENTRY_B],
    });
    expect(JSON.parse(outcome.content).order).toEqual([
      "Gym",
      "Laundry",
      "Essay draft",
    ]);
  });

  it("deletes and restores a task", async () => {
    const { context, tasks } = fakePlanner();
    await runPlannerTool(context, "delete_task", { task_id: TASK_B });
    expect(tasks.get(TASK_B)!.deletedAt).not.toBeNull();

    // A deleted task is gone for every tool except restore.
    expect(
      (
        await runPlannerTool(context, "set_task_done", {
          task_id: TASK_B,
          done: true,
        })
      ).isError,
    ).toBe(true);

    const restored = await runPlannerTool(context, "restore_task", {
      task_id: TASK_B,
    });
    expect(restored.isError).toBe(false);
    expect(tasks.get(TASK_B)!.deletedAt).toBeNull();
  });
});

function message(
  stopReason: Anthropic.Beta.BetaStopReason,
  content: unknown[],
): Anthropic.Beta.BetaMessage {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    stop_reason: stopReason,
    content,
  } as unknown as Anthropic.Beta.BetaMessage;
}

function scriptedClient(responses: Anthropic.Beta.BetaMessage[]) {
  const requests: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const client: MessageCreator = {
    create: vi.fn(async (params) => {
      // Snapshot: the agent keeps appending to the same array.
      requests.push(structuredClone(params));
      const next = responses.shift();
      if (!next) throw new Error("no scripted response left");
      return next;
    }),
  };
  return { client, requests };
}

type FakeApplication = Awaited<ReturnType<ApplicationOperations["create"]>>;

/** An in-memory tracker, with a posting reader that answers per link. */
function fakeTracker(postings: Record<string, JobPosting | Error> = {}) {
  const tracked: FakeApplication[] = [
    {
      applicationNumber: 1,
      cycle: "S27",
      company: "Stripe",
      title: "Software Engineer Intern",
      notes: "https://stripe.com/jobs/1",
      appliedOn: "2026-11-01",
    },
  ];
  const readPosting = vi.fn<PostingReader>(async (url) => {
    const posting = postings[url];
    if (!posting) throw new Error(`unexpected read of ${url}`);
    if (posting instanceof Error) throw posting;
    return posting;
  });
  const applications = {
    list: vi.fn(async () => ({ cycle: "S27", applications: tracked })),
    create: vi.fn(
      async (
        _userId: string,
        input: Parameters<ApplicationOperations["create"]>[1],
      ) => {
        const application = {
          applicationNumber: tracked.length + 1,
          cycle: "S27",
          company: input.company,
          title: input.title,
          notes: input.notes ?? null,
          appliedOn: input.appliedOn,
        };
        tracked.push(application);
        return application;
      },
    ),
    readPosting,
  };
  const context: ToolContext = {
    ...fakePlanner().context,
    applications,
    now: () => new Date("2026-11-09T15:00:00Z"),
  };
  return { applications, context, readPosting, tracked };
}

describe("application tool", () => {
  const LINK = "https://jobs.example.com/figma/123";

  it("reads the company and title from the link and logs it for today", async () => {
    const { context, applications } = fakeTracker({
      [LINK]: { company: "Figma", title: "Product Design Intern" },
    });
    const outcome = await runPlannerTool(context, "add_application", {
      url: LINK,
    });
    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.content)).toEqual({
      number: 2,
      cycle: "S27",
      company: "Figma",
      title: "Product Design Intern",
      applied_on: "2026-11-09",
    });
    expect(applications.create).toHaveBeenCalledWith(USER_ID, {
      company: "Figma",
      title: "Product Design Intern",
      appliedOn: "2026-11-09",
      notes: LINK,
    });
  });

  it("lets details stated in the text fill in or override the posting", async () => {
    const { context, applications, readPosting } = fakeTracker({
      [LINK]: { company: "Figma", title: null },
    });
    await runPlannerTool(context, "add_application", {
      url: LINK,
      title: "Design Intern",
      notes: "referral from sam",
    });
    expect(readPosting).toHaveBeenCalledOnce();
    expect(applications.create.mock.calls[0][1]).toMatchObject({
      company: "Figma",
      title: "Design Intern",
      notes: `referral from sam\n${LINK}`,
    });

    // With both stated, the page is not read at all.
    await runPlannerTool(context, "add_application", {
      url: "https://jobs.example.com/other",
      company: "Notion",
      title: "SWE Intern",
    });
    expect(readPosting).toHaveBeenCalledOnce();
  });

  it("does not log the same application twice", async () => {
    const { context, applications } = fakeTracker({
      "https://stripe.com/jobs/1": { company: "Stripe", title: "Other" },
    });
    for (const input of [
      { url: "https://stripe.com/jobs/1", company: "x", title: "y" },
      { company: "stripe", title: "software engineer intern" },
    ]) {
      const outcome = await runPlannerTool(context, "add_application", input);
      expect(JSON.parse(outcome.content)).toMatchObject({
        number: 1,
        already_tracked: true,
      });
    }
    expect(applications.create).not.toHaveBeenCalled();
  });

  it("asks for what the posting does not say, or when it cannot be read", async () => {
    const { PostingUnreadableError } = await import("@/lib/sms/firecrawl");
    const broken = "https://jobs.example.com/broken";
    const { context, applications } = fakeTracker({
      [LINK]: { company: "Figma", title: null },
      [broken]: new PostingUnreadableError(
        "Firecrawl answered 500 for the posting",
      ),
    });

    const partial = await runPlannerTool(context, "add_application", {
      url: LINK,
    });
    expect(partial).toEqual({
      isError: true,
      content: "The posting doesn't say the job title; ask for it",
    });

    const unreadable = await runPlannerTool(context, "add_application", {
      url: broken,
    });
    expect(unreadable).toEqual({
      isError: true,
      content: "Firecrawl answered 500 for the posting",
    });

    const nothing = await runPlannerTool(context, "add_application", {});
    expect(nothing.isError).toBe(true);
    expect(applications.create).not.toHaveBeenCalled();
  });

  it("refuses a link alone when no reader is configured", async () => {
    const { context } = fakeTracker();
    const outcome = await runPlannerTool(
      {
        ...context,
        applications: { ...context.applications, readPosting: undefined },
      },
      "add_application",
      { url: LINK },
    );
    expect(outcome).toEqual({
      isError: true,
      content: "Links can't be read here; ask for the company and job title",
    });
  });

  it("rejects a link that is not http(s)", async () => {
    const { context } = fakeTracker();
    const outcome = await runPlannerTool(context, "add_application", {
      url: "javascript:alert(1)",
    });
    expect(outcome.isError).toBe(true);
  });
});

describe("firecrawl posting reader", () => {
  const LINK = "https://jobs.example.com/figma/123";

  it("asks Firecrawl for the company and title and tidies them", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        success: true,
        data: {
          json: { company: "  Figma ", title: "Product\n Design   Intern" },
        },
      }),
    );
    const read = firecrawlPostingReader("fc-key", fetchImpl);
    expect(await read(LINK)).toEqual({
      company: "Figma",
      title: "Product Design Intern",
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer fc-key",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.url).toBe(LINK);
    expect(body.formats[0]).toMatchObject({ type: "json" });
    expect(body.formats[0].schema.properties).toHaveProperty("company");
  });

  it("reads missing fields as null", async () => {
    const read = firecrawlPostingReader("fc-key", async () =>
      Response.json({
        success: true,
        data: { json: { company: "", title: null } },
      }),
    );
    expect(await read(LINK)).toEqual({ company: null, title: null });
  });

  it("fails readably on an error status, a bad body, or a network failure", async () => {
    const cases: Array<[typeof fetch, string]> = [
      [
        async () => new Response("nope", { status: 402 }),
        "Firecrawl answered 402 for the posting",
      ],
      [
        async () => Response.json({ success: false }),
        "Firecrawl returned no posting details",
      ],
      [
        async () => {
          throw new TypeError("fetch failed");
        },
        "Could not reach the posting: fetch failed",
      ],
    ];
    for (const [fetchImpl, message] of cases) {
      await expect(
        firecrawlPostingReader("fc-key", fetchImpl)(LINK),
      ).rejects.toThrow(message);
    }
  });
});

describe("sms agent", () => {
  const now = new Date("2026-11-08T14:30:00Z");

  it("runs tool calls and returns the final text with a tool log", async () => {
    const { context, tasks } = fakePlanner();
    const { client, requests } = scriptedClient([
      message("tool_use", [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "set_task_done",
          input: { task_id: TASK_A, done: true },
        },
      ]),
      message("end_turn", [{ type: "text", text: "Marked Laundry done." }]),
    ]);

    const result = await runSmsAgent({
      client,
      context,
      history: [],
      text: "done with laundry",
      now,
    });

    expect(result.reply).toBe("Marked Laundry done.");
    expect(result.toolLog).toContain(`set_task_done {"task_id":"${TASK_A}"`);
    expect(tasks.get(TASK_A)!.completedAt).not.toBeNull();

    const [first, second] = requests;
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.fallbacks).toBe("default");
    expect(first.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Today is Sunday, November 8, 2026 (2026-11-08)",
          },
          { type: "text", text: "done with laundry" },
        ],
      },
    ]);
    expect(second.messages.at(-1)).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: expect.stringContaining('"done":true'),
        },
      ],
    });
  });

  it("returns tool errors to the model rather than failing", async () => {
    const { context } = fakePlanner();
    const { client, requests } = scriptedClient([
      message("tool_use", [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "delete_task",
          input: { task_id: "00000000-0000-4000-8000-0000000000ff" },
        },
      ]),
      message("end_turn", [{ type: "text", text: "I couldn't find that." }]),
    ]);

    const result = await runSmsAgent({
      client,
      context,
      history: [],
      text: "delete the thing",
      now,
    });
    expect(result.reply).toBe("I couldn't find that.");
    expect(requests[1].messages.at(-1)).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: "Resource not found",
          is_error: true,
        },
      ],
    });
  });

  it("feeds history back with its tool log and drops a leading reply", async () => {
    const { context } = fakePlanner();
    const { client, requests } = scriptedClient([
      message("end_turn", [{ type: "text", text: "Restored." }]),
    ]);

    await runSmsAgent({
      client,
      context,
      history: [
        { direction: "outbound", body: "orphaned reply", toolLog: null },
        { direction: "inbound", body: "drop the essay", toolLog: null },
        {
          direction: "outbound",
          body: "Deleted Essay draft.",
          toolLog: `delete_task {"task_id":"${TASK_B}"} -> {}`,
        },
      ],
      text: "undo",
      now,
    });

    expect(requests[0].messages.slice(0, 2)).toEqual([
      { role: "user", content: "drop the essay" },
      {
        role: "assistant",
        content: `Deleted Essay draft.\n\n[Tool log]\ndelete_task {"task_id":"${TASK_B}"} -> {}`,
      },
    ]);
  });

  it("replies that time ran out once the deadline has passed", async () => {
    const { context } = fakePlanner();
    const { client } = scriptedClient([]);
    expect(
      await runSmsAgent({
        client,
        context,
        history: [],
        text: "add milk",
        now,
        deadline: 1_000,
        clock: () => 1_000,
      }),
    ).toEqual({
      reply: REPLIES.outOfTime,
      toolLog: null,
    });
    expect(client.create).not.toHaveBeenCalled();
  });

  it("cuts a call off at the deadline and keeps the log of what changed", async () => {
    const { context, tasks } = fakePlanner();
    let calls = 0;
    const client: MessageCreator = {
      create: vi.fn(async (_params, options) => {
        calls += 1;
        if (calls === 1) {
          return message("tool_use", [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "set_task_done",
              input: { task_id: TASK_A, done: true },
            },
          ]);
        }
        // The second call hangs until its signal fires.
        return new Promise<never>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        });
      }),
    };

    const result = await runSmsAgent({
      client,
      context,
      history: [],
      text: "done with laundry, then something slow",
      now,
      deadline: Date.now() + 50,
    });

    expect(result.reply).toBe(REPLIES.outOfTime);
    expect(result.toolLog).toContain("set_task_done");
    expect(tasks.get(TASK_A)!.completedAt).not.toBeNull();
  });

  it("answers a refusal without reading its content", async () => {
    const { context } = fakePlanner();
    const { client } = scriptedClient([message("refusal", [])]);
    const result = await runSmsAgent({
      client,
      context,
      history: [],
      text: "…",
      now,
    });
    expect(result).toEqual({
      reply: REPLIES.refused,
      toolLog: null,
    });
  });
});
