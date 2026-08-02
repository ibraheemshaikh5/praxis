"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { TaskGlyph } from "@/components/planner/task-appearance";
import { Button } from "@/components/ui/button";
import type { PlannerEntryPayload } from "@/lib/api/types";
import {
  formatDayNumber,
  formatShortWeekday,
  type PlannerDateKey,
} from "@/lib/planner/dates";
import { plannerWeek } from "@/lib/planner/timeline";
import { cn } from "@/lib/utils";

export function WeekSelector({
  entriesByDay,
  onSelect,
  onShiftWeek,
  selectedDate,
  todayKey,
}: {
  entriesByDay: Map<PlannerDateKey, PlannerEntryPayload[]>;
  onSelect: (date: PlannerDateKey) => void;
  onShiftWeek: (amount: number) => void;
  selectedDate: PlannerDateKey;
  todayKey: PlannerDateKey;
}) {
  const days = plannerWeek(selectedDate);

  return (
    <div className="-mx-1 px-1">
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-1 rounded-xl bg-muted/45 p-1">
        <Button
          aria-label="Previous week"
          onClick={() => onShiftWeek(-7)}
          size="icon-sm"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>

        <div className="grid min-w-0 grid-cols-7 gap-0.5">
          {days.map((date) => {
            const selected = date === selectedDate;
            const entries = entriesByDay.get(date) ?? [];
            const markers = entries.slice(0, 3);
            const extra = Math.max(0, entries.length - markers.length);

            return (
              <button
                aria-label={`${formatShortWeekday(date)}, ${formatDayNumber(date)}`}
                aria-pressed={selected}
                className={cn(
                  "flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl px-0.5 py-1 text-muted-foreground transition-colors",
                  "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 motion-reduce:transition-none",
                  selected &&
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  !selected && date === todayKey && "text-primary",
                )}
                key={date}
                onClick={() => onSelect(date)}
                type="button"
              >
                <span className="text-[9px] font-medium uppercase tracking-[0.08em] sm:text-[10px]">
                  {formatShortWeekday(date).slice(0, 3)}
                </span>
                <span className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                  {formatDayNumber(date)}
                </span>
                <span className="mt-1 flex h-3 items-center justify-center -space-x-1">
                  {markers.map((entry) => (
                    <span
                      className={cn(
                        "grid size-3 place-items-center rounded-full border border-card bg-muted text-foreground",
                        selected &&
                          "border-primary bg-primary-foreground/20 text-primary-foreground",
                      )}
                      key={entry.id}
                    >
                      <span className="[&>svg]:size-2">
                        <TaskGlyph iconKey={entry.task.iconKey} />
                      </span>
                    </span>
                  ))}
                  {extra ? (
                    <span className="ml-1 font-mono text-[8px]">+{extra}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          aria-label="Next week"
          onClick={() => onShiftWeek(7)}
          size="icon-sm"
          variant="ghost"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
