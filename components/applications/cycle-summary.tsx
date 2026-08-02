"use client";

import { StatusBadge } from "@/components/applications/status-badge";
import { APPLICATION_STATUSES } from "@/lib/applications/status";
import type { ApplicationPayload, ApplicationStatus } from "@/lib/api/types";

/**
 * Sits under the table rather than beside it: the counts are a footnote to the
 * list, not a dashboard competing with it.
 */
export function CycleSummary({
  applications,
}: {
  applications: ApplicationPayload[];
}) {
  if (applications.length === 0) return null;

  const counts = new Map<ApplicationStatus, number>();
  for (const application of applications) {
    counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
      <span className="font-mono text-sm tabular-nums">
        {applications.length}
        <span className="ml-1.5 font-sans text-xs text-muted-foreground">
          total
        </span>
      </span>

      {APPLICATION_STATUSES.filter((status) => counts.has(status)).map(
        (status) => (
          <span className="flex items-center gap-1.5" key={status}>
            <StatusBadge status={status} />
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {counts.get(status)}
            </span>
          </span>
        ),
      )}
    </div>
  );
}
