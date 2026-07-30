"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DayTimeline } from "@/components/planner/day-timeline";
import { MetricsRail } from "@/components/planner/metrics-rail";
import { PlannerShell } from "@/components/planner/planner-shell";
import {
  useCreateTask,
  useDeleteTask,
  useReorderDay,
  useToggleCompletion,
} from "@/hooks/use-planner";
import { MetricsAnchorProvider, metricsKeys } from "@/hooks/use-metrics";
import { signOut } from "@/lib/auth/actions";
import type { PlannerEntryPayload } from "@/lib/api/types";
import {
  getPlannerTodayKey,
  type PlannerDateKey,
} from "@/lib/planner/dates";

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
  const toggleCompletion = useToggleCompletion();
  const deleteTask = useDeleteTask();
  const reorderDay = useReorderDay();

  const invalidateMetrics = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: metricsKeys.all });
  }, [queryClient]);

  const handleCreate = React.useCallback(
    async (input: {
      dateKey: PlannerDateKey;
      title: string;
      notes: string | null;
    }) => {
      await createTask.mutateAsync({
        title: input.title,
        notes: input.notes,
        plannerDate: input.dateKey,
      });
      invalidateMetrics();
    },
    [createTask, invalidateMetrics],
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
    (input: {
      plannerDate: PlannerDateKey;
      orderedEntryIds: string[];
    }) => {
      reorderDay.mutate(input);
    },
    [reorderDay],
  );

  return (
    <MetricsAnchorProvider anchor={todayKey}>
      <PlannerShell
        onSignOut={() => void signOut()}
        rail={<MetricsRail todayKey={todayKey} />}
        userEmail={userEmail}
      >
        <DayTimeline
          onCreate={handleCreate}
          onDelete={handleDelete}
          onReorder={handleReorder}
          onToggle={handleToggle}
          pendingCreate={createTask.isPending}
          todayKey={todayKey}
        />
      </PlannerShell>
    </MetricsAnchorProvider>
  );
}
