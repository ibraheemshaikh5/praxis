import { z } from "zod";

import type { SendblueCredentials } from "./sendblue";

/** Whose planner the assistant runs, and how to reach them. */
export type AssistantConfig = {
  ownerPhone: string;
  ownerUserId: string;
  model: string | undefined;
};

export type SendblueConfig = {
  assistant: AssistantConfig;
  sendblue: SendblueCredentials;
};

type Environment = Record<string, string | undefined>;

const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/);

const assistantSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  SMS_OWNER_PHONE: e164,
  SMS_OWNER_USER_ID: z.string().uuid(),
  SMS_AGENT_MODEL: z.string().min(1).optional(),
});

const sendblueSchema = assistantSchema.extend({
  SENDBLUE_API_KEY: z.string().min(1),
  SENDBLUE_API_SECRET: z.string().min(1),
  SENDBLUE_FROM_NUMBER: e164,
});

/**
 * Null unless every variable is present and well formed, so a half-configured
 * deployment refuses to act on texts.
 */
export function readSendblueConfig(
  environment: Environment = process.env,
): SendblueConfig | null {
  const env = parse(sendblueSchema, environment);
  if (!env) return null;
  return {
    assistant: assistantFrom(env),
    sendblue: {
      apiKey: env.SENDBLUE_API_KEY,
      apiSecret: env.SENDBLUE_API_SECRET,
      fromNumber: env.SENDBLUE_FROM_NUMBER,
    },
  };
}

function assistantFrom(env: z.infer<typeof assistantSchema>): AssistantConfig {
  return {
    ownerPhone: env.SMS_OWNER_PHONE,
    ownerUserId: env.SMS_OWNER_USER_ID,
    model: env.SMS_AGENT_MODEL,
  };
}

function parse<T extends z.ZodObject>(
  schema: T,
  environment: Environment,
): z.infer<T> | null {
  // Blank values count as missing, the way an empty line in .env reads.
  const values = Object.fromEntries(
    Object.keys(schema.shape).map((key) => [
      key,
      environment[key]?.trim() || undefined,
    ]),
  );
  const parsed = schema.safeParse(values);
  return parsed.success ? parsed.data : null;
}
