"use client";

import * as React from "react";
import { MoreHorizontal, Plus } from "lucide-react";

import {
  MetricFormDialog,
  type MetricFormValues,
} from "@/components/planner/metric-form-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useArchiveMetric,
  useCreateMetric,
  useMetrics,
  useUpdateMetric,
} from "@/hooks/use-metrics";
import type { MetricPayload, MetricPeriod } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const PERIOD_COPY: Record<MetricPeriod, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
};

function DayStrip({ days }: { days: MetricPayload["days"] }) {
  return (
    <div
      aria-hidden
      className="flex h-1.5 gap-0.5"
      title={`${days.filter((day) => day.hit).length} of ${days.length} days hit`}
    >
      {days.map((day) => (
        <span
          className={cn(
            "min-w-0 flex-1 rounded-sm transition-colors motion-reduce:transition-none",
            day.hit ? "bg-primary" : "bg-muted",
          )}
          key={day.date}
        />
      ))}
    </div>
  );
}

function HistorySpark({ history }: { history: MetricPayload["history"] }) {
  const max = Math.max(1, ...history.map((bucket) => bucket.count));

  return (
    <div
      aria-hidden
      className="flex h-3 items-end gap-px"
      title="Recent periods"
    >
      {history.map((bucket, index) => {
        const ratio = bucket.count / max;
        return (
          <span
            className={cn(
              "w-1 rounded-[1px] transition-opacity motion-reduce:transition-none",
              index === history.length - 1
                ? "bg-primary/70"
                : "bg-muted-foreground/25",
            )}
            key={bucket.periodStart}
            style={{
              height: `${Math.max(18, Math.round(ratio * 100))}%`,
            }}
          />
        );
      })}
    </div>
  );
}

function MetricCard({
  metric,
  onEdit,
  onArchive,
  archiving,
}: {
  metric: MetricPayload;
  onEdit: (metric: MetricPayload) => void;
  onArchive: (metricId: string) => void;
  archiving?: boolean;
}) {
  const [confirmArchive, setConfirmArchive] = React.useState(false);

  return (
    <article className="rounded-2xl border border-border/80 bg-card/60 px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium tracking-tight">
            {metric.name}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {PERIOD_COPY[metric.period]}
          </p>
        </div>

        <DropdownMenu
          onOpenChange={(open) => {
            if (!open) setConfirmArchive(false);
          }}
        >
          <DropdownMenuTrigger
            aria-label={`Actions for ${metric.name}`}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-xl text-muted-foreground",
              "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            <DropdownMenuItem onClick={() => onEdit(metric)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              closeOnClick={confirmArchive}
              disabled={archiving}
              onClick={() => {
                if (!confirmArchive) {
                  setConfirmArchive(true);
                  return;
                }
                onArchive(metric.id);
              }}
              variant="destructive"
            >
              {confirmArchive ? "Confirm archive" : "Archive"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="mt-3 font-mono text-2xl font-medium tabular-nums tracking-tight">
        {metric.currentCount}
        <span className="text-muted-foreground">/{metric.targetCount}</span>
      </p>

      <div className="mt-3">
        <DayStrip days={metric.days} />
      </div>

      {metric.history.length > 0 ? (
        <div className="mt-3">
          <HistorySpark history={metric.history} />
        </div>
      ) : null}
    </article>
  );
}

function RailSkeleton() {
  return (
    <div aria-label="Loading goals" className="space-y-3" role="status">
      {[0, 1].map((index) => (
        <div
          className="rounded-2xl border border-border/80 px-3.5 py-3"
          key={index}
        >
          <Skeleton className="h-4 w-24 rounded-lg" />
          <Skeleton className="mt-3 h-7 w-16 rounded-lg" />
          <Skeleton className="mt-3 h-1.5 w-full rounded-sm" />
          <Skeleton className="mt-3 h-3 w-20 rounded-sm" />
        </div>
      ))}
      <span className="sr-only">Loading goals</span>
    </div>
  );
}

export function MetricsRail({ todayKey }: { todayKey: string }) {
  const { data, isLoading, isError } = useMetrics(todayKey);
  const createMetric = useCreateMetric();
  const updateMetric = useUpdateMetric();
  const archiveMetric = useArchiveMetric();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MetricPayload | null>(null);

  const metrics = data?.metrics ?? [];

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(metric: MetricPayload) {
    setEditing(metric);
    setDialogOpen(true);
  }

  async function handleSubmit(values: MetricFormValues) {
    if (editing) {
      await updateMetric.mutateAsync({
        metricId: editing.id,
        body: values,
      });
    } else {
      await createMetric.mutateAsync(values);
    }
    setDialogOpen(false);
    setEditing(null);
  }

  const formPending = createMetric.isPending || updateMetric.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Goals</h2>
        <Button
          aria-label="Add goal"
          onClick={openCreate}
          size="icon-xs"
          variant="ghost"
        >
          <Plus />
        </Button>
      </div>

      {isLoading ? <RailSkeleton /> : null}

      {!isLoading && isError ? (
        <p className="text-sm text-muted-foreground">
          Could not load goals. Try again shortly.
        </p>
      ) : null}

      {!isLoading && !isError && metrics.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-3.5 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            No goals yet. Add one to track completions.
          </p>
          <Button className="mt-3" onClick={openCreate} size="sm">
            Add metric
          </Button>
        </div>
      ) : null}

      {!isLoading && metrics.length > 0 ? (
        <div className="space-y-3">
          {metrics.map((metric) => (
            <MetricCard
              archiving={
                archiveMetric.isPending &&
                archiveMetric.variables === metric.id
              }
              key={metric.id}
              metric={metric}
              onArchive={(metricId) => archiveMetric.mutate(metricId)}
              onEdit={openEdit}
            />
          ))}
        </div>
      ) : null}

      <MetricFormDialog
        metric={editing}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        onSubmit={handleSubmit}
        open={dialogOpen}
        pending={formPending}
      />
    </div>
  );
}
