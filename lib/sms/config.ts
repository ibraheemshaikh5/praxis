import { z } from "zod";

import type { TwilioCredentials } from "./twilio";

export type SmsConfig = {
  twilio: TwilioCredentials;
  ownerPhone: string;
  ownerUserId: string;
  webhookUrl: string | null;
  model: string | undefined;
};

const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/);

const environmentSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  TWILIO_ACCOUNT_SID: z.string().regex(/^AC[0-9a-fA-F]{32}$/),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: e164,
  SMS_OWNER_PHONE: e164,
  SMS_OWNER_USER_ID: z.string().uuid(),
  SMS_WEBHOOK_URL: z.string().url().startsWith("https://").optional(),
  SMS_AGENT_MODEL: z.string().min(1).optional(),
});

/**
 * Returns null unless every required variable is present and well formed, so
 * a half-configured deployment refuses texts instead of acting on them.
 */
export function readSmsConfig(
  environment: Record<string, string | undefined> = process.env,
): SmsConfig | null {
  const values = Object.fromEntries(
    Object.keys(environmentSchema.shape).map((key) => [
      key,
      environment[key]?.trim() || undefined,
    ]),
  );
  const parsed = environmentSchema.safeParse(values);
  if (!parsed.success) return null;

  const env = parsed.data;
  return {
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      fromNumber: env.TWILIO_PHONE_NUMBER,
    },
    ownerPhone: env.SMS_OWNER_PHONE,
    ownerUserId: env.SMS_OWNER_USER_ID,
    webhookUrl: env.SMS_WEBHOOK_URL ?? null,
    model: env.SMS_AGENT_MODEL,
  };
}
