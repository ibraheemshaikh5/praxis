"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CirclePlus } from "lucide-react";

import { DraftTaskRow } from "@/components/planner/draft-task-row";
import { TaskRow } from "@/components/planner/task-row";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlannerEntryPayload } from "@/lib/api/types";
import {
  formatMonthDay,
  formatWeekday,
  type PlannerDateKey,
} from "@/lib/planner/dates";
import { cn } from "@/lib/utils";

type PendingCreate = {
  id: string;
  title: string;
  notes: string | null;
};

export function DaySection({
  dateKey,
  entries,
  isToday,
  loading,
  onCreate,
  onDelete,
  onReorder,
  onToggle,
  onUpdate,
  sectionRef,
}: {
  dateKey: PlannerDateKey;
  entries: PlannerEntryPayload[];
  isToday: boolean;
  loading: boolean;
  onCreate: (input: {
    dateKey: PlannerDateKey;
    title: string;
    notes: string | null;
  }) => Promise<void>;
  onDelete: (entry: PlannerEntryPayload) => void;
  onReorder: (input: {
    plannerDate: PlannerDateKey;
    orderedEntryIds: string[];
  }) => void;
  onToggle: (entry: PlannerEntryPayload) => void;
  onUpdate: (input: {
    entry: PlannerEntryPayload;
    title?: string;
    notes?: string | null;
  }) => void;
  sectionRef?: React.Ref<HTMLElement>;
}) {
  const [draftOpen, setDraftOpen] = React.useState(false);
  const [draftKey, setDraftKey] = React.useState(0);
  const [pendingCreates, setPendingCreates] = React.useState<PendingCreate[]>(
    [],
  );

  const remaining = entries.filter((entry) => !entry.task.completedAt).length;
  const headingId = `day-heading-${dateKey}`;
  const entryIds = entries.map((entry) => entry.id);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = entryIds.indexOf(String(active.id));
    const newIndex = entryIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const orderedEntryIds = arrayMove(entryIds, oldIndex, newIndex);
    onReorder({ plannerDate: dateKey, orderedEntryIds });
  }

  async function handleDraftCommit(input: {
    title: string;
    notes: string | null;
    continueDraft: boolean;
  }) {
    const pendingId = crypto.randomUUID();
    setPendingCreates((current) => [
      ...current,
      { id: pendingId, title: input.title, notes: input.notes },
    ]);

    if (input.continueDraft) {
      setDraftKey((key) => key + 1);
    } else {
      setDraftOpen(false);
    }

    try {
      await onCreate({
        dateKey,
        title: input.title,
        notes: input.notes,
      });
    } finally {
      setPendingCreates((current) =>
        current.filter((item) => item.id !== pendingId),
      );
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-h-(--planner-pane) snap-start snap-always flex-col border-t border-border/60 py-5"
      data-day={dateKey}
      id={`day-${dateKey}`}
      ref={sectionRef}
    >
      <div
        className={cn(
          "sticky top-0 z-10 -mx-1 flex items-baseline justify-between gap-4 px-1 py-2",
          "bg-background/90 backdrop-blur-md",
          isToday && "border-b border-primary/25",
        )}
      >
        <h2
          className={cn(
            "text-lg font-semibold tracking-[-0.02em]",
            isToday ? "text-foreground" : "text-muted-foreground",
          )}
          id={headingId}
        >
          {isToday ? (
            <span className="text-primary">Today</span>
          ) : (
            formatWeekday(dateKey)
          )}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {formatMonthDay(dateKey)}
          </span>
        </h2>
        {entries.length > 0 || pendingCreates.length > 0 ? (
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {remaining > 0 || pendingCreates.length > 0
              ? `${remaining + pendingCreates.length} left`
              : "all done"}
          </span>
        ) : null}
      </div>

      <div className="mt-1 space-y-0.5">
        {loading ? (
          <div aria-label="Loading tasks" role="status">
            <Skeleton className="h-10 rounded-xl" />
            <span className="sr-only">Loading tasks</span>
          </div>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <SortableContext
              items={entryIds}
              strategy={verticalListSortingStrategy}
            >
              {entries.map((entry) => (
                <TaskRow
                  entry={entry}
                  key={entry.id}
                  onDelete={onDelete}
                  onToggle={onToggle}
                  onUpdate={onUpdate}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}

        {pendingCreates.map((item) => (
          <PendingTaskRow key={item.id} notes={item.notes} title={item.title} />
        ))}

        {draftOpen ? (
          <DraftTaskRow
            key={draftKey}
            onCommit={handleDraftCommit}
            onDiscard={() => setDraftOpen(false)}
          />
        ) : null}
      </div>

      {!draftOpen ? (
        <div className="mt-2">
          <Button
            className="w-full justify-start rounded-xl border-dashed text-muted-foreground hover:text-foreground"
            onClick={() => {
              setDraftKey((key) => key + 1);
              setDraftOpen(true);
            }}
            variant="outline"
          >
            <CirclePlus data-icon="inline-start" />
            Add a task
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function PendingTaskRow({
  title,
  notes,
}: {
  title: string;
  notes: string | null;
}) {
  return (
    <article
      aria-busy
      className="flex min-w-0 items-start gap-2 rounded-xl border border-transparent px-2 py-2.5 opacity-60"
    >
      <Checkbox
        aria-label={`Saving ${title}`}
        checked={false}
        className="mt-1.5"
        disabled
      />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[15px] font-medium leading-5">{title}</p>
        {notes ? (
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{notes}</p>
        ) : null}
      </div>
    </article>
  );
}
