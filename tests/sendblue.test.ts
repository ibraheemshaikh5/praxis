import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import type { MessageCreator } from "@/lib/sms/agent";
import type { AssistantConfig } from "@/lib/sms/config";
import { FAILURE_REPLY, POLL_LOOKBACK_MS, pollSendblue } from "@/lib/sms/poll";
import { sendblueLine } from "@/lib/sms/sendblue";
import type { PlannerOperations } from "@/lib/sms/tools";
import type { ConversationStore } from "@/lib/sms/types";

const OWNER = "+15551234567";
const LINE = "+15550001111";
const USER_ID = "00000000-0000-4000-8000-0000000000b1";
const NOW = new Date("2026-11-08T14:30:00Z");

const CONFIG: AssistantConfig = {
  ownerPhone: OWNER,
  ownerUserId: USER_ID,
  model: undefined,
  sendblue: { apiKey: "sb-key", apiSecret: "sb-secret", fromNumber: LINE },
};

function inbound(handle: string, content: string, extra: object = {}) {
  return {
    message_handle: handle,
    content,
    is_outbound: false,
    from_number: OWNER,
    number: OWNER,
    to_number: LINE,
    sendblue_number: LINE,
    message_type: "message",
    status: "RECEIVED",
    service: "iMessage",
    ...extra,
  };
}

/**
 * Answers the list endpoint with the given rows and the send endpoint with a
 * handle, recording what was sent.
 */
function sendblueFetch(rows: unknown[], sendStatus = 200) {
  const sent: Record<string, unknown>[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v2/messages") {
      return Response.json({ status: "OK", data: rows });
    }
    if (url.pathname === "/api/send-message") {
      const body = JSON.parse(String(init!.body));
      sent.push(body);
      return Response.json(
        { message_handle: `out-${sent.length}`, status: "QUEUED" },
        { status: sendStatus },
      );
    }
    return new Response("not found", { status: 404 });
  });
  return { fetchImpl, sent };
}

describe("sendblue client", () => {
  it("asks for the owner's inbound texts to the line since a time", async () => {
    const { fetchImpl } = sendblueFetch([]);
    await sendblueLine(CONFIG.sendblue, OWNER, fetchImpl).listInboundTexts(NOW);

    const [input, init] = fetchImpl.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe(
      "https://api.sendblue.com/api/v2/messages",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      is_outbound: "false",
      sendblue_number: LINE,
      from_number: OWNER,
      message_type: "message",
      created_at_gte: NOW.toISOString(),
      order_by: "createdAt",
      order_direction: "asc",
      limit: "50",
    });
    expect(init!.headers).toEqual({
      "sb-api-key-id": "sb-key",
      "sb-api-secret-key": "sb-secret",
    });
  });

  it("keeps only the owner's own texts, whatever the filter returned", async () => {
    const { fetchImpl } = sendblueFetch([
      inbound("a", "add milk"),
      inbound("b", "delete everything", { from_number: "+15559999999" }),
      inbound("c", "Done.", { is_outbound: true }),
      inbound("d", "Loved “Done.”", { is_reaction: true }),
      inbound("e", "group chat", { message_type: "group" }),
      inbound("f", "other line", { sendblue_number: "+15550002222" }),
      inbound("g", "   "),
      { not: "a message" },
      inbound("h", " what's left? "),
    ]);

    expect(
      await sendblueLine(CONFIG.sendblue, OWNER, fetchImpl).listInboundTexts(
        NOW,
      ),
    ).toEqual([
      { handle: "a", body: "add milk" },
      { handle: "h", body: "what's left?" },
    ]);
  });

  it("fails loudly when the list request fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response("Unauthorized", { status: 401 }),
    );
    await expect(
      sendblueLine(CONFIG.sendblue, OWNER, fetchImpl).listInboundTexts(NOW),
    ).rejects.toThrow("Sendblue list failed (401)");
  });

  it("sends from the line, as the free plan requires", async () => {
    const { fetchImpl, sent } = sendblueFetch([]);
    expect(
      await sendblueLine(CONFIG.sendblue, OWNER, fetchImpl).send("Added milk."),
    ).toEqual({ providerSid: "out-1" });
    expect(sent).toEqual([
      { number: OWNER, from_number: LINE, content: "Added milk." },
    ]);
  });

  it("treats a declined send as a failure", async () => {
    const declined = vi.fn<typeof fetch>(async () =>
      Response.json(
        { status: "DECLINED", error_key: "PRE_REPLY_LIMIT_REACHED" },
        { status: 400 },
      ),
    );
    await expect(
      sendblueLine(CONFIG.sendblue, OWNER, declined).send("hi"),
    ).rejects.toThrow("Sendblue send failed (400)");

    const declinedOk = vi.fn<typeof fetch>(async () =>
      Response.json({ status: "DECLINED" }),
    );
    await expect(
      sendblueLine(CONFIG.sendblue, OWNER, declinedOk).send("hi"),
    ).rejects.toThrow("Sendblue send DECLINED");
  });
});

