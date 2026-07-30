"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";

import { PlannerDatePicker } from "@/components/planner/planner-date-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMetricsAnchor } from "@/hooks/use-metrics";
import type { PlannerEntryPayload } from "@/lib/api/types";
import type { PlannerDateKey } from "@/lib/planner/dates";
import { cn } from "@/lib/utils";

export function TaskDateMenu({
  entry,
  onSchedule,
  pending,
}: {
  entry: PlannerEntryPayload;
  onSchedule: (input: {
    entry: PlannerEntryPayload;
    plannerDate: PlannerDateKey;
  }) => void;
  pending?: boolean;
}) {
  const todayKey = useMetricsAnchor();
  const [open, setOpen] = React.useState(false);

  function handleSelect(plannerDate: PlannerDateKey) {
    setOpen(false);
    if (plannerDate === entry.plannerDate) return;
    onSchedule({ entry, plannerDate });
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        aria-label={`Move ${entry.task.title} to another day`}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-4xl text-muted-foreground",
          "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none",
          "hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          "aria-expanded:opacity-100 data-popup-open:opacity-100",
          pending && "pointer-events-none opacity-50",
        )}
        disabled={pending}
        onMouseDown={(event) => event.preventDefault()}
      >
        <CalendarDays className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3" side="bottom">
        {open && todayKey ? (
          <PlannerDatePicker
            key={entry.plannerDate}
            onSelect={handleSelect}
            selectedDate={entry.plannerDate}
            todayKey={todayKey}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
