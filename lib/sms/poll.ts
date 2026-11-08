import { runSmsAgent, type MessageCreator } from "./agent";
import type { AssistantConfig } from "./config";
import type { SendblueLine } from "./sendblue";
import type { PlannerOperations } from "./tools";
import type { ConversationStore } from "./types";

export const FAILURE_REPLY =
  "Something went wrong. Check the planner before trying again.";

// How far back each poll looks. Overlapping windows are what make a missed or
// failed poll harmless; texts already recorded are skipped. A text older than
// this when the poller first sees it is ignored rather than acted on late.
export const POLL_LOOKBACK_MS = 15 * 60 * 1000;

// A poll answers texts one after another inside one function invocation, so
// this bounds how long it runs. Anything past it waits for the next poll.
const MAX_TEXTS_PER_POLL = 5;

// Outlasts the poll route's 60-second maxDuration, so a poll the platform
// stops mid-answer frees the lease for the poll after next at the latest.
export const POLL_LEASE_MS = 90_000;

export type PollDeps = {
  config: AssistantConfig;
  line: SendblueLine;
  conversation: ConversationStore;
  planner: PlannerOperations;
  client: MessageCreator;
  /** The owner's profile time zone, looked up only when a text needs it. */
  timeZone: () => Promise<string>;
};

/**
 * Reads recent texts from the line and answers each new one, in the order
 * they were sent, holding the owner's poll lease while it does. Recording a
 * text before answering it is the claim, so no text is answered twice.
 */
export async function pollSendblue(deps: PollDeps, now = new Date()) {
  const texts = await deps.line.listInboundTexts(
    new Date(now.getTime() - POLL_LOOKBACK_MS),
  );

  if (texts.length === 0) return { seen: 0, answered: 0 };

  // One poll answers at a time, so a follow-up ("undo") never runs before the
  // reply it refers to is saved. A poll that finds the lease held leaves its
  // texts unclaimed for the holder, or the next poll, to answer in order.
  const userId = deps.config.ownerUserId;
  const lease = await deps.conversation.acquirePollLease(userId, POLL_LEASE_MS);
  if (!lease) return { seen: texts.length, answered: 0, busy: true };

  let answered = 0;
  try {
    for (const text of texts) {
      if (answered >= MAX_TEXTS_PER_POLL) break;

      const inbound = await deps.conversation.recordInbound(
        userId,
        text.handle,
        text.body,
      );
      if (!inbound) continue;

      answered += 1;
      try {
        await answer(deps, { id: inbound.id, text: text.body });
      } catch (error) {
        // The text stays recorded, so it is not answered twice; the next text
        // in this poll still gets its turn.
        console.error("Sendblue reply failed", error);
      }
    }
  } finally {
    await deps.conversation.releasePollLease(userId, lease);
  }

  return { seen: texts.length, answered };
}

/**
 * Runs the agent on a recorded text and sends the reply. When the agent fails
 * the owner still gets an answer, so a text is never met with silence.
 */
async function answer(deps: PollDeps, inbound: { id: string; text: string }) {
  const { config, conversation } = deps;
  const userId = config.ownerUserId;

  let reply = FAILURE_REPLY;
  let toolLog: string | null = null;
  try {
    const [history, timeZone] = await Promise.all([
      conversation.recentHistory(userId, inbound.id),
      deps.timeZone(),
    ]);
    ({ reply, toolLog } = await runSmsAgent({
      client: deps.client,
      model: config.model,
      context: { planner: deps.planner, userId, timeZone },
      history,
      text: inbound.text,
    }));
  } catch (error) {
    console.error("SMS agent failed", error);
  }

  const { providerSid } = await deps.line.send(reply);
  await conversation.recordOutbound(userId, providerSid, reply, toolLog);
}
