"use client";

import Link from "next/link";

import { CompanyLogo } from "@/components/applications/company-logo";
import { Portrait } from "@/components/rolodex/portrait";
import type { ConnectionSummaryPayload } from "@/lib/api/types";
import { metLabel } from "@/lib/rolodex/dates";

export function ConnectionCard({
  connection,
  today,
}: {
  connection: ConnectionSummaryPayload;
  today: string | null;
}) {
  const subtitle = connection.headline ?? connection.role;

  return (
    <article className="group">
      <Link
        className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
        href={`/rolodex/${connection.id}`}
      >
        <div className="flex items-center gap-3">
          <div className="size-11 shrink-0 overflow-hidden rounded-full bg-muted text-sm ring-1 ring-foreground/10">
            <Portrait avatarUrl={connection.avatarUrl} name={connection.name} />
          </div>
          <div className="min-w-0">
            <p className="line-clamp-1 text-sm font-medium">
              {connection.name}
            </p>
            {subtitle ? (
              <p className="line-clamp-1 text-xs text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        {connection.company ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CompanyLogo company={connection.company} />
            <span className="line-clamp-1">{connection.company}</span>
          </p>
        ) : null}

        <p className="mt-auto flex items-baseline justify-between gap-2 pt-1 text-xs">
          <span className="text-muted-foreground">
            {connection.lastMetOn
              ? metLabel(connection.lastMetOn, today)
              : "No meetings"}
          </span>
          {connection.meetingCount > 0 ? (
            <span className="text-muted-foreground tabular-nums">
              {connection.meetingCount}
            </span>
          ) : null}
        </p>
      </Link>
    </article>
  );
}
