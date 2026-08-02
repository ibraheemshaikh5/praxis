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
import type { TaskColorKey, TaskIconKey } from "@/lib/daily-planner/appearance";
import {
  addPlannerDaysToKey,
  formatMonthDay,
  formatWeekday,
  type PlannerDateKey,
} from "@/lib/planner/dates";
import {
  MINUTES_PER_DAY,
  minutesInTimeZone,
  resolveAutoPlacement,
  zonedDateTimeToIso,
} from "@/lib/planner/timeline";
import { cn } from "@/lib/utils";

type PendingCreate = {
  id: string;
  title: string;
  notes: string | null;
  iconKey: TaskIconKey;
  colorKey: TaskColorKey;
  timeLabel: string | null;
};

export function DaySection({
  dateKey,
  entries,
  isToday,
  loading,
  onCreate,
  onDelete,
  onReorder,
  onSchedule,
  onToggle,
  onUpdate,
  schedulePendingTaskId,
  schedulingEntries = entries,
  sectionRef,
  timeZone,
  timeline,
  onScheduleAtTime,
  mode = "list",
}: {
  dateKey: PlannerDateKey;
  entries: PlannerEntryPayload[];
  isToday: boolean;
  loading: boolean;
  onCreate: (input: {
    dateKey: PlannerDateKey;
    title: string;
    notes: string | null;
    iconKey: TaskIconKey;
    colorKey: TaskColorKey;
    startsAt?: string | null;
    endsAt?: string | null;
  }) => Promise<void>;
  onDelete: (entry: PlannerEntryPayload) => void;
  onReorder: (input: {
    plannerDate: PlannerDateKey;
    orderedEntryIds: string[];
  }) => void;
  onSchedule: (input: {
    entry: PlannerEntryPayload;
    plannerDate: PlannerDateKey;
  }) => void;
  onScheduleAtTime?: (input: {
    entry: PlannerEntryPayload;
    plannerDate: PlannerDateKey;
    start: number;
    duration: number;
  }) => void;
  onToggle: (entry: PlannerEntryPayload) => void;
  onUpdate: (input: {
    entry: PlannerEntryPayload;
    title?: string;
    notes?: string | null;
  }) => void;
  schedulePendingTaskId?: string | null;
  schedulingEntries?: PlannerEntryPayload[];
  sectionRef?: React.Ref<HTMLElement>;
  timeZone: string;
  timeline?: React.ReactNode;
  mode?: "list" | "calendar";
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
    iconKey: TaskIconKey;
    colorKey: TaskColorKey;
    startMinutes: number | null;
    duration: number;
    scheduleNext: boolean;
    continueDraft: boolean;
  }) {
    let targetDate = dateKey;
    let startMinutes = input.startMinutes;

    if (input.scheduleNext) {
      const latestEnd = schedulingEntries.reduce<number | null>(
        (latest, entry) => {
          if (!entry.startsAt) return latest;
          const start = minutesInTimeZone(entry.startsAt, entry.timeZone);
          const end = entry.endsAt
            ? minutesInTimeZone(entry.endsAt, entry.timeZone)
            : start + 30;
          const normalizedEnd = end > start ? end : start + 30;
          return latest === null ? normalizedEnd : Math.max(latest, normalizedEnd);
        },
        null,
      );
      const placement = resolveAutoPlacement({
        duration: input.duration,
        isToday,
        latestEnd,
        nowMinutes: minutesInTimeZone(new Date().toISOString(), timeZone),
      });
      targetDate = addPlannerDaysToKey(dateKey, placement.dayOffset);
      startMinutes = placement.start;
    }

    if (
      startMinutes !== null &&
      startMinutes + input.duration > MINUTES_PER_DAY
    ) {
      startMinutes = Math.max(0, MINUTES_PER_DAY - input.duration);
    }

    const startsAt =
      startMinutes === null
        ? null
        : zonedDateTimeToIso(targetDate, startMinutes, timeZone);
    const endsAt =
      startMinutes === null
        ? null
        : zonedDateTimeToIso(
            targetDate,
            startMinutes + input.duration,
            timeZone,
          );
    const pendingId = crypto.randomUUID();
    setPendingCreates((current) => [
      ...current,
      {
        id: pendingId,
        title: input.title,
        notes: input.notes,
        iconKey: input.iconKey,
        colorKey: input.colorKey,
        timeLabel:
          startMinutes === null
            ? null
            : `${String(Math.floor(startMinutes / 60) % 12 || 12)}:${String(startMinutes % 60).padStart(2, "0")} ${startMinutes >= 720 ? "PM" : "AM"}`,
      },
    ]);

    if (input.continueDraft) {
      setDraftKey((key) => key + 1);
    } else {
      setDraftOpen(false);
    }

    try {
      await onCreate({
        dateKey: targetDate,
        title: input.title,
        notes: input.notes,
        iconKey: input.iconKey,
        colorKey: input.colorKey,
        startsAt,
        endsAt,
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
      className={cn(
        "flex flex-col border-t border-border/60 py-5",
        mode === "list" &&
          "min-h-full snap-start snap-always first:border-t-0",
        mode === "calendar" && "first:border-t-0",
      )}
      data-day={dateKey}
      id={`day-${dateKey}`}
      ref={sectionRef}
    >
      <div
        className={cn(
          "sticky top-0 z-20 -mx-1 flex items-baseline justify-between gap-4 bg-background/90 px-1 py-2 backdrop-blur-md",
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
                  onSchedule={onSchedule}
                  onScheduleAtTime={onScheduleAtTime}
                  onToggle={onToggle}
                  onUpdate={onUpdate}
                  schedulePending={schedulePendingTaskId === entry.taskId}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}

        {pendingCreates.map((item) => (
          <PendingTaskRow
            key={item.id}
            notes={item.notes}
            timeLabel={item.timeLabel}
            title={item.title}
          />
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

      {timeline}
    </section>
  );
}

function PendingTaskRow({
  title,
  notes,
  timeLabel,
}: {
  title: string;
  notes: string | null;
  timeLabel: string | null;
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
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {notes}
          </p>
        ) : null}
      </div>
      {timeLabel ? (
        <span className="shrink-0 pt-1 font-mono text-xs tabular-nums text-muted-foreground">
          {timeLabel}
        </span>
      ) : null}
    </article>
  );
}
