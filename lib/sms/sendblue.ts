import "server-only";

import { z } from "zod";

import { truncateSms } from "./limits";

const API_BASE = "https://api.sendblue.com";
// Sendblue not answering by then is down; the poll logs and the next one retries.
const REQUEST_TIMEOUT_MS = 15_000;

export type SendblueCredentials = {
  apiKey: string;
  apiSecret: string;
  /** The Sendblue line texts go to and replies come from. */
  fromNumber: string;
};

export type SendblueInbound = {
  handle: string;
  body: string;
};

/** The owner's conversation on a Sendblue line: their texts in, replies out. */
export type SendblueLine = {
  listInboundTexts(since: Date): Promise<SendblueInbound[]>;
  send(body: string): Promise<{ providerSid: string | null }>;
};

// Only the fields the poller reads; Sendblue returns many more.
const messageSchema = z.object({
  message_handle: z.string().min(1).max(64),
  content: z.string().nullish(),
  is_outbound: z.boolean().nullish(),
  is_reaction: z.boolean().nullish(),
  from_number: z.string().nullish(),
  sendblue_number: z.string().nullish(),
  message_type: z.string().nullish(),
});

type SendblueMessage = z.infer<typeof messageSchema>;

const listResponseSchema = z.object({
  data: z.array(z.unknown()).default([]),
});

const sendResponseSchema = z.object({
  message_handle: z.string().nullish(),
  status: z.string().nullish(),
});

// Statuses that mean Sendblue did not send, even on a 2xx response.
const UNSENT_STATUSES = new Set(["DECLINED", "ERROR"]);

export function sendblueLine(
  credentials: SendblueCredentials,
  ownerPhone: string,
  fetchImpl: typeof fetch = fetch,
): SendblueLine {
  return {
    listInboundTexts: (since) =>
      listInboundTexts(credentials, ownerPhone, since, fetchImpl),
    send: async (body) => ({
      providerSid: await sendText(credentials, ownerPhone, body, fetchImpl),
    }),
  };
}

/**
 * Inbound texts from the owner to the line since the given time, oldest
 * first. The free plan has no webhooks, so this is how texts arrive.
 *
 * The query already filters by direction and parties; each row is checked
 * again here so a widened or ignored filter on Sendblue's side cannot hand the
 * agent someone else's text, a reaction, or a group message.
 */
async function listInboundTexts(
  credentials: SendblueCredentials,
  ownerPhone: string,
  since: Date,
  fetchImpl: typeof fetch,
): Promise<SendblueInbound[]> {
  const query = new URLSearchParams({
    is_outbound: "false",
    sendblue_number: credentials.fromNumber,
    from_number: ownerPhone,
    message_type: "message",
    created_at_gte: since.toISOString(),
    order_by: "createdAt",
    order_direction: "asc",
    limit: "50",
  });
  const body = await request(
    "list",
    `/api/v2/messages?${query}`,
    { headers: authHeaders(credentials) },
    fetchImpl,
  );

  const { data } = listResponseSchema.parse(parseJson(body));
  return data.flatMap((row) => {
    const parsed = messageSchema.safeParse(row);
    if (!parsed.success) return [];
    const text = parsed.data.content?.trim();
    return text && isOwnerText(parsed.data, credentials.fromNumber, ownerPhone)
      ? [{ handle: parsed.data.message_handle, body: text }]
      : [];
  });
}

async function sendText(
  credentials: SendblueCredentials,
  to: string,
  body: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const response = await request(
    "send",
    "/api/send-message",
    {
      method: "POST",
      headers: {
        ...authHeaders(credentials),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        number: to,
        // Required on the free shared-line plan.
        from_number: credentials.fromNumber,
        content: truncateSms(body),
      }),
    },
    fetchImpl,
  );

  const parsed = sendResponseSchema.safeParse(parseJson(response));
  const payload = parsed.success ? parsed.data : {};
  if (payload.status && UNSENT_STATUSES.has(payload.status)) {
    throw new Error(`Sendblue send ${payload.status}: ${response}`);
  }
  return payload.message_handle ?? null;
}

/** A 1:1 text the owner sent to this line, as opposed to anything else. */
function isOwnerText(
  message: SendblueMessage,
  line: string,
  ownerPhone: string,
) {
  return (
    message.is_outbound === false &&
    message.is_reaction !== true &&
    (message.message_type ?? "message") === "message" &&
    message.from_number === ownerPhone &&
    (message.sendblue_number == null || message.sendblue_number === line)
  );
}

/** Returns the body; a non-2xx answer throws with Sendblue's explanation. */
async function request(
  action: string,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
) {
  const response = await fetchImpl(`${API_BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Sendblue ${action} failed (${response.status}): ${body}`);
  }
  return body;
}

function authHeaders(credentials: SendblueCredentials) {
  return {
    "sb-api-key-id": credentials.apiKey,
    "sb-api-secret-key": credentials.apiSecret,
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
