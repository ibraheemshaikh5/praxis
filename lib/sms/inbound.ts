import type { HistoryTurn, MessageCreator } from "./agent";
import { runSmsAgent } from "./agent";
import type { SmsConfig } from "./config";
import type { PlannerOperations } from "./tools";
import { isValidTwilioSignature, sendSms } from "./twilio";

export const FAILURE_REPLY =
  "Something went wrong. Check the planner before trying again.";

export type InboundDecision =
  | { kind: "rejected"; status: 403 }
  | { kind: "ignored" }
  | { kind: "accepted"; providerSid: string; body: string };

/**
 * Decides whether a webhook delivery is a text from the owner. Anything else
 * is acknowledged and dropped: a stranger who finds the number gets nothing.
 */
export function screenInbound(
  config: SmsConfig,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): InboundDecision {
  if (
    !isValidTwilioSignature(config.twilio.authToken, url, params, signature)
  ) {
    return { kind: "rejected", status: 403 };
  }

  const from = params.From?.trim();
  const providerSid = params.MessageSid?.trim();
  const body = params.Body?.trim();

  if (from !== config.ownerPhone || !providerSid || !body) {
    return { kind: "ignored" };
  }
  return { kind: "accepted", providerSid, body };
}

export type ConversationStore = {
  recentHistory(userId: string, excludeId: string): Promise<HistoryTurn[]>;
  recordOutbound(
    userId: string,
    providerSid: string | null,
    body: string,
    toolLog: string | null,
  ): Promise<unknown>;
};

/** Runs the agent on a recorded inbound text and texts the reply back. */
export async function replyToText(deps: {
  config: SmsConfig;
  conversation: ConversationStore;
  planner: PlannerOperations;
  client: MessageCreator;
  timeZone: string;
  inboundId: string;
  text: string;
  fetchImpl?: typeof fetch;
}) {
  const { config, conversation } = deps;
  const userId = config.ownerUserId;

  let reply: string;
  let toolLog: string | null = null;
  try {
    const history = await conversation.recentHistory(userId, deps.inboundId);
    ({ reply, toolLog } = await runSmsAgent({
      client: deps.client,
      model: config.model,
      context: { planner: deps.planner, userId, timeZone: deps.timeZone },
      history,
      text: deps.text,
    }));
  } catch (error) {
    console.error("SMS agent failed", error);
    reply = FAILURE_REPLY;
  }

  const { sid } = await sendSms(
    config.twilio,
    config.ownerPhone,
    reply,
    deps.fetchImpl,
  );
  await conversation.recordOutbound(userId, sid, reply, toolLog);
}
