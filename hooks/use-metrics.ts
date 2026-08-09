"use client";

import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ApiError,
  archiveMetric,
  createMetric,
  fetchMetrics,
  setMetricLink,
  updateMetric,
} from "@/lib/api/client";
import type {
  CreateMetricBody,
  MetricLinkState,
  SetMetricLinkBody,
  UpdateMetricBody,
} from "@/lib/api/types";

export const metricsKeys = {
  all: ["metrics"] as const,
  list: (anchor: string) => ["metrics", "list", anchor] as const,
};

const MetricsAnchorContext = React.createContext<string | null>(null);

/** Lets TaskRow reach the planner today key without threading through DayTimeline. */
export function MetricsAnchorProvider({
  anchor,
  children,
}: {
  anchor: string;
  children: React.ReactNode;
}) {
  return React.createElement(
    MetricsAnchorContext.Provider,
    { value: anchor },
    children,
  );
}

export function useMetricsAnchor() {
  return React.useContext(MetricsAnchorContext);
}

function reportError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    toast.error(error.message);
    return;
  }

  toast.error(fallback);
}

function invalidateMetrics(client: QueryClient) {
  return client.invalidateQueries({ queryKey: metricsKeys.all });
}

export function useMetrics(anchor: string) {
  return useQuery({
    queryKey: metricsKeys.list(anchor),
    queryFn: () => fetchMetrics(anchor),
    staleTime: 15_000,
    enabled: Boolean(anchor),
    // Picks up changes made from another tab or device while this one sits open.
    refetchInterval: 60_000,
  });
}

export function useCreateMetric() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateMetricBody) => createMetric(body),
    onError: (error) => reportError(error, "Could not create that goal."),
    onSettled: () => invalidateMetrics(client),
  });
}

export function useUpdateMetric() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { metricId: string; body: UpdateMetricBody }) =>
      updateMetric(input.metricId, input.body),
    onError: (error) => reportError(error, "Could not update that goal."),
    onSettled: () => invalidateMetrics(client),
  });
}

export function useArchiveMetric() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (metricId: string) => archiveMetric(metricId),
    onError: (error) => reportError(error, "Could not archive that goal."),
    onSettled: () => invalidateMetrics(client),
  });
}

export function useSetMetricLink() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      taskId: string;
      metricId: string;
      state: MetricLinkState | "clear";
    }) => {
      const body: SetMetricLinkBody = {
        metricId: input.metricId,
        state: input.state,
      };
      return setMetricLink(input.taskId, body);
    },
    onError: (error) =>
      reportError(error, "Could not update that goal override."),
    onSettled: () => invalidateMetrics(client),
  });
}
