"use client";

import * as React from "react";
import { CheckCircle2, Circle, Trash2 } from "lucide-react";

import { DraftTaskRow } from "@/components/planner/draft-task-row";
import { TaskGlyph } from "@/components/planner/task-appearance";
import type { PlannerEntryPayload } from "@/lib/api/types";
import type { TaskColorKey, TaskIconKey } from "@/lib/daily-planner/appearance";
import type { PlannerDateKey } from "@/lib/planner/dates";
import {
  DEFAULT_DURATION_MINUTES,
  MINUTES_PER_DAY,
  SNAP_MINUTES,
  addDays,
  clamp,
  clampTimelineDuration,
  clampTimelineStart,
  layoutOverlaps,
  minutesInTimeZone,
  pointerToDayMinutes,
  snapMinutes,
  timeLabel,
  zonedDateTimeToIso,
} from "@/lib/planner/timeline";
import { cn } from "@/lib/utils";

import styles from "./time-grid.module.css";

export const TIMELINE_HOUR_HEIGHT = 56;
export const TIMELINE_MINUTE_HEIGHT = TIMELINE_HOUR_HEIGHT / 60;
/** Keeps the 12 AM label fully visible inside the clipped grid. */
export const GRID_TOP_PAD = 10;
const GRID_CONTENT_HEIGHT = 24 * TIMELINE_HOUR_HEIGHT;

function gridAtPoint(x: number, y: number) {
  return document
    .elementsFromPoint(x, y)
    .map((element) => element.closest<HTMLElement>("[data-time-grid]"))
    .find(Boolean);
}

function minuteFromPointer(clientY: number, grid: HTMLElement) {
  const rect = grid.getBoundingClientRect();
  return pointerToDayMinutes(
    clientY,
    rect.top + GRID_TOP_PAD,
    GRID_CONTENT_HEIGHT,
  );
}

