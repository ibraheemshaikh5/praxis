import type { MessageCreator } from "./agent";
import type { SendblueConfig } from "./config";
import { replyToText } from "./inbound";
import { listInboundTexts, sendSendblueText } from "./sendblue";
import type { PlannerOperations } from "./tools";
import type { ConversationStore } from "./types";

// How far back each poll looks. Overlapping windows are what make a missed or
// failed poll harmless; texts already recorded are skipped. A text older than
// this when the poller first sees it is ignored rather than acted on late.
export const POLL_LOOKBACK_MS = 15 * 60 * 1000;

// A poll answers texts one after another inside one function invocation, so
// this bounds how long it runs. Anything past it waits for the next poll.
const MAX_TEXTS_PER_POLL = 5;

/**
 * Reads recent texts from the Sendblue line and answers each new one, in the
 * order they were sent. Recording a text before answering it is the claim: an
 * overlapping poll that sees the same text finds it recorded and skips it.
 */
export async function pollSendblue(deps: {
  config: SendblueConfig;
  conversation: ConversationStore;
  planner: PlannerOperations;
  client: MessageCreator;
  timeZone: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}) {
  const { config, conversation } = deps;
  const { assistant, sendblue } = config;
  const now = deps.now ?? new Date();

  const texts = await listInboundTexts(
    sendblue,
    assistant.ownerPhone,
    new Date(now.getTime() - POLL_LOOKBACK_MS),
    deps.fetchImpl,
  );

  let answered = 0;
  for (const text of texts) {
    if (answered >= MAX_TEXTS_PER_POLL) break;

    const inbound = await conversation.recordInbound(
      assistant.ownerUserId,
      text.handle,
      text.body,
    );
    if (!inbound) continue;

    answered += 1;
    try {
      await replyToText({
        assistant,
        conversation,
        planner: deps.planner,
        client: deps.client,
        timeZone: deps.timeZone,
        inboundId: inbound.id,
        text: text.body,
        send: async (body) => {
          const { handle } = await sendSendblueText(
            sendblue,
            assistant.ownerPhone,
            body,
            deps.fetchImpl,
          );
          return { providerSid: handle };
        },
      });
    } catch (error) {
      // The text stays recorded, so it is not answered twice; the next text
      // in this poll still gets its turn.
      console.error("Sendblue reply failed", error);
    }
  }

  return { seen: texts.length, answered };
}
