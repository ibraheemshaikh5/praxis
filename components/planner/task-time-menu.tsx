"use client";

import * as React from "react";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMetricsAnchor } from "@/hooks/use-metrics";
import type { PlannerEntryPayload } from "@/lib/api/types";
import type { PlannerDateKey } from "@/lib/planner/dates";
import {
  DEFAULT_DURATION_MINUTES,
  SNAP_MINUTES,
  clampTimelineStart,
  minutesInTimeZone,
  minutesToTimeInput,
  pointerToDayMinutes,
  timeInputToMinutes,
} from "@/lib/planner/timeline";
import { cn } from "@/lib/utils";

const ACTION_VISIBILITY =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 data-popup-open:opacity-100 motion-reduce:transition-none";

export function TaskTimeMenu({
  entry,
  onSchedule,
  onScheduleAtTime,
  pending,
}: {
  entry: PlannerEntryPayload;
  onSchedule: (input: {
    entry: PlannerEntryPayload;
    plannerDate: PlannerDateKey;
  }) => void;
  onScheduleAtTime: (input: {
    entry: PlannerEntryPayload;
    plannerDate: PlannerDateKey;
    start: number;
    duration: number;
  }) => void;
  pending?: boolean;
}) {
  const todayKey = useMetricsAnchor();
  const existingStart = entry.startsAt
    ? minutesInTimeZone(entry.startsAt, entry.timeZone)
    : null;
  const existingEnd = entry.endsAt
    ? minutesInTimeZone(entry.endsAt, entry.timeZone)
    : null;
  const initialDuration =
    existingStart !== null && existingEnd !== null && existingEnd > existingStart
      ? existingEnd - existingStart
      : DEFAULT_DURATION_MINUTES;
  const fallbackStart =
    entry.plannerDate === todayKey
      ? Math.ceil(
          minutesInTimeZone(new Date().toISOString(), entry.timeZone) /
            SNAP_MINUTES,
        ) * SNAP_MINUTES
      : 8 * 60;
  const [open, setOpen] = React.useState(false);
  const [startTime, setStartTime] = React.useState(
    minutesToTimeInput(existingStart ?? Math.min(fallbackStart, 23 * 60 + 45)),
  );
  const [duration, setDuration] = React.useState(initialDuration);
  const dragRef = React.useRef<{
    pointerId: number;
    x: number;
    y: number;
    dragging: boolean;
  } | null>(null);
  const suppressClickRef = React.useRef(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setStartTime(
      minutesToTimeInput(existingStart ?? Math.min(fallbackStart, 23 * 60 + 45)),
    );
    setDuration(initialDuration);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0 || pending) return;
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.x, event.clientY - drag.y);
    if (distance < 6) return;
    drag.dragging = true;
    event.preventDefault();
    event.currentTarget.dataset.dragging = "true";
  }

  function handlePointerUp(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    delete event.currentTarget.dataset.dragging;
    if (!drag?.dragging) return;

    suppressClickRef.current = true;
    const grid = document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>("[data-time-grid]"))
      .find(Boolean);
    const plannerDate = grid?.dataset.date;
    if (!grid || !plannerDate) return;
    const rect = grid.getBoundingClientRect();
    const start = clampTimelineStart(
      pointerToDayMinutes(event.clientY, rect.top, rect.height),
      DEFAULT_DURATION_MINUTES,
    );
    onScheduleAtTime({
      entry,
      plannerDate,
      start,
      duration: DEFAULT_DURATION_MINUTES,
    });
  }

  function save() {
    const parsedStart = timeInputToMinutes(startTime);
    if (parsedStart === null) return;
    setOpen(false);
    onScheduleAtTime({
      entry,
      plannerDate: entry.plannerDate,
      start: clampTimelineStart(parsedStart, duration),
      duration,
    });
  }

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger
        aria-label={`Set a time for ${entry.task.title}`}
        className={cn(
          "inline-flex size-8 touch-none items-center justify-center rounded-4xl text-muted-foreground",
          ACTION_VISIBILITY,
          "cursor-grab hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[dragging=true]:cursor-grabbing data-[dragging=true]:bg-muted",
          pending && "pointer-events-none opacity-50",
        )}
        disabled={pending}
        onClick={(event) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          event.preventDefault();
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Set a time or drag onto the calendar"
      >
        <Clock className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-3 p-3" side="bottom">
        <div>
          <p className="text-sm font-medium">Schedule task</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose a start and duration.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Start</span>
            <Input
              aria-label="Task start time"
              className="h-8 rounded-xl px-2 font-mono text-xs"
              onChange={(event) => setStartTime(event.target.value)}
              step={900}
              type="time"
              value={startTime}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Duration</span>
            <select
              aria-label="Task duration"
              className="h-8 w-full rounded-xl border border-transparent bg-input/50 px-2 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              onChange={(event) => setDuration(Number(event.target.value))}
              value={duration}
            >
              {[15, 30, 45, 60, 90, 120].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between gap-2">
          {entry.startsAt ? (
            <Button
              onClick={() => {
                setOpen(false);
                onSchedule({ entry, plannerDate: entry.plannerDate });
              }}
              size="sm"
              variant="ghost"
            >
              Remove time
            </Button>
          ) : (
            <span />
          )}
          <Button disabled={timeInputToMinutes(startTime) === null} onClick={save} size="sm">
            Save
          </Button>
        </div>
        <span className="sr-only">
          Times are limited to one day and snap to {SNAP_MINUTES}-minute intervals.
        </span>
      </PopoverContent>
    </Popover>
  );
}
