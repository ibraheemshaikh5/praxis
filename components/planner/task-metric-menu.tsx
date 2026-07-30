"use client";

import { Crosshair } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useMetrics,
  useMetricsAnchor,
  useSetMetricLink,
} from "@/hooks/use-metrics";
import { cn } from "@/lib/utils";

/**
 * Override-state approach A: fire-and-forget.
 * The planner API does not expose per-task link state yet, so this menu posts
 * the override without trying to show the current included/excluded/clear state.
 */
export function TaskMetricMenu({
  taskId,
  taskTitle,
}: {
  taskId: string;
  taskTitle: string;
}) {
  const anchor = useMetricsAnchor();
  const { data } = useMetrics(anchor ?? "");
  const setLink = useSetMetricLink();
  const metrics = data?.metrics ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Goal overrides for ${taskTitle}`}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-4xl text-muted-foreground",
          "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none",
          "hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          "aria-expanded:opacity-100 data-popup-open:opacity-100",
        )}
      >
        <Crosshair className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {metrics.length === 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Count toward goal</DropdownMenuLabel>
            <DropdownMenuItem disabled>
              No goals yet. Add one in the Goals rail.
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : (
          metrics.map((metric, index) => (
            <DropdownMenuGroup key={metric.id}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel>{metric.name}</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={setLink.isPending}
                onClick={() =>
                  setLink.mutate({
                    taskId,
                    metricId: metric.id,
                    state: "included",
                  })
                }
              >
                Count toward {metric.name}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={setLink.isPending}
                onClick={() =>
                  setLink.mutate({
                    taskId,
                    metricId: metric.id,
                    state: "excluded",
                  })
                }
              >
                Don&apos;t count
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={setLink.isPending}
                onClick={() =>
                  setLink.mutate({
                    taskId,
                    metricId: metric.id,
                    state: "clear",
                  })
                }
              >
                Use automatic match
              </DropdownMenuItem>
            </DropdownMenuGroup>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
