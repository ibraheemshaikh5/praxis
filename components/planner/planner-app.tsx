"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DayTimeline } from "@/components/planner/day-timeline";
import { TodayButton } from "@/components/planner/jump-to-today";
import { MetricsRail } from "@/components/planner/metrics-rail";
import { PlannerShell } from "@/components/planner/planner-shell";
import { TimelineNavProvider } from "@/components/planner/timeline-nav";
import {
  useCreateTask,
  useDeleteTask,
  useReorderDay,
  useScheduleTask,
  useToggleCompletion,
  useUpdateTask,
} from "@/hooks/use-planner";
import { MetricsAnchorProvider, metricsKeys } from "@/hooks/use-metrics";
import { signOut } from "@/lib/auth/actions";
import type { PlannerEntryPayload } from "@/lib/api/types";
import type { TaskColorKey, TaskIconKey } from "@/lib/daily-planner/appearance";
import { getPlannerTodayKey, type PlannerDateKey } from "@/lib/planner/dates";

export function PlannerApp({
  timeZone,
  userEmail,
}: {
  timeZone: string;
  userEmail: string | null;
}) {
  const todayKey = React.useMemo(
    () => getPlannerTodayKey(timeZone),
    [timeZone],
  );

  const queryClient = useQueryClient();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const toggleCompletion = useToggleCompletion();
  const deleteTask = useDeleteTask();
  const reorderDay = useReorderDay();
  const scheduleTask = useScheduleTask();

  const invalidateMetrics = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: metricsKeys.all });
  }, [queryClient]);

  const handleCreate = React.useCallback(
    async (input: {
      dateKey: PlannerDateKey;
      title: string;
      notes: string | null;
      iconKey: TaskIconKey;
      colorKey: TaskColorKey;
    }) => {
      await createTask.mutateAsync({
        title: input.title,
        notes: input.notes,
        iconKey: input.iconKey,
        colorKey: input.colorKey,
        plannerDate: input.dateKey,
      });
      invalidateMetrics();
    },
    [createTask, invalidateMetrics],
  );

  const handleUpdate = React.useCallback(
    (input: {
      entry: PlannerEntryPayload;
      title?: string;
      notes?: string | null;
    }) => {
      updateTask.mutate(
        {
          taskId: input.entry.taskId,
          title: input.title,
          notes: input.notes,
          expectedVersion: input.entry.task.version,
          dateKey: input.entry.plannerDate,
        },
        { onSettled: invalidateMetrics },
      );
    },
    [invalidateMetrics, updateTask],
  );

  const handleToggle = React.useCallback(
    (entry: PlannerEntryPayload) => {
      toggleCompletion.mutate(
        {
          taskId: entry.taskId,
          completed: !entry.task.completedAt,
          expectedVersion: entry.task.version,
          dateKey: entry.plannerDate,
        },
        { onSettled: invalidateMetrics },
      );
    },
    [invalidateMetrics, toggleCompletion],
  );

  const handleDelete = React.useCallback(
    (entry: PlannerEntryPayload) => {
      deleteTask.mutate(
        {
          taskId: entry.taskId,
          expectedVersion: entry.task.version,
          dateKey: entry.plannerDate,
        },
        { onSettled: invalidateMetrics },
      );
    },
    [deleteTask, invalidateMetrics],
  );

  const handleReorder = React.useCallback(
    (input: { plannerDate: PlannerDateKey; orderedEntryIds: string[] }) => {
      reorderDay.mutate(input);
    },
    [reorderDay],
  );

  const handleSchedule = React.useCallback(
    (input: {
      entry: PlannerEntryPayload;
      plannerDate: PlannerDateKey;
      startsAt?: string | null;
      endsAt?: string | null;
    }) => {
      scheduleTask.mutate(
        {
          taskId: input.entry.taskId,
          plannerDate: input.plannerDate,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          expectedVersion: input.entry.task.version,
          fromDateKey: input.entry.plannerDate,
        },
        { onSettled: invalidateMetrics },
      );
    },
    [invalidateMetrics, scheduleTask],
  );

  return (
    <MetricsAnchorProvider anchor={todayKey}>
      <TimelineNavProvider>
        <PlannerShell
          headerAction={<TodayButton />}
          onSignOut={() => void signOut()}
          rail={<MetricsRail todayKey={todayKey} />}
          userEmail={userEmail}
        >
          <DayTimeline
            onCreate={handleCreate}
            onDelete={handleDelete}
            onReorder={handleReorder}
            onSchedule={handleSchedule}
            onToggle={handleToggle}
            onUpdate={handleUpdate}
            schedulePendingTaskId={
              scheduleTask.isPending ? scheduleTask.variables?.taskId : null
            }
            todayKey={todayKey}
            timeZone={timeZone}
          />
        </PlannerShell>
      </TimelineNavProvider>
    </MetricsAnchorProvider>
  );
}
