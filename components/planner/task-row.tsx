"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, GripVertical, Trash2 } from "lucide-react";

import { EditableText } from "@/components/planner/editable-text";
import { TaskDateMenu } from "@/components/planner/task-date-menu";
import { TaskMetricMenu } from "@/components/planner/task-metric-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { PlannerEntryPayload } from "@/lib/api/types";
import { formatTimeBlock, type PlannerDateKey } from "@/lib/planner/dates";
import { cn } from "@/lib/utils";

export function TaskRow({
  entry,
  onDelete,
  onSchedule,
  onToggle,
  onUpdate,
  pending,
  schedulePending,
}: {
  entry: PlannerEntryPayload;
  onDelete: (entry: PlannerEntryPayload) => void;
  onSchedule: (input: {
    entry: PlannerEntryPayload;
    plannerDate: PlannerDateKey;
  }) => void;
  onToggle: (entry: PlannerEntryPayload) => void;
  onUpdate: (input: {
    entry: PlannerEntryPayload;
    title?: string;
    notes?: string | null;
  }) => void;
  pending?: boolean;
  schedulePending?: boolean;
}) {
  const completed = Boolean(entry.task.completedAt);
  const timeBlock = formatTimeBlock(
    entry.startsAt,
    entry.endsAt,
    entry.timeZone,
  );

  const [title, setTitle] = React.useState(entry.task.title);
  const [notes, setNotes] = React.useState(entry.task.notes ?? "");
  const [editingNotes, setEditingNotes] = React.useState(
    Boolean(entry.task.notes),
  );
  const [focused, setFocused] = React.useState(false);
  const notesRef = React.useRef<HTMLTextAreaElement>(null);
  const cardRef = React.useRef<HTMLElement | null>(null);
  const skipCommitRef = React.useRef(false);

  // Sync from server only while unfocused so a refetch never yanks the caret.
  React.useEffect(() => {
    if (focused) return;
    setTitle(entry.task.title);
    setNotes(entry.task.notes ?? "");
    setEditingNotes(Boolean(entry.task.notes));
  }, [entry.task.title, entry.task.notes, focused]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  function commit() {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      return;
    }

    const cleanTitle = title.trim();
    const cleanNotes = notes.trim() || null;
    const nextTitle = cleanTitle || entry.task.title;
    const nextNotes = cleanNotes;

    if (!cleanTitle) setTitle(entry.task.title);

    const titleChanged = nextTitle !== entry.task.title;
    const notesChanged = nextNotes !== (entry.task.notes ?? null);

    if (!titleChanged && !notesChanged) {
      setEditingNotes(Boolean(entry.task.notes));
      return;
    }

    onUpdate({
      entry,
      ...(titleChanged ? { title: nextTitle } : {}),
      ...(notesChanged ? { notes: nextNotes } : {}),
    });
  }

  function cancel() {
    skipCommitRef.current = true;
    setTitle(entry.task.title);
    setNotes(entry.task.notes ?? "");
    setEditingNotes(Boolean(entry.task.notes));
    setFocused(false);
    const active = document.activeElement;
    if (active instanceof HTMLElement && cardRef.current?.contains(active)) {
      active.blur();
    }
  }

  function handleRowBlur(event: React.FocusEvent<HTMLElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setFocused(false);
    commit();
  }

  return (
    <div
      className={cn(
        "group relative",
        pending && "opacity-60",
        isDragging && "z-10",
      )}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        aria-label={`Reorder ${entry.task.title}`}
        className={cn(
          "absolute top-1.5 right-full mr-0.5 inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-xl text-muted-foreground",
          "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
          "hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          "active:cursor-grabbing motion-reduce:transition-none",
          isDragging && "opacity-100",
        )}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <article
        className={cn(
          "flex min-w-0 items-start gap-2 rounded-xl border border-transparent px-2 py-2.5 transition-[opacity,background-color,border-color] hover:border-border hover:bg-card",
          "motion-reduce:transition-none",
          isDragging && "border-border bg-card opacity-95 shadow-sm",
          focused && "border-border bg-card",
        )}
        onBlur={handleRowBlur}
        onFocus={() => setFocused(true)}
        ref={cardRef}
      >
        <Checkbox
          aria-label={`Mark ${entry.task.title} as ${completed ? "not done" : "done"}`}
          checked={completed}
          className="mt-1.5"
          onCheckedChange={() => onToggle(entry)}
        />

        <div className="min-w-0 flex-1 pt-0.5">
          <EditableText
            aria-label="Task title"
            completed={completed}
            onCancel={cancel}
            onChange={setTitle}
            onEnter={() => {
              commit();
              skipCommitRef.current = true;
              const active = document.activeElement;
              if (active instanceof HTMLElement) active.blur();
            }}
            value={title}
            variant="title"
          />

          {editingNotes || notes ? (
            <div className="mt-1">
              <EditableText
                aria-label="Task notes"
                completed={completed}
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

          {timeBlock ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <Clock className="size-3" />
              {timeBlock}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <TaskDateMenu
            entry={entry}
            onSchedule={onSchedule}
            pending={schedulePending}
          />
          <TaskMetricMenu taskId={entry.taskId} taskTitle={entry.task.title} />
          <Button
            aria-label={`Remove ${entry.task.title}`}
            className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
            onClick={() => onDelete(entry)}
            size="icon-sm"
            variant="ghost"
          >
            <Trash2 />
          </Button>
        </div>
      </article>
    </div>
  );
}
