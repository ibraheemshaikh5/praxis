"use client";

import * as React from "react";

import { DaySection } from "@/components/planner/day-section";
import { TimeGrid } from "@/components/planner/time-grid";
import { usePublishTimelineNav } from "@/components/planner/timeline-nav";
import { WeekSelector } from "@/components/planner/week-selector";
import type { PlannerView } from "@/components/planner/planner-view-toggle";
import { usePlannerPages } from "@/hooks/use-planner";
import { useTimelineScroll } from "@/hooks/use-timeline-scroll";
import type { PlannerEntryPayload } from "@/lib/api/types";
import type { TaskColorKey, TaskIconKey } from "@/lib/daily-planner/appearance";
import {
  addPlannerDaysToKey,
  plannerPageDayKeys,
  plannerPageIndex,
  type PlannerDateKey,
} from "@/lib/planner/dates";
import {
  clampTimelineDuration,
  zonedDateTimeToIso,
} from "@/lib/planner/timeline";
import { cn } from "@/lib/utils";

type CreateInput = {
  dateKey: PlannerDateKey;
  title: string;
  notes: string | null;
  iconKey: TaskIconKey;
  colorKey: TaskColorKey;
  startsAt?: string | null;
  endsAt?: string | null;
};

type ScheduleAtTimeInput = {
  entry: PlannerEntryPayload;
  plannerDate: PlannerDateKey;
  start: number;
  duration: number;
};

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
  view,
}: {
  onCreate: (input: CreateInput) => Promise<void>;
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
  view: PlannerView;
}) {
  const todayPage = React.useMemo(() => plannerPageIndex(todayKey), [todayKey]);
  const [selectedDate, setSelectedDate] = React.useState(todayKey);
  const [scrollTarget, setScrollTarget] = React.useState<{
    date: PlannerDateKey;
    request: number;
  }>({ date: todayKey, request: 0 });
  const [pageIndices, setPageIndices] = React.useState(() => [
    todayPage - 1,
    todayPage,
  ]);
  const previousView = React.useRef(view);

  React.useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    setSelectedDate(todayKey);
    setScrollTarget((current) => ({
      date: todayKey,
      request: current.request + 1,
    }));
  }, [todayKey, view]);

  const { entriesByDay, loadedPages } = usePlannerPages(pageIndices);
  const dayKeys = React.useMemo(
    () =>
      pageIndices
        .flatMap((pageIndex) => plannerPageDayKeys(pageIndex))
        .reverse(),
    [pageIndices],
  );

  const ensureDateLoaded = React.useCallback((date: PlannerDateKey) => {
    const page = plannerPageIndex(date);
    setPageIndices((current) =>
      current.includes(page) ? current : [...current, page].sort((a, b) => a - b),
    );
  }, []);

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
    let extended = false;
    setPageIndices((current) => {
      const nextIndex = current[current.length - 1]! + 1;
      if (current.includes(nextIndex)) return current;
      extended = true;
      return [...current, nextIndex];
    });
    return extended;
  }, []);

  const requestDate = React.useCallback(
    (date: PlannerDateKey) => {
      ensureDateLoaded(date);
      setSelectedDate(date);
      setScrollTarget((current) => ({ date, request: current.request + 1 }));
    },
    [ensureDateLoaded],
  );

  const scheduleAtTime = React.useCallback(
    (input: ScheduleAtTimeInput) => {
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
    <div className="flex h-(--planner-pane) min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/60 bg-background pb-3 pt-2">
        <WeekSelector
          entriesByDay={entriesByDay}
          onSelect={requestDate}
          onShiftWeek={(amount) =>
            requestDate(addPlannerDaysToKey(selectedDate, amount))
          }
          selectedDate={selectedDate}
          todayKey={todayKey}
        />
      </div>

      <PlannerDayFeed
        dayKeys={dayKeys}
        entriesByDay={entriesByDay}
        key={view}
        loadedPages={loadedPages}
        mode={view}
        onCreate={onCreate}
        onDelete={onDelete}
        onExtendBottom={extendEarlier}
        onExtendTop={extendLater}
        onReorder={onReorder}
        onSchedule={onSchedule}
        onScheduleAtTime={scheduleAtTime}
        onToggle={onToggle}
        onUpdate={onUpdate}
        onVisibleDate={setSelectedDate}
        pageIndices={pageIndices}
        schedulePendingTaskId={schedulePendingTaskId}
        scrollTarget={scrollTarget}
        timeZone={timeZone}
        todayKey={todayKey}
      />
    </div>
  );
}

function sectionScrollTop(container: HTMLElement, section: HTMLElement) {
  return (
    container.scrollTop +
    (section.getBoundingClientRect().top - container.getBoundingClientRect().top)
  );
}

