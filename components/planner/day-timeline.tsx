"use client";

import * as React from "react";

import { DaySection } from "@/components/planner/day-section";
import { usePublishTimelineNav } from "@/components/planner/timeline-nav";
import { usePlannerPages } from "@/hooks/use-planner";
import { useTimelineScroll } from "@/hooks/use-timeline-scroll";
import type { PlannerEntryPayload } from "@/lib/api/types";
import {
  plannerPageDayKeys,
  plannerPageIndex,
  type PlannerDateKey,
} from "@/lib/planner/dates";

export function DayTimeline({
  onCreate,
  onDelete,
  onReorder,
  onSchedule,
  onToggle,
  onUpdate,
  schedulePendingTaskId,
  todayKey,
}: {
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
  onSchedule: (input: {
    entry: PlannerEntryPayload;
    plannerDate: PlannerDateKey;
  }) => void;
  onToggle: (entry: PlannerEntryPayload) => void;
  onUpdate: (input: {
    entry: PlannerEntryPayload;
    title?: string;
    notes?: string | null;
  }) => void;
  schedulePendingTaskId?: string | null;
  todayKey: PlannerDateKey;
}) {
  const todayPage = React.useMemo(
    () => plannerPageIndex(todayKey),
    [todayKey],
  );

  // Seed the prior page so earlier days exist above today on first paint.
  const [pageIndices, setPageIndices] = React.useState(() => [
    todayPage - 1,
    todayPage,
  ]);

  const { entriesByDay, loadedPages } = usePlannerPages(pageIndices);

  const dayKeys = React.useMemo(
    () => pageIndices.flatMap((pageIndex) => plannerPageDayKeys(pageIndex)),
    [pageIndices],
  );

  const extendEarlier = React.useCallback(() => {
    let extended = false;
    setPageIndices((current) => {
      const nextIndex = current[0]! - 1;
      if (current.includes(nextIndex)) return current;
      extended = true;
      return [nextIndex, ...current];
    });
    return extended;
  }, []);

  const extendLater = React.useCallback(() => {
    setPageIndices((current) => {
      const nextIndex = current[current.length - 1]! + 1;
      if (current.includes(nextIndex)) return current;
      return [...current, nextIndex];
    });
  }, []);

  const {
    bottomSentinelRef,
    jumpDirection,
    jumpToToday,
    jumpVisible,
    scrollRef,
    todaySectionRef,
    topSentinelRef,
  } = useTimelineScroll({
    loadedToday: loadedPages.has(todayPage),
    onExtendEarlier: extendEarlier,
    onExtendLater: extendLater,
    pageIndices,
    todayKey,
  });

  const setNav = usePublishTimelineNav();

  React.useEffect(() => {
    setNav({
      direction: jumpDirection,
      jumpToToday,
      visible: jumpVisible,
    });
  }, [jumpDirection, jumpToToday, jumpVisible, setNav]);

  return (
    <div className="relative">
      <div
        className="h-(--planner-pane) -ml-4 snap-y snap-mandatory overflow-y-auto overscroll-contain pl-4 sm:-ml-8 sm:pl-8"
        ref={scrollRef}
      >
        <div
          aria-hidden
          className="h-8 w-full shrink-0"
          ref={topSentinelRef}
        />

        {dayKeys.map((dateKey) => {
          const pageIndex = plannerPageIndex(dateKey);
          const isToday = dateKey === todayKey;

          return (
            <DaySection
              dateKey={dateKey}
              entries={entriesByDay.get(dateKey) ?? []}
              isToday={isToday}
              key={dateKey}
              loading={!loadedPages.has(pageIndex)}
              onCreate={onCreate}
              onDelete={onDelete}
              onReorder={onReorder}
              onSchedule={onSchedule}
              onToggle={onToggle}
              onUpdate={onUpdate}
              schedulePendingTaskId={schedulePendingTaskId}
              sectionRef={isToday ? todaySectionRef : undefined}
            />
          );
        })}

        <div
          aria-hidden
          className="h-8 w-full shrink-0"
          ref={bottomSentinelRef}
        />
      </div>
    </div>
  );
}
