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

import { AddTaskForm } from "@/components/planner/add-task-form";
import { TaskRow } from "@/components/planner/task-row";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlannerEntryPayload } from "@/lib/api/types";
import {
  formatMonthDay,
  formatWeekday,
  type PlannerDateKey,
} from "@/lib/planner/dates";
import { cn } from "@/lib/utils";

export function DaySection({
  dateKey,
  entries,
  isToday,
  loading,
  onCreate,
  onDelete,
  onReorder,
  onToggle,
  pendingCreate,
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
  pendingCreate: boolean;
  sectionRef?: React.Ref<HTMLElement>;
}) {
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

  return (
    <section
      aria-labelledby={headingId}
      className="scroll-mt-0 py-5"
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
        {entries.length > 0 ? (
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {remaining > 0 ? `${remaining} left` : "all done"}
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
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="mt-2">
        <AddTaskForm
          dateKey={dateKey}
          onSubmit={({ title, notes }) => onCreate({ dateKey, title, notes })}
          pending={pendingCreate}
        />
      </div>
    </section>
  );
}
