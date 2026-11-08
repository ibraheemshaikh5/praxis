import type { MessageCreator } from "./agent";
import { runSmsAgent } from "./agent";
import type { AssistantConfig } from "./config";
import type { PlannerOperations } from "./tools";
import type { ConversationStore } from "./types";

export const FAILURE_REPLY =
  "Something went wrong. Check the planner before trying again.";

/** Delivers a reply to the owner; returns the provider's id for it. */
export type ReplySender = (
  body: string,
) => Promise<{ providerSid: string | null }>;

/**
 * Runs the agent on a recorded inbound text and sends the reply back through
 * whichever channel the text arrived on.
 */
export async function replyToText(deps: {
  assistant: AssistantConfig;
  conversation: ConversationStore;
  planner: PlannerOperations;
  client: MessageCreator;
  timeZone: string;
  inboundId: string;
  text: string;
  send: ReplySender;
}) {
  const { assistant: config, conversation } = deps;
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

  const { providerSid } = await deps.send(reply);
  await conversation.recordOutbound(userId, providerSid, reply, toolLog);
}
