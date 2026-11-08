import "server-only";

import { z } from "zod";

import { truncateSms } from "./text";

const API_BASE = "https://api.sendblue.com";
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

const listResponseSchema = z.object({
  data: z.array(z.unknown()).default([]),
});

/**
 * Inbound texts from the owner to the line since the given time, oldest
 * first. The free plan has no webhooks, so this is how texts arrive.
 *
 * The query already filters by direction and parties; each row is checked
 * again here so a widened or ignored filter on Sendblue's side cannot hand the
 * agent someone else's text, a reaction, or a group message.
 */
export async function listInboundTexts(
  credentials: SendblueCredentials,
  ownerPhone: string,
  since: Date,
  fetchImpl: typeof fetch = fetch,
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

  const response = await fetchImpl(`${API_BASE}/api/v2/messages?${query}`, {
    headers: authHeaders(credentials),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Sendblue list failed (${response.status}): ${await safeText(response)}`,
    );
  }

  const { data } = listResponseSchema.parse(await response.json());
  const texts: SendblueInbound[] = [];
  for (const row of data) {
    const parsed = messageSchema.safeParse(row);
    if (!parsed.success) continue;

    const message = parsed.data;
    const body = message.content?.trim();
    if (
      message.is_outbound !== false ||
      message.is_reaction === true ||
      (message.message_type ?? "message") !== "message" ||
      message.from_number !== ownerPhone ||
      (message.sendblue_number != null &&
        message.sendblue_number !== credentials.fromNumber) ||
      !body
    ) {
      continue;
    }
    texts.push({ handle: message.message_handle, body });
  }
  return texts;
}

const sendResponseSchema = z.object({
  message_handle: z.string().nullish(),
  status: z.string().nullish(),
  error_key: z.string().nullish(),
  error_reason: z.string().nullish(),
});

export async function sendSendblueText(
  credentials: SendblueCredentials,
  to: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ handle: string | null }> {
  const response = await fetchImpl(`${API_BASE}/api/send-message`, {
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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await safeText(response);
  if (!response.ok) {
    throw new Error(`Sendblue send failed (${response.status}): ${text}`);
  }

  const payload = sendResponseSchema.safeParse(safeJson(text));
  const status = payload.success ? payload.data.status : null;
  // A rule can decline a send with a 2xx in some paths; never report it sent.
  if (status === "DECLINED" || status === "ERROR") {
    throw new Error(`Sendblue send ${status}: ${text}`);
  }
  return {
    handle: payload.success ? (payload.data.message_handle ?? null) : null,
  };
}

function authHeaders(credentials: SendblueCredentials) {
  return {
    "sb-api-key-id": credentials.apiKey,
    "sb-api-secret-key": credentials.apiSecret,
  };
}

async function safeText(response: Response) {
  return response.text().catch(() => "");
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