function TimelineTask({
  entry,
  layout,
  onDelete,
  onSchedule,
  onToggle,
}: {
  entry: PlannerEntryPayload;
  layout: { column: number; columns: number };
  onDelete: (entry: PlannerEntryPayload) => void;
  onSchedule: (input: {
    entry: PlannerEntryPayload;
    plannerDate: PlannerDateKey;
    start: number;
    duration: number;
  }) => void;
  onToggle: (entry: PlannerEntryPayload) => void;
}) {
  const elementRef = React.useRef<HTMLElement>(null);
  const interaction = React.useRef<{
    y: number;
    lastX: number;
    lastY: number;
    mode: "move" | "resize";
    delta: number;
    grabOffset: number;
    moved: boolean;
  } | null>(null);
  const start = minutesInTimeZone(entry.startsAt!, entry.timeZone);
  const storedEnd = entry.endsAt
    ? minutesInTimeZone(entry.endsAt, entry.timeZone)
    : start + DEFAULT_DURATION_MINUTES;
  const duration = Math.max(
    SNAP_MINUTES,
    storedEnd > start ? storedEnd - start : DEFAULT_DURATION_MINUTES,
  );
  const width = 100 / layout.columns;

  function begin(
    event: React.PointerEvent<HTMLElement>,
    mode: "move" | "resize",
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = elementRef.current?.getBoundingClientRect();
    interaction.current = {
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      mode,
      delta: 0,
      grabOffset: rect
        ? clamp(
            (event.clientY - rect.top) / TIMELINE_MINUTE_HEIGHT,
            0,
            duration,
          )
        : 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLElement>) {
    const current = interaction.current;
    const element = elementRef.current;
    if (!current || !element) return;
    current.lastX = event.clientX;
    current.lastY = event.clientY;
    const rawDelta = snapMinutes(
      (event.clientY - current.y) / TIMELINE_MINUTE_HEIGHT,
    );
    const delta =
      current.mode === "move"
        ? rawDelta
        : clamp(
            rawDelta,
            SNAP_MINUTES - duration,
            MINUTES_PER_DAY - SNAP_MINUTES - start - duration,
          );
    current.delta = delta;
    current.moved ||= Math.abs(delta) >= SNAP_MINUTES;
    if (current.mode === "move") {
      element.style.transform = `translateY(${delta * TIMELINE_MINUTE_HEIGHT}px)`;
    } else {
      element.style.height = `${Math.max((duration + delta) * TIMELINE_MINUTE_HEIGHT - 4, 28)}px`;
    }
  }

  function finish() {
    const current = interaction.current;
    interaction.current = null;
    if (elementRef.current) {
      elementRef.current.style.transform = "";
      elementRef.current.style.height = "";
    }
    if (!current?.moved) return;
    if (current.mode === "resize") {
      onSchedule({
        entry,
        plannerDate: entry.plannerDate,
        start,
        duration: duration + current.delta,
      });
      return;
    }

    const targetGrid = gridAtPoint(current.lastX, current.lastY);
    const targetDate = targetGrid?.dataset.date;
    if (targetGrid && targetDate) {
      const startMinute = minuteFromPointer(current.lastY, targetGrid);
      onSchedule({
        entry,
        plannerDate: targetDate,
        start: clampTimelineStart(
          snapMinutes(startMinute - current.grabOffset),
          duration,
        ),
        duration,
      });
      return;
    }

    onSchedule({
      entry,
      plannerDate: entry.plannerDate,
      start: clampTimelineStart(start + current.delta, duration),
      duration,
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const delta = event.key === "ArrowUp" ? -SNAP_MINUTES : SNAP_MINUTES;
    if (event.shiftKey) {
      onSchedule({
        entry,
        plannerDate: entry.plannerDate,
        start,
        duration: clamp(
          duration + delta,
          SNAP_MINUTES,
          MINUTES_PER_DAY - SNAP_MINUTES - start,
        ),
      });
      return;
    }

    const nextStart = start + delta;
    if (nextStart < 0) {
      onSchedule({
        entry,
        plannerDate: addDays(entry.plannerDate, -1),
        start: clampTimelineStart(MINUTES_PER_DAY - duration, duration),
        duration,
      });
      return;
    }
    if (nextStart + duration > MINUTES_PER_DAY - SNAP_MINUTES) {
      onSchedule({
        entry,
        plannerDate: addDays(entry.plannerDate, 1),
        start: 0,
        duration,
      });
      return;
    }
    onSchedule({
      entry,
      plannerDate: entry.plannerDate,
      start: nextStart,
      duration,
    });
  }

  return (
    <article
      aria-label={`${entry.task.title}, ${timeLabel(start)} to ${timeLabel(start + duration)}. Arrow keys move. Shift and arrow keys resize.`}
      className={cn(
        styles.color,
        styles.task,
        entry.task.completedAt && styles.completed,
      )}
      data-color={entry.task.colorKey}
      data-timeline-task
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => begin(event, "move")}
      onPointerMove={move}
      onPointerUp={finish}
      ref={elementRef}
      role="button"
      style={{
        top: GRID_TOP_PAD + start * TIMELINE_MINUTE_HEIGHT + 2,
        height: Math.max(duration * TIMELINE_MINUTE_HEIGHT - 4, 28),
        left: `calc(${layout.column * width}% + 4px)`,
        width: `calc(${width}% - 8px)`,
      }}
      tabIndex={0}
    >
      <span className={styles.icon}>
        <TaskGlyph iconKey={entry.task.iconKey} />
      </span>
      <span className={styles.body}>
        <span className={styles.title}>{entry.task.title}</span>
        {duration >= 30 ? (
          <span className={styles.time}>
            {timeLabel(start)} - {timeLabel(start + duration)}
          </span>
        ) : null}
      </span>
      <button
        aria-label={entry.task.completedAt ? "Mark incomplete" : "Mark complete"}
        className={styles.action}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(entry);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        type="button"
      >
        {entry.task.completedAt ? <CheckCircle2 /> : <Circle />}
      </button>
      <button
        aria-label={`Remove ${entry.task.title}`}
        className={styles.action}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(entry);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        type="button"
      >
        <Trash2 />
      </button>
      <button
        aria-label={`Resize ${entry.task.title}`}
        className={styles.resize}
        onPointerDown={(event) => begin(event, "resize")}
        onPointerMove={move}
        onPointerUp={finish}
        type="button"
      />
    </article>
  );
}

type DraftSlot = {
  start: number;
  duration: number;
};

export function TimeGrid({
  dateKey,
  entries,
  isToday,
  onCreate,
  onDelete,
  onSchedule,
  onToggle,
  timeZone,
}: {
  dateKey: PlannerDateKey;
  entries: PlannerEntryPayload[];
  isToday: boolean;
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
  onSchedule: (input: {
    entry: PlannerEntryPayload;
    plannerDate: PlannerDateKey;
    start: number;
    duration: number;
  }) => void;
  onToggle: (entry: PlannerEntryPayload) => void;
  timeZone: string;
}) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{
    anchor: number;
    pointerId: number;
    moved: boolean;
  } | null>(null);
  const [now, setNow] = React.useState(() => new Date().toISOString());
  const [dragPreview, setDragPreview] = React.useState<DraftSlot | null>(null);
  const [draft, setDraft] = React.useState<DraftSlot | null>(null);
  const [draftKey, setDraftKey] = React.useState(0);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (!isToday) return;
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => window.clearInterval(timer);
  }, [isToday]);

  const layoutById = React.useMemo(
    () =>
      layoutOverlaps(
        entries.map((entry) => {
          const start = minutesInTimeZone(entry.startsAt!, entry.timeZone);
          const end = entry.endsAt
            ? minutesInTimeZone(entry.endsAt, entry.timeZone)
            : start + DEFAULT_DURATION_MINUTES;
          return { id: entry.id, start, end: end > start ? end : start + 30 };
        }),
      ),
    [entries],
  );
  const currentMinute = isToday ? minutesInTimeZone(now, timeZone) : null;
  const activeSlot = draft ?? dragPreview;

  function slotFromPoints(anchor: number, current: number, moved: boolean) {
    if (!moved) {
      return {
        start: clampTimelineStart(anchor, DEFAULT_DURATION_MINUTES),
        duration: DEFAULT_DURATION_MINUTES,
      };
    }
    const start = Math.min(anchor, current);
    const end = Math.max(anchor, current);
    const duration = clampTimelineDuration(
      start,
      Math.max(SNAP_MINUTES, end - start),
    );
    return { start, duration };
  }

  function beginCreate(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || draft || creating) return;
    if ((event.target as HTMLElement).closest("[data-timeline-task]")) return;
    const grid = gridRef.current;
    if (!grid) return;
    event.preventDefault();
    const anchor = minuteFromPointer(event.clientY, grid);
    dragRef.current = {
      anchor,
      pointerId: event.pointerId,
      moved: false,
    };
    setDraft(null);
    setDragPreview({
      start: clampTimelineStart(anchor, DEFAULT_DURATION_MINUTES),
      duration: DEFAULT_DURATION_MINUTES,
    });
    grid.setPointerCapture(event.pointerId);
  }

  function moveCreate(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const grid = gridRef.current;
    if (!drag || !grid || drag.pointerId !== event.pointerId) return;
    const current = minuteFromPointer(event.clientY, grid);
    if (Math.abs(current - drag.anchor) >= SNAP_MINUTES) drag.moved = true;
    setDragPreview(slotFromPoints(drag.anchor, current, drag.moved));
  }

  function finishCreate(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const grid = gridRef.current;
    if (!drag || !grid || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (grid.hasPointerCapture(event.pointerId)) {
      grid.releasePointerCapture(event.pointerId);
    }
    const current = minuteFromPointer(event.clientY, grid);
    const slot = slotFromPoints(drag.anchor, current, drag.moved);
    setDragPreview(null);
    setDraft(slot);
    setDraftKey((key) => key + 1);
  }

  async function commitDraft(input: {
    title: string;
    notes: string | null;
    iconKey: TaskIconKey;
    colorKey: TaskColorKey;
    startMinutes: number | null;
    duration: number;
    scheduleNext: boolean;
    continueDraft: boolean;
  }) {
    if (!draft) return;
    const startMinutes = input.startMinutes ?? draft.start;
    const duration = clampTimelineDuration(startMinutes, input.duration);
    setCreating(true);
    try {
      await onCreate({
        dateKey,
        title: input.title,
        notes: input.notes,
        iconKey: input.iconKey,
        colorKey: input.colorKey,
        startsAt: zonedDateTimeToIso(dateKey, startMinutes, timeZone),
        endsAt: zonedDateTimeToIso(dateKey, startMinutes + duration, timeZone),
      });
      setDraft(null);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className={styles.grid}
      data-date={dateKey}
      data-time-grid
      onPointerCancel={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        setDragPreview(null);
      }}
      onPointerDown={beginCreate}
      onPointerMove={moveCreate}
      onPointerUp={finishCreate}
      ref={gridRef}
    >
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          className={styles.hour}
          key={hour}
          style={{ top: GRID_TOP_PAD + hour * TIMELINE_HOUR_HEIGHT }}
        >
          <span
            className={cn(styles.hourLabel, hour === 0 && styles.hourLabelFirst)}
          >
            {timeLabel(hour * 60).replace(":00", "")}
          </span>
        </div>
      ))}
      {currentMinute !== null ? (
        <div
          aria-label={`Current time ${timeLabel(currentMinute)}`}
          className={styles.now}
          data-current-time-line
          role="separator"
          style={{ top: GRID_TOP_PAD + currentMinute * TIMELINE_MINUTE_HEIGHT }}
        >
          <span>{timeLabel(currentMinute)}</span>
        </div>
      ) : null}
      <div className={styles.events}>
        {entries.map((entry) => (
          <TimelineTask
            entry={entry}
            key={entry.id}
            layout={layoutById.get(entry.id) ?? { column: 0, columns: 1 }}
            onDelete={onDelete}
            onSchedule={onSchedule}
            onToggle={onToggle}
          />
        ))}
        {activeSlot ? (
          <div
            aria-hidden={Boolean(draft)}
            className={cn(styles.draftBlock, draft && styles.draftBlockSolid)}
            style={{
              top: GRID_TOP_PAD + activeSlot.start * TIMELINE_MINUTE_HEIGHT + 2,
              height: Math.max(
                activeSlot.duration * TIMELINE_MINUTE_HEIGHT - 4,
                28,
              ),
            }}
          >
            <span className={styles.draftTime}>
              {timeLabel(activeSlot.start)} –{" "}
              {timeLabel(activeSlot.start + activeSlot.duration)}
            </span>
          </div>
        ) : null}
      </div>
      {draft ? (
        <div
          className={styles.draftForm}
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            top: Math.min(
              GRID_TOP_PAD +
                (draft.start + draft.duration) * TIMELINE_MINUTE_HEIGHT +
                8,
              GRID_TOP_PAD + GRID_CONTENT_HEIGHT - 220,
            ),
          }}
        >
          <DraftTaskRow
            hideScheduleNext
            initialDuration={draft.duration}
            initialStartMinutes={draft.start}
            key={draftKey}
            onCommit={(input) => void commitDraft(input)}
            onDiscard={() => setDraft(null)}
            pending={creating}
          />
        </div>
      ) : null}
    </div>
  );
}
