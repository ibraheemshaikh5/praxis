"use client";

import { StatusBadge } from "@/components/applications/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { APPLICATION_STATUSES } from "@/lib/applications/status";
import type { ApplicationPayload, ApplicationStatus } from "@/lib/api/types";

export function CycleSummary({
  applications,
  cycle,
  isLoading,
}: {
  applications: ApplicationPayload[];
  cycle: string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div
        aria-label="Loading cycle summary"
        className="rounded-2xl border border-border/80 px-3.5 py-3"
        role="status"
      >
        <Skeleton className="h-4 w-20 rounded-lg" />
        <Skeleton className="mt-3 h-8 w-14 rounded-lg" />
        <Skeleton className="mt-3 h-4 w-full rounded-lg" />
        <span className="sr-only">Loading cycle summary</span>
      </div>
    );
  }

  const counts = new Map<ApplicationStatus, number>();
  for (const application of applications) {
    counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
  }

  const present = APPLICATION_STATUSES.filter((status) => counts.has(status));

  return (
    <div className="rounded-2xl border border-border/80 bg-card/60 px-3.5 py-3">
      <h3 className="text-sm font-medium tracking-tight">{cycle}</h3>
      <p className="mt-2 font-mono text-2xl font-medium tabular-nums tracking-tight">
        {applications.length}
        <span className="ml-1.5 font-sans text-xs font-normal text-muted-foreground">
          {applications.length === 1 ? "application" : "applications"}
        </span>
      </p>

      {present.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {present.map((status) => (
            <li
              className="flex items-center justify-between gap-2"
              key={status}
            >
              <StatusBadge status={status} />
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {counts.get(status)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
