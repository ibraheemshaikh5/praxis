"use client";

import * as React from "react";
import {
  useMutation,
  useQueries,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ApiError,
  createTask,
  deleteTask,
  fetchPlanner,
  reorderPlanner,
  setTaskCompletion,
  updateTask,
} from "@/lib/api/client";
import type { CreateTaskBody, PlannerEntryPayload } from "@/lib/api/types";
import {
  plannerPageIndex,
  plannerPageRange,
  type PlannerDateKey,
} from "@/lib/planner/dates";

export const plannerKeys = {
  all: ["planner"] as const,
  page: (pageIndex: number) => ["planner", "page", pageIndex] as const,
};

export type PlannerDay = {
  dateKey: PlannerDateKey;
  entries: PlannerEntryPayload[];
};

type PageData = { entries: PlannerEntryPayload[] };

function pageQuery(pageIndex: number) {
  return {
    queryKey: plannerKeys.page(pageIndex),
    queryFn: async () => {
      const { from, to } = plannerPageRange(pageIndex);
      return fetchPlanner({ from, to });
    },
  };
}

/**
 * Loads the given planner pages and flattens them into a day-keyed map. Only
 * entries that are still open (not moved or unscheduled) are surfaced.
 */
export function usePlannerPages(pageIndices: number[]) {
  const results = useQueries({
    queries: pageIndices.map(pageQuery),
  });

  const entriesByDay = React.useMemo(() => {
    const map = new Map<PlannerDateKey, PlannerEntryPayload[]>();

    for (const result of results) {
      for (const entry of result.data?.entries ?? []) {
        if (entry.closedAt) continue;
        const bucket = map.get(entry.plannerDate);
        if (bucket) bucket.push(entry);
        else map.set(entry.plannerDate, [entry]);
      }
    }

    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.position - b.position);
    }

    return map;
  }, [results]);

  const loadedPages = React.useMemo(() => {
    const loaded = new Set<number>();
    pageIndices.forEach((pageIndex, index) => {
      if (results[index]?.isSuccess) loaded.add(pageIndex);
    });
    return loaded;
  }, [pageIndices, results]);

  return {
    entriesByDay,
    loadedPages,
    isLoading: results.some((result) => result.isLoading),
    error: results.find((result) => result.error)?.error ?? null,
  };
}

function reportError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    toast.error(
      error.isVersionConflict
        ? "That task changed somewhere else. Reloading the latest version."
        : error.message,
    );
    return;
  }

  toast.error(fallback);
}

function invalidateDay(client: QueryClient, dateKey: PlannerDateKey) {
  return client.invalidateQueries({
    queryKey: plannerKeys.page(plannerPageIndex(dateKey)),
  });
}

export function useCreateTask() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateTaskBody) => createTask(body),
    onError: (error) => reportError(error, "Could not add that task."),
    onSettled: (_data, _error, body) => {
      if (body.plannerDate) return invalidateDay(client, body.plannerDate);
      return client.invalidateQueries({ queryKey: plannerKeys.all });
    },
  });
}

export function useToggleCompletion() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      taskId: string;
      completed: boolean;
      expectedVersion: number;
      dateKey: PlannerDateKey;
    }) =>
      setTaskCompletion(input.taskId, {
        completed: input.completed,
        expectedVersion: input.expectedVersion,
      }),
    async onMutate(input) {
      const queryKey = plannerKeys.page(plannerPageIndex(input.dateKey));
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<PageData>(queryKey);

      client.setQueryData<PageData>(queryKey, (current) =>
        current
          ? {
              ...current,
              entries: current.entries.map((entry) =>
                entry.taskId === input.taskId
                  ? {
                      ...entry,
                      task: {
                        ...entry.task,
                        completedAt: input.completed
                          ? new Date().toISOString()
                          : null,
                        version: entry.task.version + 1,
                      },
                    }
                  : entry,
              ),
            }
          : current,
      );

      return { previous, queryKey };
    },
    onError(error, _input, context) {
      if (context) client.setQueryData(context.queryKey, context.previous);
      reportError(error, "Could not update that task.");
    },
    onSettled: (_data, _error, input) => invalidateDay(client, input.dateKey),
  });
}

export function useUpdateTask() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      taskId: string;
      title?: string;
      notes?: string | null;
      expectedVersion: number;
      dateKey: PlannerDateKey;
    }) =>
      updateTask(input.taskId, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        expectedVersion: input.expectedVersion,
      }),
    async onMutate(input) {
      const queryKey = plannerKeys.page(plannerPageIndex(input.dateKey));
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<PageData>(queryKey);

      client.setQueryData<PageData>(queryKey, (current) =>
        current
          ? {
              ...current,
              entries: current.entries.map((entry) =>
                entry.taskId === input.taskId
                  ? {
                      ...entry,
                      task: {
                        ...entry.task,
                        ...(input.title !== undefined
                          ? { title: input.title }
                          : {}),
                        ...(input.notes !== undefined
                          ? { notes: input.notes }
                          : {}),
                        version: entry.task.version + 1,
                      },
                    }
                  : entry,
              ),
            }
          : current,
      );

      return { previous, queryKey };
    },
    onError(error, _input, context) {
      if (context) client.setQueryData(context.queryKey, context.previous);
      reportError(error, "Could not save that change.");
    },
    onSettled: (_data, _error, input) => invalidateDay(client, input.dateKey),
  });
}

export function useDeleteTask() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      taskId: string;
      expectedVersion: number;
      dateKey: PlannerDateKey;
    }) => deleteTask(input.taskId, input.expectedVersion),
    async onMutate(input) {
      const queryKey = plannerKeys.page(plannerPageIndex(input.dateKey));
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<PageData>(queryKey);

      client.setQueryData<PageData>(queryKey, (current) =>
        current
          ? {
              ...current,
              entries: current.entries.filter(
                (entry) => entry.taskId !== input.taskId,
              ),
            }
          : current,
      );

      return { previous, queryKey };
    },
    onError(error, _input, context) {
      if (context) client.setQueryData(context.queryKey, context.previous);
      reportError(error, "Could not remove that task.");
    },
    onSettled: (_data, _error, input) => invalidateDay(client, input.dateKey),
  });
}

export function useReorderDay() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      plannerDate: PlannerDateKey;
      orderedEntryIds: string[];
    }) => reorderPlanner(input),
    async onMutate(input) {
      const queryKey = plannerKeys.page(plannerPageIndex(input.plannerDate));
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<PageData>(queryKey);

      const rank = new Map(
        input.orderedEntryIds.map((id, index) => [id, (index + 1) * 1024]),
      );

      client.setQueryData<PageData>(queryKey, (current) =>
        current
          ? {
              ...current,
              entries: current.entries.map((entry) =>
                rank.has(entry.id)
                  ? { ...entry, position: rank.get(entry.id)! }
                  : entry,
              ),
            }
          : current,
      );

      return { previous, queryKey };
    },
    onError(error, _input, context) {
      if (context) client.setQueryData(context.queryKey, context.previous);
      reportError(error, "Could not reorder the day.");
    },
    onSettled: (_data, _error, input) =>
      invalidateDay(client, input.plannerDate),
  });
}
