import "server-only";

import { z } from "zod";

import { parseJsonOrNull, ProviderError, providerRequest } from "./http";
import { truncateSms } from "./limits";

const API_BASE = "https://api.sendblue.com";

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
  fetchImpl?: typeof fetch,
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

  const body = await providerRequest(
    "Sendblue",
    "list",
    `${API_BASE}/api/v2/messages?${query}`,
    { headers: authHeaders(credentials) },
    fetchImpl,
  );

  const { data } = listResponseSchema.parse(parseJsonOrNull(body));
  return data.flatMap((row) => {
    const parsed = messageSchema.safeParse(row);
    if (!parsed.success) return [];
    const text = parsed.data.content?.trim();
    return text && isOwnerText(parsed.data, credentials.fromNumber, ownerPhone)
      ? [{ handle: parsed.data.message_handle, body: text }]
      : [];
  });
}

export async function sendSendblueText(
  credentials: SendblueCredentials,
  to: string,
  body: string,
  fetchImpl?: typeof fetch,
): Promise<{ handle: string | null }> {
  const response = await providerRequest(
    "Sendblue",
    "send",
    `${API_BASE}/api/send-message`,
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

  const parsed = sendResponseSchema.safeParse(parseJsonOrNull(response));
  const payload = parsed.success ? parsed.data : {};
  if (payload.status && UNSENT_STATUSES.has(payload.status)) {
    throw new ProviderError(
      "Sendblue",
      "send",
      `${payload.status}: ${response}`,
    );
  }
  return { handle: payload.message_handle ?? null };
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

function authHeaders(credentials: SendblueCredentials) {
  return {
    "sb-api-key-id": credentials.apiKey,
    "sb-api-secret-key": credentials.apiSecret,
  };
}
