"use client";

import * as React from "react";

import { EditableText } from "@/components/planner/editable-text";
import { TaskGlyph } from "@/components/planner/task-appearance";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEFAULT_TASK_COLOR,
  DEFAULT_TASK_ICON,
  TASK_COLOR_KEYS,
  TASK_ICON_KEYS,
  type TaskColorKey,
  type TaskIconKey,
} from "@/lib/daily-planner/appearance";
import { cn } from "@/lib/utils";

const colorClasses: Record<TaskColorKey, string> = {
  olive: "bg-primary",
  sage: "bg-chart-2",
  apricot: "bg-chart-3",
  rose: "bg-destructive",
  sky: "bg-chart-5",
  ink: "bg-foreground",
};

export function DraftTaskRow({
  onCommit,
  onDiscard,
  pending = false,
}: {
  onCommit: (input: {
    title: string;
    notes: string | null;
    iconKey: TaskIconKey;
    colorKey: TaskColorKey;
    continueDraft: boolean;
  }) => void;
  onDiscard: () => void;
  pending?: boolean;
}) {
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [editingNotes, setEditingNotes] = React.useState(false);
  const [iconKey, setIconKey] = React.useState<TaskIconKey>(DEFAULT_TASK_ICON);
  const [colorKey, setColorKey] =
    React.useState<TaskColorKey>(DEFAULT_TASK_COLOR);
  const notesRef = React.useRef<HTMLTextAreaElement>(null);
  const committedRef = React.useRef(false);

  function finish(continueDraft: boolean) {
    if (committedRef.current || pending) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      onDiscard();
      return;
    }

    committedRef.current = true;
    onCommit({
      title: cleanTitle,
      notes: notes.trim() || null,
      iconKey,
      colorKey,
      continueDraft,
    });
  }

  function cancel() {
    if (committedRef.current) return;
    committedRef.current = true;
    onDiscard();
  }

  function handleRowBlur(event: React.FocusEvent<HTMLElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    finish(false);
  }

  return (
    <article
      className={cn(
        "flex min-w-0 items-start gap-2 rounded-xl border border-border bg-card px-2 py-2.5",
        pending && "opacity-60",
      )}
      onBlur={handleRowBlur}
    >
      <Checkbox
        aria-label="New task"
        checked={false}
        className="mt-1.5"
        disabled
      />

      <div className="min-w-0 flex-1 pt-0.5">
        <EditableText
          aria-label="Task title"
          autoFocus
          disabled={pending}
          onCancel={cancel}
          onChange={setTitle}
          onEnter={() => finish(true)}
          placeholder="What needs your attention?"
          value={title}
          variant="title"
        />

        {editingNotes || notes ? (
          <div className="mt-1">
            <EditableText
              aria-label="Task notes"
              disabled={pending}
              onCancel={cancel}
              onChange={setNotes}
              placeholder="Add a note"
              ref={notesRef}
              value={notes}
              variant="notes"
            />
          </div>
        ) : (
          <button
            className="mt-1 text-sm leading-5 text-muted-foreground underline decoration-muted-foreground/50 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/50"
            disabled={pending}
            onClick={() => {
              setEditingNotes(true);
              requestAnimationFrame(() => notesRef.current?.focus());
            }}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            Add note
          </button>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <fieldset className="flex items-center gap-0.5">
            <legend className="sr-only">Task icon</legend>
            {TASK_ICON_KEYS.map((key) => (
              <button
                aria-label={`Use ${key} icon`}
                aria-pressed={iconKey === key}
                className={cn(
                  "grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  iconKey === key && "bg-muted text-foreground",
                )}
                key={key}
                onClick={() => setIconKey(key)}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                <span className="[&>svg]:size-3.5">
                  <TaskGlyph iconKey={key} />
                </span>
              </button>
            ))}
          </fieldset>

          <fieldset className="flex items-center gap-1.5">
            <legend className="sr-only">Task color</legend>
            {TASK_COLOR_KEYS.map((key) => (
              <button
                aria-label={`Use ${key} color`}
                aria-pressed={colorKey === key}
                className={cn(
                  "size-4 rounded-full border-2 border-card ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  colorClasses[key],
                  colorKey === key && "ring-2 ring-foreground/60",
                )}
                key={key}
                onClick={() => setColorKey(key)}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              />
            ))}
          </fieldset>
        </div>
      </div>
    </article>
  );
}
