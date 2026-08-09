import { ValidationError } from "@/lib/daily-planner/errors";

import {
  BUILD_NOTE_PRIORITIES,
  PRIORITY_LABELS,
  type BuildNotePriority,
} from "./priority";

// The routine fire endpoint rejects a longer payload.
export const MAX_PROMPT_LENGTH = 65_536;

export type PromptNote = {
  body: string;
  priority: BuildNotePriority;
};

export type ComposePromptInput = {
  notes: readonly PromptNote[];
  pageKey: string;
};

/**
 * Renders selected notes as the run context sent to a Claude Code routine.
 *
 * The routine receives this inside a `<routine-fire-payload>` block that Claude
 * treats as untrusted data, so the text is a brief rather than a set of
 * instructions. The routine's own saved prompt is what tells Claude to act on
 * it and open the pull request; see docs/build-notes-dispatch.md.
 */
export function composeDispatchPrompt({
  notes,
  pageKey,
}: ComposePromptInput): string {
  if (notes.length === 0) {
    throw new ValidationError("Select at least one note to dispatch");
  }

  const sections = BUILD_NOTE_PRIORITIES.flatMap((priority) => {
    const matching = notes.filter((note) => note.priority === priority);
    if (matching.length === 0) return [];

    const items = matching.map(
      (note, index) => `${index + 1}. ${collapse(note.body)}`,
    );

    return [`## ${PRIORITY_LABELS[priority]}\n\n${items.join("\n")}`];
  });

  const prompt = [
    `# Build notes for ${pageKey}`,
    `These notes describe work on the Praxis page served at \`${pageKey}\`. That page's route, components, and library code are the vertical slice these notes belong to (see AGENTS.md); keep changes inside it unless a note clearly needs shared code. Lower priority numbers are more urgent: P0 first, then P1, P2, P3.`,
    ...sections,
  ].join("\n\n");

  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new ValidationError(
      `Selected notes exceed the ${MAX_PROMPT_LENGTH} character dispatch limit`,
    );
  }

  return prompt;
}

// Note bodies are multi-line textareas; flatten them so one note stays one
// numbered list item.
function collapse(body: string) {
  return body.trim().replace(/\s*\n\s*/g, " ");
}
