import type Anthropic from "@anthropic-ai/sdk";

import { truncateToolLog } from "./limits";
import { todayIn } from "./local-time";
import type { HistoryTurn } from "./types";
import { plannerTools, runPlannerTool, type ToolContext } from "./tools";

export const DEFAULT_SMS_MODEL = "claude-opus-5-5";

// Each round is one model call; a text that adds, moves and reorders a few
// tasks needs four or five. The cap only stops a runaway loop.
const MAX_ROUNDS = 12;
// Ample for a short reply and the thinking before it; replies are capped later.
const MAX_TOKENS = 16_000;
// Per-result cap, so one large listing cannot crowd the rest out of the log.
const TOOL_LOG_RESULT_LIMIT = 600;

// The fixed replies, in the same voice as the prompt below.
export const REPLIES = {
  refused: "can't help with that one, sorry",
  outOfTime:
    "ugh that took too long and i had to bail. check the planner, some of it might've gone through",
  tooManySteps: "that one's a lot at once, mind splitting it into a few texts?",
  empty: "done 👍",
};

const SYSTEM_PROMPT = `You run the owner's daily planner and job application tracker over text. Each user message is a text they sent; your final reply is texted back.

Tools read and change the planner and the tracker. Before changing a task, find its id with list_tasks unless an earlier tool log in this conversation already gives it. Resolve "today", "tomorrow" and weekdays against the date stated in the latest message.

Act on clear requests without asking for confirmation, including deletes, and say what you did. Ask a short question only when it is genuinely unclear which task is meant.

When asked what is left, list today's tasks that are not done, in planner order.

Don't worry about clock times. Leave them out of replies and lists, and never ask what time something is.

After marking a task done, mention any goal it moved, with the new count against the target (for example "gym 3/4 this week"), and hype it up a little when a goal was just reached. Say nothing about goals when none changed. For questions about goals or progress, use get_goals.

When the owner says they applied to a job, log it with add_application, passing the link. Pass company or title only when the text states them. Reply with the company, title and its number (for example "logged stripe, swe intern 🎉 #14"). If it was already tracked, say so. If the posting couldn't be read, ask for the company and title.

Voice: text like a friend who's on top of their schedule, not an assistant. Casual and warm, mostly lowercase, contractions, short sentences, the odd "nice", "got it", "ok so" or emoji when it fits. Skip greetings, sign-offs, "Certainly" and "I have". Never pad a reply to sound friendly; casual means fewer words, not more.

Examples of the voice:
- "added dentist tmrw"
- "nice, laundry's done. gym 3/4 this week"
- "ok so 3 left today: 1. essay draft 2. call mom 3. groceries"
- "deleted the dentist thing. text undo if that was a mistake"
- "which one, the essay draft or the essay outline?"

Replies are plain text read on a phone: no markdown, no headings, no bold. Use a short numbered or dashed list when listing tasks. After a delete, mention they can reply "undo".`;

export type MessageCreator = {
  create(
    params: Anthropic.Beta.MessageCreateParamsNonStreaming,
    options?: { signal?: AbortSignal },
  ): Promise<Anthropic.Beta.BetaMessage>;
};

export type AgentReply = {
  reply: string;
  toolLog: string | null;
};

/**
 * Answers one text: calls Claude with the planner tools, runs the tools it
 * asks for, and returns its final reply along with a log of what it changed.
 *
 * With a deadline, each call is cut off when it arrives, retries included,
 * and the reply says time ran out. The log is kept either way, so changes
 * already made can still be undone by a later text.
 */
export async function runSmsAgent(options: {
  client: MessageCreator;
  model?: string;
  context: ToolContext;
  history: HistoryTurn[];
  text: string;
  now?: Date;
  /** Epoch milliseconds by which the agent must have replied. */
  deadline?: number;
  clock?: () => number;
}): Promise<AgentReply> {
  const clock = options.clock ?? Date.now;
  const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
  const { client } = options;
  // Tools see the same deadline, so a slow scrape cannot outlast it.
  const context: ToolContext = Number.isFinite(deadline)
    ? { ...options.context, remainingMs: () => deadline - clock() }
    : options.context;
  const messages = buildMessages(
    options.history,
    options.text,
    describeNow(options.now ?? new Date(), context.timeZone),
  );
  // Everything but the messages is fixed, which keeps the cached prefix stable.
  const request = {
    model: options.model ?? DEFAULT_SMS_MODEL,
    max_tokens: MAX_TOKENS,
    // A text is a quick exchange, so the lowest effort keeps replies fast.
    output_config: { effort: "low" },
    // Re-runs a request the model's safety classifier declines on the
    // fallback Anthropic recommends for that kind of decline.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    cache_control: { type: "ephemeral" },
    system: SYSTEM_PROMPT,
    tools: plannerTools,
  } satisfies Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, "messages">;

  const log: string[] = [];
  const finish = (reply: string) => ({ reply, toolLog: joinLog(log) });

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const remaining = deadline - clock();
    if (remaining <= 0) return finish(REPLIES.outOfTime);

    let response: Anthropic.Beta.BetaMessage;
    const signal = Number.isFinite(remaining)
      ? AbortSignal.timeout(remaining)
      : undefined;
    try {
      response = await client.create({ ...request, messages }, { signal });
    } catch (error) {
      if (signal?.aborted) return finish(REPLIES.outOfTime);
      throw error;
    }

    if (response.stop_reason === "refusal") return finish(REPLIES.refused);

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const toolUses = response.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock =>
        block.type === "tool_use",
    );
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      return finish(replyText(response) || REPLIES.empty);
    }

    messages.push({ role: "assistant", content: response.content });
    // Every result from one assistant turn goes back in a single message.
    messages.push({
      role: "user",
      content: await runTools(context, toolUses, log),
    });
  }

  return finish(REPLIES.tooManySteps);
}

async function runTools(
  context: ToolContext,
  toolUses: Anthropic.Beta.BetaToolUseBlock[],
  log: string[],
): Promise<Anthropic.Beta.BetaToolResultBlockParam[]> {
  const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
  for (const toolUse of toolUses) {
    const outcome = await runPlannerTool(context, toolUse.name, toolUse.input);
    log.push(
      `${toolUse.name} ${JSON.stringify(toolUse.input)} -> ${
        outcome.isError ? "error: " : ""
      }${outcome.content.slice(0, TOOL_LOG_RESULT_LIMIT)}`,
    );
    results.push({
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: outcome.content,
      ...(outcome.isError ? { is_error: true } : {}),
    });
  }
  return results;
}

function buildMessages(
  history: HistoryTurn[],
  text: string,
  now: string,
): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = [];

  for (const turn of history) {
    if (turn.direction === "inbound") {
      messages.push({ role: "user", content: turn.body });
    } else if (messages.length > 0) {
      // The conversation must open with a user turn, so a leading reply whose
      // text fell outside the history window is dropped.
      messages.push({
        role: "assistant",
        content: turn.toolLog
          ? `${turn.body}\n\n[Tool log]\n${turn.toolLog}`
          : turn.body,
      });
    }
  }

  messages.push({
    role: "user",
    content: [
      { type: "text", text: `Today is ${now}` },
      { type: "text", text },
    ],
  });
  return messages;
}

// The date only: the agent works in days, not clock times.
function describeNow(now: Date, timeZone: string) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone,
  }).format(now);
  return `${formatted} (${todayIn(timeZone, now)})`;
}

function replyText(response: Anthropic.Beta.BetaMessage) {
  return response.content
    .filter(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === "text",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function joinLog(log: string[]) {
  return log.length === 0 ? null : truncateToolLog(log.join("\n"));
}
