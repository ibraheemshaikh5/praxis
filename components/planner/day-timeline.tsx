"use client";

import * as React from "react";

import { DaySection } from "@/components/planner/day-section";
import { TimeGrid, TIMELINE_HOUR_HEIGHT } from "@/components/planner/time-grid";
import { usePublishTimelineNav } from "@/components/planner/timeline-nav";
import { WeekSelector } from "@/components/planner/week-selector";
import { usePlannerPages } from "@/hooks/use-planner";
import type { PlannerEntryPayload } from "@/lib/api/types";
import type { TaskColorKey, TaskIconKey } from "@/lib/daily-planner/appearance";
import {
  addPlannerDaysToKey,
  plannerPageIndex,
  type PlannerDateKey,
} from "@/lib/planner/dates";
import {
  clampTimelineDuration,
  minutesInTimeZone,
  plannerWeek,
  zonedDateTimeToIso,
} from "@/lib/planner/timeline";

export function DayTimeline({
  onCreate,
  onDelete,
  onReorder,
  onSchedule,
  onToggle,
  onUpdate,
  schedulePendingTaskId,
  timeZone,
  todayKey,
}: {
  onCreate: (input: {
    dateKey: PlannerDateKey;
    title: string;
    notes: string | null;
    iconKey: TaskIconKey;
    colorKey: TaskColorKey;
  }) => Promise<void>;
  onDelete: (entry: PlannerEntryPayload) => void;
  onReorder: (input: {
    plannerDate: PlannerDateKey;
    orderedEntryIds: string[];
  }) => void;
  onSchedule: (input: {
    entry: PlannerEntryPayload;
    plannerDate: PlannerDateKey;
    startsAt?: string | null;
    endsAt?: string | null;
  }) => void;
  onToggle: (entry: PlannerEntryPayload) => void;
  onUpdate: (input: {
    entry: PlannerEntryPayload;
    title?: string;
    notes?: string | null;
  }) => void;
  schedulePendingTaskId?: string | null;
  timeZone: string;
  todayKey: PlannerDateKey;
}) {
  const [selectedDate, setSelectedDate] = React.useState(todayKey);
  const nextDate = addPlannerDaysToKey(selectedDate, 1);
  const visibleDates = React.useMemo(
    () => [...plannerWeek(selectedDate), nextDate],
    [nextDate, selectedDate],
  );
  const pageIndices = React.useMemo(
    () => [...new Set(visibleDates.map(plannerPageIndex))],
    [visibleDates],
  );
  const { entriesByDay, loadedPages } = usePlannerPages(pageIndices);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const timelineRef = React.useRef<HTMLDivElement>(null);
  const selectedEntries = entriesByDay.get(selectedDate) ?? [];
  const nextEntries = entriesByDay.get(nextDate) ?? [];
  const unscheduled = selectedEntries.filter((entry) => !entry.startsAt);
  const timed = [...selectedEntries, ...nextEntries].filter(
    (entry) => entry.startsAt,
  );

  const setNav = usePublishTimelineNav();
  const jumpToToday = React.useCallback(
    () => setSelectedDate(todayKey),
    [todayKey],
  );

  React.useEffect(() => {
    setNav({
      direction: selectedDate < todayKey ? "down" : "up",
      jumpToToday,
      visible: selectedDate !== todayKey,
    });
  }, [jumpToToday, selectedDate, setNav, todayKey]);

  React.useLayoutEffect(() => {
    if (!loadedPages.has(plannerPageIndex(selectedDate))) return;
    const scroll = scrollRef.current;
    const timeline = timelineRef.current;
    if (!scroll || !timeline) return;
    const currentMinute =
      selectedDate === todayKey
        ? minutesInTimeZone(new Date().toISOString(), timeZone)
        : 8 * 60;
    const targetMinute = Math.max(0, currentMinute - 60);
    scroll.scrollTop =
      timeline.offsetTop + (targetMinute / 60) * TIMELINE_HOUR_HEIGHT - 112;
  }, [loadedPages, selectedDate, timeZone, todayKey]);

  const scheduleAtTime = React.useCallback(
    (input: {
      entry: PlannerEntryPayload;
      plannerDate: PlannerDateKey;
      start: number;
      duration: number;
    }) => {
      const duration = clampTimelineDuration(input.start, input.duration);
      onSchedule({
        entry: input.entry,
        plannerDate: input.plannerDate,
        startsAt: zonedDateTimeToIso(input.plannerDate, input.start, timeZone),
        endsAt: zonedDateTimeToIso(
          input.plannerDate,
          input.start + duration,
          timeZone,
        ),
      });
    },
    [onSchedule, timeZone],
  );

  return (
    <div className="relative">
      <div
        className="h-(--planner-pane) -mx-4 overflow-y-auto overscroll-contain px-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
        ref={scrollRef}
      >
        <WeekSelector
          entriesByDay={entriesByDay}
          onSelect={setSelectedDate}
          onShiftWeek={(amount) =>
            setSelectedDate((current) => addPlannerDaysToKey(current, amount))
          }
          selectedDate={selectedDate}
          todayKey={todayKey}
        />

        <DaySection
          dateKey={selectedDate}
          entries={unscheduled}
          isToday={selectedDate === todayKey}
          loading={!loadedPages.has(plannerPageIndex(selectedDate))}
          onCreate={onCreate}
          onDelete={onDelete}
          onReorder={onReorder}
          onSchedule={onSchedule}
          onScheduleAtTime={scheduleAtTime}
          onToggle={onToggle}
          onUpdate={onUpdate}
          schedulePendingTaskId={schedulePendingTaskId}
          timeline={
            <TimeGrid
              entries={timed}
              nextDate={nextDate}
              onDelete={onDelete}
              onSchedule={scheduleAtTime}
              onToggle={onToggle}
              selectedDate={selectedDate}
              timelineRef={timelineRef}
            />
          }
        />
      </div>
    </div>
  );
}
