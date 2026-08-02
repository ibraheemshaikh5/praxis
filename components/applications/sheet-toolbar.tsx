"use client";

import * as React from "react";
import { Check, ChevronDown, ExternalLink, RefreshCw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { GoogleConnectionPayload } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * The spreadsheet link is plumbing, not content: before connecting it is a
 * single button, and after connecting it collapses to the tab it writes to plus
 * a way to pull that tab in.
 */
export function SheetToolbar({
  connection,
  cycle,
  importing,
  isLoading,
  onCycleChange,
  onDisconnect,
  onImport,
  tabs,
}: {
  connection: GoogleConnectionPayload | undefined;
  cycle: string;
  importing?: boolean;
  isLoading?: boolean;
  onCycleChange: (cycle: string) => void;
  onDisconnect: () => void;
  onImport: () => void;
  tabs: string[];
}) {
  if (isLoading) {
    return <Skeleton className="h-8 w-44 rounded-4xl" />;
  }

  if (!connection?.connected) {
    return (
      <a
        className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        href="/api/google/connect"
      >
        Connect Sheets
      </a>
    );
  }

  const sheetUrl = connection.spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${connection.spreadsheetId}/edit`
    : null;

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-4xl px-2.5 text-sm text-muted-foreground",
            "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          )}
          title={connection.googleEmail ?? "Connected"}
        >
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-primary"
          />
          <span className="max-w-40 truncate font-medium text-foreground">
            {cycle}
          </span>
          <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="min-w-56">
          {tabs.length === 0 ? (
            <DropdownMenuItem disabled>Loading tabs...</DropdownMenuItem>
          ) : (
            tabs.map((tab) => (
              <DropdownMenuItem key={tab} onClick={() => onCycleChange(tab)}>
                <Check
                  className={cn(
                    "size-3.5",
                    tab === cycle ? "opacity-100" : "opacity-0",
                  )}
                  data-icon="inline-start"
                />
                {tab}
              </DropdownMenuItem>
            ))
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            {connection.googleEmail ?? "Connected"}
          </DropdownMenuItem>
          {sheetUrl ? (
            <DropdownMenuItem
              onClick={() => window.open(sheetUrl, "_blank", "noreferrer")}
            >
              <ExternalLink data-icon="inline-start" />
              Open spreadsheet
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={onDisconnect} variant="destructive">
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        disabled={importing}
        onClick={onImport}
        size="sm"
        variant="ghost"
      >
        <RefreshCw
          className={cn(importing && "animate-spin motion-reduce:animate-none")}
          data-icon="inline-start"
        />
        Import
      </Button>
    </div>
  );
}
