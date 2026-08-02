"use client";

import * as React from "react";
import { AlertTriangle, MoreHorizontal, RefreshCw } from "lucide-react";

import { StatusBadge } from "@/components/applications/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
} from "@/lib/applications/status";
import type { ApplicationPayload, ApplicationStatus } from "@/lib/api/types";
import { parsePlannerDate } from "@/lib/planner/dates";
import { cn } from "@/lib/utils";

const HEAD_CLASS =
  "h-9 px-3 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase";

// Shorter than the planner's formatMonthDay so the date column stays narrow.
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatAppliedOn(appliedOn: string) {
  return dateFormatter.format(parsePlannerDate(appliedOn));
}

type RowActions = {
  onEdit: (application: ApplicationPayload) => void;
  onRetrySync: (applicationId: string) => void;
  onStatusChange: (
    application: ApplicationPayload,
    status: ApplicationStatus,
  ) => void;
};

function SyncWarning({ application }: { application: ApplicationPayload }) {
  if (application.sheetSyncStatus !== "failed") return null;

  return (
    <AlertTriangle
      aria-label="Not in the spreadsheet yet"
      className="size-3.5 shrink-0 text-destructive"
    />
  );
}

function StatusMenu({
  application,
  onStatusChange,
}: {
  application: ApplicationPayload;
  onStatusChange: RowActions["onStatusChange"];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Change status for ${application.company}`}
        className="rounded-4xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <StatusBadge
          className="cursor-pointer transition-opacity hover:opacity-80 motion-reduce:transition-none"
          status={application.status}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {APPLICATION_STATUSES.map((status) => (
          <DropdownMenuItem
            className={cn(status === application.status && "font-medium")}
            key={status}
            onClick={() => onStatusChange(application, status)}
          >
            {APPLICATION_STATUS_LABELS[status]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowMenu({
  application,
  onEdit,
  onRetrySync,
}: {
  application: ApplicationPayload;
  onEdit: RowActions["onEdit"];
  onRetrySync: RowActions["onRetrySync"];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${application.company}`}
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-xl text-muted-foreground",
          "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onClick={() => onEdit(application)}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onRetrySync(application.id)}>
          <RefreshCw data-icon="inline-start" />
          Sync to sheet
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ApplicationCard({
  application,
  onEdit,
  onRetrySync,
  onStatusChange,
}: { application: ApplicationPayload } & RowActions) {
  return (
    <article className="rounded-2xl border border-border/80 bg-card/60 px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {application.applicationNumber}
            </span>
            <SyncWarning application={application} />
          </div>
          <h3 className="mt-0.5 truncate text-sm font-medium tracking-tight">
            {application.company}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {application.title}
          </p>
        </div>

        <RowMenu
          application={application}
          onEdit={onEdit}
          onRetrySync={onRetrySync}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <StatusMenu application={application} onStatusChange={onStatusChange} />
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatAppliedOn(application.appliedOn)}
        </span>
      </div>

      {application.notes ? (
        <p className="mt-2.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {application.notes}
        </p>
      ) : null}
    </article>
  );
}

export function ApplicationsTable({
  applications,
  onEdit,
  onRetrySync,
  onStatusChange,
}: { applications: ApplicationPayload[] } & RowActions) {
  return (
    <>
      <div className="space-y-2.5 md:hidden">
        {applications.map((application) => (
          <ApplicationCard
            application={application}
            key={application.id}
            onEdit={onEdit}
            onRetrySync={onRetrySync}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-border/80 bg-card/40 md:block">
        {/* Fixed layout so Notes absorbs the slack instead of overflowing. */}
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(HEAD_CLASS, "w-[6%] pl-4 text-right")}>
                #
              </TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[19%]")}>
                Company
              </TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[21%]")}>Title</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[20%]")}>
                Status
              </TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[12%]")}>
                Applied
              </TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[16%]")}>Notes</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[6%] pr-4")}>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {applications.map((application) => (
              <TableRow className="border-border/60" key={application.id}>
                <TableCell className="py-2.5 pl-4 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <SyncWarning application={application} />
                    {application.applicationNumber}
                  </span>
                </TableCell>
                <TableCell
                  className="truncate py-2.5 font-medium"
                  title={application.company}
                >
                  {application.company}
                </TableCell>
                <TableCell
                  className="truncate py-2.5 text-muted-foreground"
                  title={application.title}
                >
                  {application.title}
                </TableCell>
                <TableCell className="py-2.5">
                  <StatusMenu
                    application={application}
                    onStatusChange={onStatusChange}
                  />
                </TableCell>
                <TableCell className="py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {formatAppliedOn(application.appliedOn)}
                </TableCell>
                <TableCell
                  className="truncate py-2.5 text-xs text-muted-foreground"
                  title={application.notes ?? undefined}
                >
                  {application.notes ?? "—"}
                </TableCell>
                <TableCell className="py-2.5 pr-4">
                  <RowMenu
                    application={application}
                    onEdit={onEdit}
                    onRetrySync={onRetrySync}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