/** A conversation store whose unique provider id behaves like the table's. */
function memoryStore() {
  const rows: {
    id: string;
    direction: "inbound" | "outbound";
    providerSid: string | null;
    body: string;
    toolLog: string | null;
  }[] = [];

  const store: ConversationStore = {
    recordInbound: vi.fn(async (_userId, providerSid, body) => {
      if (rows.some((row) => row.providerSid === providerSid)) return null;
      const row = {
        id: `in-${rows.length + 1}`,
        direction: "inbound" as const,
        providerSid,
        body,
        toolLog: null,
      };
      rows.push(row);
      return row;
    }),
    recordOutbound: vi.fn(async (_userId, providerSid, body, toolLog) => {
      rows.push({
        id: `out-${rows.length + 1}`,
        direction: "outbound",
        providerSid,
        body,
        toolLog,
      });
    }),
    recentHistory: vi.fn(async (_userId, excludeId) =>
      rows
        .filter((row) => row.id !== excludeId)
        .map(({ direction, body, toolLog }) => ({ direction, body, toolLog })),
    ),
  };
  return { store, rows };
}

function echoClient() {
  const create = vi.fn(
    async (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
      const last = params.messages.at(-1)!;
      const blocks = last.content as Anthropic.Beta.BetaTextBlockParam[];
      return {
        stop_reason: "end_turn",
        content: [{ type: "text", text: `Got: ${blocks.at(-1)!.text}` }],
      } as unknown as Anthropic.Beta.BetaMessage;
    },
  );
  return { client: { create } satisfies MessageCreator, create };
}

const planner = {} as PlannerOperations;

describe("sendblue poller", () => {
  it("answers each new text once, in order, across overlapping polls", async () => {
    const { store, rows } = memoryStore();
    const { client } = echoClient();
    const { fetchImpl, sent } = sendblueFetch([
      inbound("a", "add milk"),
      inbound("b", "what's left?"),
    ]);

    const deps = {
      config: CONFIG,
      conversation: store,
      planner,
      client,
      timeZone: async () => "America/New_York",
      line: sendblueLine(CONFIG.sendblue, OWNER, fetchImpl),
    };

    expect(await pollSendblue(deps, NOW)).toEqual({ seen: 2, answered: 2 });
    // The next poll's window overlaps this one and sees both again.
    expect(await pollSendblue(deps, NOW)).toEqual({ seen: 2, answered: 0 });

    expect(sent.map((message) => message.content)).toEqual([
      "Got: add milk",
      "Got: what's left?",
    ]);
    expect(rows.map((row) => [row.direction, row.providerSid])).toEqual([
      ["inbound", "a"],
      ["outbound", "out-1"],
      ["inbound", "b"],
      ["outbound", "out-2"],
    ]);

    const since = new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get(
      "created_at_gte",
    );
    expect(since).toBe(
      new Date(NOW.getTime() - POLL_LOOKBACK_MS).toISOString(),
    );
  });

  it("touches nothing but the list when there is nothing new", async () => {
    const { store } = memoryStore();
    const { client, create } = echoClient();
    const timeZone = vi.fn(async () => "America/New_York");
    const { fetchImpl, sent } = sendblueFetch([]);

    expect(
      await pollSendblue(
        {
          config: CONFIG,
          conversation: store,
          planner,
          client,
          timeZone,
          line: sendblueLine(CONFIG.sendblue, OWNER, fetchImpl),
        },
        NOW,
      ),
    ).toEqual({ seen: 0, answered: 0 });
    expect(timeZone).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(store.recordInbound).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("answers at most five texts per poll and leaves the rest", async () => {
    const { store } = memoryStore();
    const { client } = echoClient();
    const { fetchImpl, sent } = sendblueFetch(
      Array.from({ length: 7 }, (_, index) =>
        inbound(`m${index}`, `t${index}`),
      ),
    );
    const deps = {
      config: CONFIG,
      conversation: store,
      planner,
      client,
      timeZone: async () => "America/New_York",
      line: sendblueLine(CONFIG.sendblue, OWNER, fetchImpl),
    };

    expect(await pollSendblue(deps, NOW)).toEqual({ seen: 7, answered: 5 });
    expect(await pollSendblue(deps, NOW)).toEqual({ seen: 7, answered: 2 });
    expect(sent).toHaveLength(7);
  });

  it("replies with the failure text when the agent fails", async () => {
    const { store } = memoryStore();
    const client: MessageCreator = {
      create: vi.fn(async () => {
        throw new Error("overloaded");
      }),
    };
    const { fetchImpl, sent } = sendblueFetch([inbound("a", "add milk")]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await pollSendblue(
      {
        config: CONFIG,
        conversation: store,
        planner,
        client,
        timeZone: async () => "America/New_York",
        line: sendblueLine(CONFIG.sendblue, OWNER, fetchImpl),
      },
      NOW,
    );

    error.mockRestore();
    expect(sent.map((message) => message.content)).toEqual([FAILURE_REPLY]);
  });

  it("moves on to the next text when a send fails, without retrying", async () => {
    const { store } = memoryStore();
    const { client } = echoClient();
    const { fetchImpl } = sendblueFetch(
      [inbound("a", "first"), inbound("b", "second")],
      500,
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const deps = {
      config: CONFIG,
      conversation: store,
      planner,
      client,
      timeZone: async () => "America/New_York",
      line: sendblueLine(CONFIG.sendblue, OWNER, fetchImpl),
    };
    expect(await pollSendblue(deps, NOW)).toEqual({ seen: 2, answered: 2 });
    expect(error).toHaveBeenCalledTimes(2);
    // Both stay recorded, so a later poll does not act on them a second time.
    expect(await pollSendblue(deps, NOW)).toEqual({ seen: 2, answered: 0 });
    error.mockRestore();
  });
});
