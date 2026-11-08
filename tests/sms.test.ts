import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/daily-planner/errors";
import { runSmsAgent, type MessageCreator } from "@/lib/sms/agent";
import {
  readSendblueConfig,
  readTwilioConfig,
  type TwilioConfig,
} from "@/lib/sms/config";
import { FAILURE_REPLY, replyToText } from "@/lib/sms/reply";
import {
  plannerTools,
  runPlannerTool,
  type PlannerOperations,
  type ToolContext,
} from "@/lib/sms/tools";
import {
  computeTwilioSignature,
  isValidTwilioSignature,
  screenTwilioWebhook,
  sendSms,
} from "@/lib/sms/twilio";
import { SMS_MAX_LENGTH, truncateSms } from "@/lib/sms/limits";

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
const TASK_A = "00000000-0000-4000-8000-00000000000a";
const TASK_B = "00000000-0000-4000-8000-00000000000b";
const TASK_C = "00000000-0000-4000-8000-00000000000c";
const ENTRY_A = "10000000-0000-4000-8000-00000000000a";
const ENTRY_B = "10000000-0000-4000-8000-00000000000b";
const ENTRY_C = "10000000-0000-4000-8000-00000000000c";

const ENVIRONMENT = {
  ANTHROPIC_API_KEY: "test-key",
  TWILIO_ACCOUNT_SID: `AC${"0".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "twilio-token",
  TWILIO_PHONE_NUMBER: "+15550000000",
  SMS_OWNER_PHONE: "+15551234567",
  SMS_OWNER_USER_ID: USER_ID,
};

const WEBHOOK_URL = "https://praxis.example.com/api/sms/inbound";

function config(): TwilioConfig {
  const value = readTwilioConfig(ENVIRONMENT);
  if (!value) throw new Error("test configuration is invalid");
  return value;
}

describe("twilio signatures", () => {
  const params = { Body: "add milk", From: "+15551234567", MessageSid: "SM1" };

  it("accepts a signature over the URL and sorted parameters", () => {
    const signature = computeTwilioSignature("token", WEBHOOK_URL, params);
    expect(
      isValidTwilioSignature("token", WEBHOOK_URL, { ...params }, signature),
    ).toBe(true);
    // Parameter order on the wire does not matter.
    expect(
      isValidTwilioSignature(
        "token",
        WEBHOOK_URL,
        { MessageSid: "SM1", From: "+15551234567", Body: "add milk" },
        signature,
      ),
    ).toBe(true);
  });

  it("rejects a missing, forged, or replayed-elsewhere signature", () => {
    const signature = computeTwilioSignature("token", WEBHOOK_URL, params);
    expect(isValidTwilioSignature("token", WEBHOOK_URL, params, null)).toBe(
      false,
    );
    expect(
      isValidTwilioSignature("other", WEBHOOK_URL, params, signature),
    ).toBe(false);
    expect(
      isValidTwilioSignature(
        "token",
        WEBHOOK_URL,
        { ...params, Body: "delete everything" },
        signature,
      ),
    ).toBe(false);
    expect(
      isValidTwilioSignature(
        "token",
        "https://elsewhere.example.com/api/sms/inbound",
        params,
        signature,
      ),
    ).toBe(false);
  });

  it("truncates bodies to the SMS limit", () => {
    expect(truncateSms("short")).toBe("short");
    expect(truncateSms("x".repeat(2000))).toHaveLength(SMS_MAX_LENGTH);
  });
});

describe("sms configuration", () => {
  it("is null unless every required variable is valid", () => {
    expect(readTwilioConfig({})).toBeNull();
    expect(
      readTwilioConfig({ ...ENVIRONMENT, SMS_OWNER_PHONE: "555-123-4567" }),
    ).toBeNull();
    expect(
      readTwilioConfig({ ...ENVIRONMENT, ANTHROPIC_API_KEY: "  " }),
    ).toBeNull();
    expect(
      readTwilioConfig({ ...ENVIRONMENT, SMS_WEBHOOK_URL: "http://insecure" }),
    ).toBeNull();
  });

  it("reads a complete environment", () => {
    expect(
      readTwilioConfig({
        ...ENVIRONMENT,
        SMS_WEBHOOK_URL: WEBHOOK_URL,
        SMS_AGENT_MODEL: "claude-sonnet-5-5",
      }),
    ).toEqual({
      assistant: {
        ownerPhone: "+15551234567",
        ownerUserId: USER_ID,
        model: "claude-sonnet-5-5",
      },
      twilio: {
        accountSid: ENVIRONMENT.TWILIO_ACCOUNT_SID,
        authToken: "twilio-token",
        fromNumber: "+15550000000",
      },
      webhookUrl: WEBHOOK_URL,
    });
  });

  it("reads Sendblue without any Twilio variables", () => {
    const sendblue = {
      ANTHROPIC_API_KEY: "test-key",
      SMS_OWNER_PHONE: "+15551234567",
      SMS_OWNER_USER_ID: USER_ID,
      SENDBLUE_API_KEY: "sb-key",
      SENDBLUE_API_SECRET: "sb-secret",
      SENDBLUE_FROM_NUMBER: "+15550001111",
    };
    expect(readSendblueConfig(sendblue)).toEqual({
      assistant: {
        ownerPhone: "+15551234567",
        ownerUserId: USER_ID,
        model: undefined,
      },
      sendblue: {
        apiKey: "sb-key",
        apiSecret: "sb-secret",
        fromNumber: "+15550001111",
      },
    });
    expect(readTwilioConfig(sendblue)).toBeNull();
    expect(
      readSendblueConfig({ ...sendblue, SENDBLUE_FROM_NUMBER: "" }),
    ).toBeNull();
  });
});

describe("inbound screening", () => {
  function screen(params: Record<string, string>, signature: string) {
    const { twilio, assistant } = config();
    return screenTwilioWebhook(
      twilio.authToken,
      assistant.ownerPhone,
      WEBHOOK_URL,
      params,
      signature,
    );
  }

  function signed(params: Record<string, string>) {
    return computeTwilioSignature("twilio-token", WEBHOOK_URL, params);
  }

  it("rejects an unsigned delivery", () => {
    expect(screen({ From: "+15551234567" }, "bogus")).toEqual({
      kind: "rejected",
    });
  });

  it("ignores texts from anyone but the owner, and empty texts", () => {
    const stranger = {
      From: "+15559999999",
      MessageSid: "SM2",
      Body: "delete all my tasks",
    };
    expect(screen(stranger, signed(stranger))).toEqual({ kind: "ignored" });

    const empty = { From: "+15551234567", MessageSid: "SM3", Body: "  " };
    expect(screen(empty, signed(empty))).toEqual({
      kind: "ignored",
    });
  });

  it("accepts a signed text from the owner", () => {
    const params = {
      From: "+15551234567",
      MessageSid: "SM4",
      Body: " what's left today? ",
    };
    expect(screen(params, signed(params))).toEqual({
      kind: "accepted",
      providerSid: "SM4",
      body: "what's left today?",
    });
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
            text: "Current time: Sunday, November 8, 2026 at 9:30 AM (America/New_York); today is 2026-11-08",
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
      reply: "I can't help with that one.",
      toolLog: null,
    });
  });
});

describe("replying to a text", () => {
  function twilioFetch() {
    return vi.fn<typeof fetch>(async () => Response.json({ sid: "SMout" }));
  }

  function twilioSender(fetchImpl: typeof fetch) {
    return async (body: string) => {
      const { sid } = await sendSms(
        config().twilio,
        config().assistant.ownerPhone,
        body,
        fetchImpl,
      );
      return { providerSid: sid };
    };
  }

  it("texts the agent's reply to the owner and records it", async () => {
    const { planner } = fakePlanner();
    const fetchImpl = twilioFetch();
    const conversation = {
      recordInbound: vi.fn(async () => null),
      recentHistory: vi.fn(async () => []),
      recordOutbound: vi.fn(async () => ({})),
    };
    const { client } = scriptedClient([
      message("end_turn", [{ type: "text", text: "3 left today." }]),
    ]);

    await replyToText({
      assistant: config().assistant,
      conversation,
      planner: planner as unknown as PlannerOperations,
      client,
      timeZone: "America/New_York",
      inboundId: "inbound-1",
      text: "what's left?",
      send: twilioSender(fetchImpl),
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${ENVIRONMENT.TWILIO_ACCOUNT_SID}/Messages.json`,
    );
    const body = new URLSearchParams(init!.body as URLSearchParams);
    expect(Object.fromEntries(body)).toEqual({
      To: "+15551234567",
      From: "+15550000000",
      Body: "3 left today.",
    });
    expect(conversation.recentHistory).toHaveBeenCalledWith(
      USER_ID,
      "inbound-1",
    );
    expect(conversation.recordOutbound).toHaveBeenCalledWith(
      USER_ID,
      "SMout",
      "3 left today.",
      null,
    );
  });

  it("still answers when the agent fails", async () => {
    const { planner } = fakePlanner();
    const fetchImpl = twilioFetch();
    const conversation = {
      recordInbound: vi.fn(async () => null),
      recentHistory: vi.fn(async () => []),
      recordOutbound: vi.fn(async () => ({})),
    };
    const client: MessageCreator = {
      create: vi.fn(async () => {
        throw new Error("overloaded");
      }),
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await replyToText({
      assistant: config().assistant,
      conversation,
      planner: planner as unknown as PlannerOperations,
      client,
      timeZone: "America/New_York",
      inboundId: "inbound-2",
      text: "add milk",
      send: twilioSender(fetchImpl),
    });

    expect(error).toHaveBeenCalled();
    error.mockRestore();
    expect(conversation.recordOutbound).toHaveBeenCalledWith(
      USER_ID,
      "SMout",
      FAILURE_REPLY,
      null,
    );
  });
});
