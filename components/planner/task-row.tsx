"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, GripVertical, Trash2 } from "lucide-react";

import { TaskMetricMenu } from "@/components/planner/task-metric-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { PlannerEntryPayload } from "@/lib/api/types";
import { formatTimeBlock } from "@/lib/planner/dates";
import { cn } from "@/lib/utils";

export function TaskRow({
  entry,
  onDelete,
  onToggle,
  pending,
}: {
  entry: PlannerEntryPayload;
  onDelete: (entry: PlannerEntryPayload) => void;
  onToggle: (entry: PlannerEntryPayload) => void;
  pending?: boolean;
}) {
  const completed = Boolean(entry.task.completedAt);
  const timeBlock = formatTimeBlock(
    entry.startsAt,
    entry.endsAt,
    entry.timeZone,
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  return (
    <article
      className={cn(
        "group flex min-w-0 items-start gap-2 rounded-xl border border-transparent px-2 py-2.5 transition-[opacity,background-color,border-color] hover:border-border hover:bg-card",
        "motion-reduce:transition-none",
        pending && "opacity-60",
        isDragging && "z-10 border-border bg-card opacity-95 shadow-sm",
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
          "mt-0.5 inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-xl text-muted-foreground",
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

      <Checkbox
        aria-label={`Mark ${entry.task.title} as ${completed ? "not done" : "done"}`}
        checked={completed}
        className="mt-1.5"
        onCheckedChange={() => onToggle(entry)}
      />

      <div className="min-w-0 flex-1 pt-0.5">
        <p
          className={cn(
            "text-[15px] font-medium leading-5",
            completed && "text-muted-foreground line-through",
          )}
        >
          {entry.task.title}
        </p>
        {entry.task.notes ? (
          <p
            className={cn(
              "mt-1 text-sm leading-5 text-muted-foreground",
              completed && "line-through",
            )}
          >
            {entry.task.notes}
          </p>
        ) : null}
        {timeBlock ? (
          <p className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <Clock className="size-3" />
            {timeBlock}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
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
  );
}
