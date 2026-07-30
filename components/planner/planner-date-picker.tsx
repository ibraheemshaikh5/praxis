"use client";

import * as React from "react";

import { Calendar } from "@/components/ui/calendar";
import {
  formatMonthDay,
  formatWeekday,
  type PlannerDateKey,
} from "@/lib/planner/dates";

function plannerKeyToLocalDate(key: PlannerDateKey): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function localDateToPlannerKey(date: Date): PlannerDateKey {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function PlannerDatePicker({
  onSelect,
  selectedDate,
  todayKey,
}: {
  onSelect: (dateKey: PlannerDateKey) => void;
  selectedDate: PlannerDateKey;
  todayKey: PlannerDateKey;
}) {
  const selected = React.useMemo(
    () => plannerKeyToLocalDate(selectedDate),
    [selectedDate],
  );
  const today = React.useMemo(
    () => plannerKeyToLocalDate(todayKey),
    [todayKey],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="px-1">
        <p className="text-sm font-medium text-foreground">Move to date</p>
        <p className="text-xs text-muted-foreground">
          Currently on {formatWeekday(selectedDate)}, {formatMonthDay(selectedDate)}
        </p>
      </div>

      <Calendar
        className="p-0"
        defaultMonth={selected}
        mode="single"
        onSelect={(date) => {
          if (!date) return;
          onSelect(localDateToPlannerKey(date));
        }}
        selected={selected}
        today={today}
      />
    </div>
  );
}
