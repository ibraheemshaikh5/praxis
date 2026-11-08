import { z } from "zod";

import { PlannerError } from "@/lib/daily-planner/errors";

import type { SendblueCredentials } from "./sendblue";

/** Whose planner the assistant runs, and the Sendblue line it texts on. */
export type AssistantConfig = {
  ownerPhone: string;
  ownerUserId: string;
  model: string | undefined;
  sendblue: SendblueCredentials;
};

export class SmsNotConfiguredError extends PlannerError {
  constructor() {
    super("The SMS assistant is not configured", "SMS_NOT_CONFIGURED", 503);
  }
}

const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/);

const environmentSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  SMS_OWNER_PHONE: e164,
  SMS_OWNER_USER_ID: z.string().uuid(),
  SMS_AGENT_MODEL: z.string().min(1).optional(),
  SENDBLUE_API_KEY: z.string().min(1),
  SENDBLUE_API_SECRET: z.string().min(1),
  SENDBLUE_FROM_NUMBER: e164,
});

/**
 * Null unless every variable is present and well formed, so a half-configured
 * deployment refuses to act on texts. Blank values count as missing, the way
 * an empty line in .env reads.
 */
export function readAssistantConfig(
  environment: Record<string, string | undefined> = process.env,
): AssistantConfig | null {
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
    ownerPhone: env.SMS_OWNER_PHONE,
    ownerUserId: env.SMS_OWNER_USER_ID,
    model: env.SMS_AGENT_MODEL,
    sendblue: {
      apiKey: env.SENDBLUE_API_KEY,
      apiSecret: env.SENDBLUE_API_SECRET,
      fromNumber: env.SENDBLUE_FROM_NUMBER,
    },
  };
}
