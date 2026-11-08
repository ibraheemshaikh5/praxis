import type Anthropic from "@anthropic-ai/sdk";

import { truncateToolLog } from "./limits";
import { plannerTools, runPlannerTool, type ToolContext } from "./tools";

export const DEFAULT_SMS_MODEL = "claude-opus-5-5";

// Each round is one model call; a text that adds, moves and reorders a few
// tasks needs four or five. The cap only stops a runaway loop.
const MAX_ROUNDS = 12;
// Per-result cap, so one large listing cannot crowd the rest out of the log.
const TOOL_LOG_RESULT_LIMIT = 600;

const SYSTEM_PROMPT = `You run the owner's daily planner over SMS. Each user message is a text they sent; your final reply is texted back.

Tools read and change the planner. Before changing a task, find its id with list_tasks unless an earlier tool log in this conversation already gives it. Resolve "today", "tomorrow", weekdays and times against the current time stated in the latest message.

Act on clear requests without asking for confirmation, including deletes, and say what you did. Ask a short question only when it is genuinely unclear which task is meant.

When asked what is left, list today's tasks that are not done, in planner order, with their times.

After marking a task done, mention any goal it moved, with the new count against the target (for example "Gym 3/4 this week"), and say when a goal was just reached. Say nothing about goals when none changed. For questions about goals or progress, use get_goals.

Replies are plain text read on a phone: no markdown, no headings, no bold. Keep them short. Use a short numbered or dashed list when listing tasks. After a delete, mention they can reply "undo".`;

export type MessageCreator = {
  create(
    params: Anthropic.Beta.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Beta.BetaMessage>;
};

export type HistoryTurn = {
  direction: "inbound" | "outbound";
  body: string;
  toolLog: string | null;
};

export type AgentReply = {
  reply: string;
  toolLog: string | null;
};

export async function runSmsAgent(options: {
  client: MessageCreator;
  model?: string;
  context: ToolContext;
  history: HistoryTurn[];
  text: string;
  now?: Date;
}): Promise<AgentReply> {
  const { client, context } = options;
  const messages = buildMessages(
    options.history,
    options.text,
    describeNow(options.now ?? new Date(), context.timeZone),
  );
  const log: string[] = [];

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const response = await client.create({
      model: options.model ?? DEFAULT_SMS_MODEL,
      max_tokens: 16000,
      // A text is a quick exchange, so the lowest effort keeps replies fast.
      output_config: { effort: "low" },
      // Re-runs a request the model's safety classifier declines on the
      // fallback Anthropic recommends for that kind of decline.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: SYSTEM_PROMPT,
      tools: plannerTools,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return { reply: "I can't help with that one.", toolLog: joinLog(log) };
    }

    const toolUses = response.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock =>
        block.type === "tool_use",
    );

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      return {
        reply: replyText(response) || "Done.",
        toolLog: joinLog(log),
      };
    }

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const outcome = await runPlannerTool(
        context,
        toolUse.name,
        toolUse.input,
      );
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
    // Every result from one assistant turn goes back in a single message.
    messages.push({ role: "user", content: results });
  }

  return {
    reply: "That took too many steps. Try splitting it into smaller texts.",
    toolLog: joinLog(log),
  };
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
      { type: "text", text: `Current time: ${now}` },
      { type: "text", text },
    ],
  });
  return messages;
}

function describeNow(now: Date, timeZone: string) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(now);
  const isoDate = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  return `${formatted} (${timeZone}); today is ${isoDate}`;
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
