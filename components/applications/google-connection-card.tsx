"use client";

import * as React from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { GoogleConnectionPayload } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function spreadsheetUrl(spreadsheetId: string | null) {
  if (!spreadsheetId) return null;
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

export function GoogleConnectionCard({
  connection,
  cycle,
  importing,
  isLoading,
  onDisconnect,
  onImport,
}: {
  connection: GoogleConnectionPayload | undefined;
  cycle: string;
  importing?: boolean;
  isLoading?: boolean;
  onDisconnect: () => void;
  onImport: () => void;
}) {
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);

  if (isLoading) {
    return (
      <div
        aria-label="Loading spreadsheet connection"
        className="rounded-2xl border border-border/80 px-3.5 py-3"
        role="status"
      >
        <Skeleton className="h-4 w-28 rounded-lg" />
        <Skeleton className="mt-3 h-8 w-full rounded-4xl" />
        <span className="sr-only">Loading spreadsheet connection</span>
      </div>
    );
  }

  if (!connection?.connected) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-3.5 py-4">
        <h3 className="text-sm font-medium tracking-tight">Google Sheets</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Connect your account to mirror every application into the {cycle} tab.
        </p>
        <a
          className={cn(
            buttonVariants({ size: "sm", variant: "default" }),
            "mt-3 w-full",
          )}
          href="/api/google/connect"
        >
          Connect Google Sheets
        </a>
      </div>
    );
  }

  const sheetUrl = spreadsheetUrl(connection.spreadsheetId);

  return (
    <div className="rounded-2xl border border-border/80 bg-card/60 px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium tracking-tight">Google Sheets</h3>
          <p
            className="truncate text-xs text-muted-foreground"
            title={connection.googleEmail ?? undefined}
          >
            {connection.googleEmail ?? "Connected"}
          </p>
        </div>
        {sheetUrl ? (
          <a
            aria-label="Open the spreadsheet"
            className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
            href={sheetUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="size-4" />
          </a>
        ) : null}
      </div>

      <Button
        className="mt-3 w-full"
        disabled={importing}
        onClick={onImport}
        size="sm"
        variant="outline"
      >
        <RefreshCw data-icon="inline-start" />
        {importing ? "Importing..." : `Import ${cycle} rows`}
      </Button>

      {connection.lastImportedAt ? null : (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Import once before logging anything, so numbering continues from the
          sheet.
        </p>
      )}

      <Button
        className="mt-1 w-full text-muted-foreground hover:text-foreground"
        onBlur={() => setConfirmDisconnect(false)}
        onClick={() => {
          if (!confirmDisconnect) {
            setConfirmDisconnect(true);
            return;
          }
          setConfirmDisconnect(false);
          onDisconnect();
        }}
        size="sm"
        variant="ghost"
      >
        {confirmDisconnect ? "Confirm disconnect" : "Disconnect"}
      </Button>
    </div>
  );
}
