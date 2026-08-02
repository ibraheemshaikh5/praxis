"use client";

import * as React from "react";

import { EditableText } from "@/components/planner/editable-text";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export function DraftTaskRow({
  onCommit,
  onDiscard,
  pending = false,
}: {
  onCommit: (input: {
    title: string;
    notes: string | null;
    continueDraft: boolean;
  }) => void;
  onDiscard: () => void;
  pending?: boolean;
}) {
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [editingNotes, setEditingNotes] = React.useState(false);
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
          placeholder="Task"
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
      </div>
    </article>
  );
}
