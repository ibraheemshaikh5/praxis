"use client";

import * as React from "react";
import { NotebookPen } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { usePageNote, useSavePageNote } from "@/hooks/use-page-note";
import { cn } from "@/lib/utils";

const SAVE_DELAY_MS = 700;

export function PageBuildNotes() {
  const pageKey = usePathname();
  return <PageBuildNotesForPage key={pageKey} pageKey={pageKey} />;
}

function PageBuildNotesForPage({ pageKey }: { pageKey: string }) {
  const { data, isError, isLoading } = usePageNote(pageKey);
  const [open, setOpen] = React.useState(false);
  const savedContent = data?.note?.content ?? "";
  const hasContent = savedContent.trim().length > 0;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label="Open build notes"
            className={cn(hasContent && "text-primary")}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <NotebookPen />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] gap-3 rounded-2xl p-3.5"
        sideOffset={8}
      >
        <PopoverHeader className="gap-0.5 px-0.5">
          <PopoverTitle className="text-sm font-semibold">
            Build notes
          </PopoverTitle>
          <PopoverDescription className="truncate text-xs">
            For this page
          </PopoverDescription>
        </PopoverHeader>

        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : isError ? (
          <div className="grid h-64 place-items-center rounded-2xl border border-dashed px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Could not load these notes. Close the panel and try again.
            </p>
          </div>
        ) : (
          <PageBuildNotesEditor
            initialContent={savedContent}
            pageKey={pageKey}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function PageBuildNotesEditor({
  initialContent,
  pageKey,
}: {
  initialContent: string;
  pageKey: string;
}) {
  const [draft, setDraft] = React.useState(initialContent);
  const { isError, isPending, mutate } = useSavePageNote(pageKey);

  React.useEffect(() => {
    if (isPending || draft === initialContent) return;

    const timer = window.setTimeout(() => mutate(draft), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, initialContent, isPending, mutate]);

  const saveLabel = isPending
    ? "Saving"
    : isError
      ? "Could not save"
      : draft !== initialContent
        ? "Unsaved"
        : "Saved";

  return (
    <div className="space-y-2">
      <Textarea
        aria-label="Build notes for this page"
        autoFocus
        className="min-h-64 resize-y bg-muted/55 leading-6"
        maxLength={50_000}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={
          "- Add a new view\n- Refine the empty state\n- Check mobile layout"
        }
        value={draft}
      />
      <p
        aria-live="polite"
        className={cn(
          "px-0.5 text-right text-xs text-muted-foreground",
          isError && "text-destructive",
        )}
      >
        {saveLabel}
      </p>
    </div>
  );
}
