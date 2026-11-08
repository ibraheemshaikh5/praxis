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
