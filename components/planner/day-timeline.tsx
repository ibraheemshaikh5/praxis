"use client";

import * as React from "react";

import { DaySection } from "@/components/planner/day-section";
import { JumpToToday } from "@/components/planner/jump-to-today";
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
  onToggle,
  pendingCreate,
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
  onToggle: (entry: PlannerEntryPayload) => void;
  pendingCreate: boolean;
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

  return (
    <div className="relative">
      <div
        className="h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain"
        ref={scrollRef}
      >
        <div
          aria-hidden
          className="h-8 w-full shrink-0"
          ref={topSentinelRef}
        />

        <div className="divide-y divide-border/60 pb-24">
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
                onToggle={onToggle}
                pendingCreate={pendingCreate}
                sectionRef={isToday ? todaySectionRef : undefined}
              />
            );
          })}
        </div>

        <div
          aria-hidden
          className="h-8 w-full shrink-0"
          ref={bottomSentinelRef}
        />
      </div>

      <JumpToToday
        direction={jumpDirection}
        onJump={jumpToToday}
        visible={jumpVisible}
      />
    </div>
  );
}
