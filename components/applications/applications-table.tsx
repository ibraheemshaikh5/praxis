"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { CompanyLogo } from "@/components/applications/company-logo";
import { StatusBadge } from "@/components/applications/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
} from "@/lib/applications/status";
import type { ApplicationPayload, ApplicationStatus } from "@/lib/api/types";
import { parsePlannerDate } from "@/lib/planner/dates";
import { cn } from "@/lib/utils";

export type RowDraft = {
  company: string;
  title: string;
  status: ApplicationStatus;
  notes: string;
  appliedOn: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatAppliedOn(appliedOn: string) {
  if (!appliedOn) return "";
  return dateFormatter.format(parsePlannerDate(appliedOn));
}

// One source of truth for column widths so the header, saved rows, and the
// entry row line up exactly — the entry row has to read as the next row of the
// table, not as a form sitting underneath it.
const COLUMNS = {
  number: "w-[8%]",
  company: "w-[18%]",
  title: "w-[30%]",
  status: "w-[13%]",
  applied: "w-[12%]",
  notes: "w-[19%]",
} as const;

const CELL = "px-3 py-3 align-middle";
const HEAD = cn(
  CELL,
  "py-2 text-left text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase",
);
const FIELD = cn(
  "w-full min-w-0 rounded-md bg-transparent px-1.5 py-1 -mx-1.5 text-sm outline-none",
  "placeholder:text-muted-foreground/60 focus:bg-muted/60",
);

function StatusCell({
  onChange,
  status,
}: {
  onChange: (status: ApplicationStatus) => void;
  status: ApplicationStatus;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Change status"
        className="rounded-4xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={(event) => event.stopPropagation()}
      >
        <StatusBadge
          className="cursor-pointer transition-opacity hover:opacity-75 motion-reduce:transition-none"
          status={status}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {APPLICATION_STATUSES.map((option) => (
          <DropdownMenuItem
            className={cn(option === status && "font-medium")}
            key={option}
            onClick={() => onChange(option)}
          >
            {APPLICATION_STATUS_LABELS[option]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Renders one row as either text or fields. Both states use the same cells and
 * widths, so entering edit mode moves nothing on screen.
 */
function EditableRow({
  autoFocus,
  draft,
  leading,
  onCancel,
  onCommit,
  onDraftChange,
  submitLabel,
}: {
  autoFocus?: boolean;
  draft: RowDraft;
  leading: React.ReactNode;
  onCancel: () => void;
  onCommit: () => void;
  onDraftChange: (draft: RowDraft) => void;
  submitLabel?: string;
}) {
  const rowRef = React.useRef<HTMLTableRowElement>(null);

  function set<K extends keyof RowDraft>(key: K, value: RowDraft[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  // Commit when focus leaves the row entirely, the way a spreadsheet does.
  function handleBlur(event: React.FocusEvent<HTMLTableRowElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && rowRef.current?.contains(next)) return;
    onCommit();
  }

  return (
    <tr
      className="border-b border-border/60 bg-muted/25"
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      ref={rowRef}
    >
      <td className={CELL}>
        <div className="flex items-center gap-2">
          {leading}
          <CompanyLogo company={draft.company} />
        </div>
      </td>
      <td className={CELL}>
        <input
          aria-label="Company"
          autoFocus={autoFocus}
          className={cn(FIELD, "font-medium")}
          onChange={(event) => set("company", event.target.value)}
          placeholder="Company"
          value={draft.company}
        />
      </td>
      <td className={CELL}>
        <input
          aria-label="Title"
          className={FIELD}
          onChange={(event) => set("title", event.target.value)}
          placeholder="Role title"
          value={draft.title}
        />
      </td>
      <td className={CELL}>
        <StatusCell
          onChange={(status) => set("status", status)}
          status={draft.status}
        />
      </td>
      <td className={CELL}>
        <input
          aria-label="Date applied"
          className={cn(FIELD, "font-mono text-xs tabular-nums")}
          onChange={(event) => set("appliedOn", event.target.value)}
          type="date"
          value={draft.appliedOn}
        />
      </td>
      <td className={CELL}>
        <div className="flex items-center gap-2">
          <input
            aria-label="Notes"
            className={cn(FIELD, "text-xs")}
            onChange={(event) => set("notes", event.target.value)}
            placeholder="Notes"
            value={draft.notes}
          />
          {submitLabel ? (
            <button
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              onClick={onCommit}
              type="button"
            >
              {submitLabel}
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function SavedRow({
  application,
  onEdit,
  onRetrySync,
  onStatusChange,
}: {
  application: ApplicationPayload;
  onEdit: () => void;
  onRetrySync: () => void;
  onStatusChange: (status: ApplicationStatus) => void;
}) {
  const failed = application.sheetSyncStatus === "failed";

  return (
    <tr
      className="group cursor-text border-b border-border/60 transition-colors hover:bg-muted/40 motion-reduce:transition-none"
      onClick={onEdit}
    >
      <td className={CELL}>
        <div className="flex items-center gap-2">
          {failed ? (
            <button
              aria-label="Not in the spreadsheet — retry"
              className="shrink-0"
              onClick={(event) => {
                event.stopPropagation();
                onRetrySync();
              }}
              type="button"
            >
              <AlertTriangle className="size-3.5 text-destructive" />
            </button>
          ) : null}
          <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {application.applicationNumber}
          </span>
          <CompanyLogo company={application.company} />
        </div>
      </td>
      <td className={cn(CELL, "truncate font-medium")}>
        {application.company}
      </td>
      <td className={cn(CELL, "truncate text-muted-foreground")}>
        {application.title}
      </td>
      <td className={CELL}>
        <StatusCell onChange={onStatusChange} status={application.status} />
      </td>
      <td
        className={cn(
          CELL,
          "font-mono text-xs tabular-nums text-muted-foreground",
        )}
      >
        {formatAppliedOn(application.appliedOn)}
      </td>
      <td
        className={cn(CELL, "truncate text-xs text-muted-foreground")}
        title={application.notes ?? undefined}
      >
        {application.notes ?? ""}
      </td>
    </tr>
  );
}

export function ApplicationsTable({
  applications,
  creating,
  draft,
  editingId,
  nextNumber,
  onCancelEdit,
  onCommitEdit,
  onCommitNew,
  onDraftChange,
  onNewDraftChange,
  onRetrySync,
  onStartEdit,
  onStatusChange,
  newDraft,
}: {
  applications: ApplicationPayload[];
  creating: boolean;
  draft: RowDraft | null;
  editingId: string | null;
  nextNumber: number;
  onCancelEdit: () => void;
  onCommitEdit: () => void;
  onCommitNew: () => void;
  onDraftChange: (draft: RowDraft) => void;
  onNewDraftChange: (draft: RowDraft) => void;
  onRetrySync: (applicationId: string) => void;
  onStartEdit: (application: ApplicationPayload) => void;
  onStatusChange: (
    application: ApplicationPayload,
    status: ApplicationStatus,
  ) => void;
  newDraft: RowDraft;
}) {
  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className={cn(HEAD, COLUMNS.number)}>#</th>
          <th className={cn(HEAD, COLUMNS.company)}>Company</th>
          <th className={cn(HEAD, COLUMNS.title)}>Title</th>
          <th className={cn(HEAD, COLUMNS.status)}>Status</th>
          <th className={cn(HEAD, COLUMNS.applied)}>Applied</th>
          <th className={cn(HEAD, COLUMNS.notes)}>Notes</th>
        </tr>
      </thead>

      <tbody>
        {applications.map((application) =>
          editingId === application.id && draft ? (
            <EditableRow
              autoFocus
              draft={draft}
              key={application.id}
              leading={
                <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {application.applicationNumber}
                </span>
              }
              onCancel={onCancelEdit}
              onCommit={onCommitEdit}
              onDraftChange={onDraftChange}
            />
          ) : (
            <SavedRow
              application={application}
              key={application.id}
              onEdit={() => onStartEdit(application)}
              onRetrySync={() => onRetrySync(application.id)}
              onStatusChange={(status) => onStatusChange(application, status)}
            />
          ),
        )}

        <EditableRow
          draft={newDraft}
          leading={
            <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground/50">
              {nextNumber}
            </span>
          }
          onCancel={() =>
            onNewDraftChange({ ...newDraft, company: "", title: "", notes: "" })
          }
          onCommit={onCommitNew}
          onDraftChange={onNewDraftChange}
          submitLabel={
            creating
              ? "Saving"
              : newDraft.company.trim() && newDraft.title.trim()
                ? "Add"
                : undefined
          }
        />
      </tbody>
    </table>
  );
}
