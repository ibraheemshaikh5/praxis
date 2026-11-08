import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { parseJsonOrNull, ProviderError, providerRequest } from "./http";
import { truncateSms } from "./limits";

const sendResponseSchema = z.object({ sid: z.string().min(1) });

/**
 * Twilio signs each webhook with HMAC-SHA1 over the full request URL followed
 * by every POST parameter, sorted by name, as name then value with no
 * separators. The key is the account's auth token.
 */
export function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
) {
  const payload = Object.keys(params)
    .sort()
    .reduce((joined, key) => joined + key + params[key], url);

  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

export function isValidTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null,
) {
  if (!signature) return false;

  const expected = Buffer.from(computeTwilioSignature(authToken, url, params));
  const provided = Buffer.from(signature);
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

export type TwilioWebhookDecision =
  | { kind: "rejected" }
  | { kind: "ignored" }
  | { kind: "accepted"; providerSid: string; body: string };

/**
 * Decides whether a webhook delivery is a text from the owner. An unsigned or
 * forged request is rejected; anything else that is not the owner's text is
 * acknowledged and dropped, so a stranger who finds the number gets nothing.
 */
export function screenTwilioWebhook(
  authToken: string,
  ownerPhone: string,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): TwilioWebhookDecision {
  if (!isValidTwilioSignature(authToken, url, params, signature)) {
    return { kind: "rejected" };
  }

  const providerSid = params.MessageSid?.trim();
  const body = params.Body?.trim();
  if (params.From?.trim() !== ownerPhone || !providerSid || !body) {
    return { kind: "ignored" };
  }
  return { kind: "accepted", providerSid, body };
}

/** The webhook's form fields; Twilio sends only strings. */
export async function readTwilioForm(request: Request) {
  const form = await request.formData();
  return Object.fromEntries(
    [...form.entries()].map(([key, value]) => [key, String(value)]),
  );
}

/** An empty TwiML document: acknowledges the webhook without replying. */
export function emptyTwimlResponse() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    headers: { "content-type": "text/xml" },
  });
}

export type TwilioCredentials = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

export async function sendSms(
  credentials: TwilioCredentials,
  to: string,
  body: string,
  fetchImpl?: typeof fetch,
): Promise<{ sid: string }> {
  const authorization = Buffer.from(
    `${credentials.accountSid}:${credentials.authToken}`,
  ).toString("base64");

  const response = await providerRequest(
    "Twilio",
    "send",
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      credentials.accountSid,
    )}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${authorization}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: credentials.fromNumber,
        Body: truncateSms(body),
      }),
    },
    fetchImpl,
  );

  const parsed = sendResponseSchema.safeParse(parseJsonOrNull(response));
  if (!parsed.success) {
    throw new ProviderError("Twilio", "send", "returned no message SID");
  }
  return { sid: parsed.data.sid };
}