function PlannerDayFeed({
  dayKeys,
  entriesByDay,
  loadedPages,
  mode,
  onCreate,
  onDelete,
  onExtendBottom,
  onExtendTop,
  onReorder,
  onSchedule,
  onScheduleAtTime,
  onToggle,
  onUpdate,
  onVisibleDate,
  pageIndices,
  schedulePendingTaskId,
  scrollTarget,
  timeZone,
  todayKey,
}: {
  dayKeys: PlannerDateKey[];
  entriesByDay: Map<PlannerDateKey, PlannerEntryPayload[]>;
  loadedPages: Set<number>;
  mode: PlannerView;
  onCreate: (input: CreateInput) => Promise<void>;
  onDelete: (entry: PlannerEntryPayload) => void;
  onExtendBottom: () => boolean;
  onExtendTop: () => boolean;
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
  onScheduleAtTime: (input: ScheduleAtTimeInput) => void;
  onToggle: (entry: PlannerEntryPayload) => void;
  onUpdate: (input: {
    entry: PlannerEntryPayload;
    title?: string;
    notes?: string | null;
  }) => void;
  onVisibleDate: (date: PlannerDateKey) => void;
  pageIndices: number[];
  schedulePendingTaskId?: string | null;
  scrollTarget: { date: PlannerDateKey; request: number };
  timeZone: string;
  todayKey: PlannerDateKey;
}) {
  const todayPage = plannerPageIndex(todayKey);
  const calendarTodayOffset = React.useCallback(
    (container: HTMLDivElement, today: HTMLElement) => {
      const line = today.querySelector<HTMLElement>("[data-current-time-line]");
      if (!line) return sectionScrollTop(container, today);
      const containerTop = container.getBoundingClientRect().top;
      const lineTop = line.getBoundingClientRect().top - containerTop;
      return Math.max(
        0,
        container.scrollTop + lineTop - container.clientHeight / 3,
      );
    },
    [],
  );
  const {
    bottomSentinelRef,
    jumpDirection,
    jumpToToday,
    jumpVisible,
    scrollRef,
    todaySectionRef,
    topSentinelRef,
  } = useTimelineScroll({
    getTodayScrollTop: mode === "calendar" ? calendarTodayOffset : undefined,
    loadedToday: loadedPages.has(todayPage),
    onExtendBottom,
    onExtendTop,
    onVisibleDate,
    pageIndices,
    todayKey,
  });
  const setNav = usePublishTimelineNav();

  React.useEffect(() => {
    setNav({ direction: jumpDirection, jumpToToday, visible: jumpVisible });
  }, [jumpDirection, jumpToToday, jumpVisible, setNav]);

  React.useLayoutEffect(() => {
    if (!scrollTarget.request) return;
    if (!loadedPages.has(plannerPageIndex(scrollTarget.date))) return;
    const container = scrollRef.current;
    const section = container?.querySelector<HTMLElement>(
      `[data-day="${scrollTarget.date}"]`,
    );
    if (!container || !section) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    container.scrollTo({
      top: sectionScrollTop(container, section),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [loadedPages, scrollRef, scrollTarget]);

  return (
    <div
      className={cn(
        "relative min-h-0 flex-1 overflow-y-auto overscroll-contain",
        "-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10",
        mode === "list" && "snap-y snap-mandatory",
      )}
      ref={scrollRef}
    >
      <div aria-hidden className="h-px w-full" ref={topSentinelRef} />

      {dayKeys.map((dateKey) => {
        const entries = entriesByDay.get(dateKey) ?? [];
        const isToday = dateKey === todayKey;
        const visibleEntries = mode === "calendar" ? [] : entries;

        return (
          <DaySection
            dateKey={dateKey}
            entries={visibleEntries}
            isToday={isToday}
            key={dateKey}
            loading={!loadedPages.has(plannerPageIndex(dateKey))}
            mode={mode}
            onCreate={onCreate}
            onDelete={onDelete}
            onReorder={onReorder}
            onSchedule={onSchedule}
            onScheduleAtTime={onScheduleAtTime}
            onToggle={onToggle}
            onUpdate={onUpdate}
            schedulePendingTaskId={schedulePendingTaskId}
            schedulingEntries={entries}
            sectionRef={isToday ? todaySectionRef : undefined}
            timeZone={timeZone}
            timeline={
              mode === "calendar" ? (
                <TimeGrid
                  dateKey={dateKey}
                  entries={entries.filter((entry) => entry.startsAt)}
                  isToday={isToday}
                  onCreate={onCreate}
                  onDelete={onDelete}
                  onSchedule={onScheduleAtTime}
                  onToggle={onToggle}
                  timeZone={timeZone}
                />
              ) : null
            }
          />
        );
      })}

      <div aria-hidden className="h-px w-full" ref={bottomSentinelRef} />
    </div>
  );
}
