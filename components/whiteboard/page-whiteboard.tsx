"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { PenTool, Plus, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateWhiteboard,
  useDeleteWhiteboard,
  useUpdateWhiteboard,
  useWhiteboard,
  useWhiteboards,
} from "@/hooks/use-whiteboards";
import type { WhiteboardDocument } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const DEFAULT_TITLE = "Untitled";

// tldraw measures the DOM as it boots, so it never renders on the server.
const WhiteboardCanvas = dynamic(
  () =>
    import("@/components/whiteboard/whiteboard-canvas").then(
      (module) => module.WhiteboardCanvas,
    ),
  { ssr: false, loading: () => <CanvasFallback /> },
);

export function PageWhiteboard() {
  const pageKey = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button aria-label="Open whiteboard" size="icon-sm" variant="ghost" />
        }
      >
        <PenTool />
      </DialogTrigger>
      <DialogContent className="h-[min(48rem,calc(100dvh-3rem))] w-[min(76rem,calc(100vw-2rem))] max-w-none grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="sr-only">
          <DialogTitle>Whiteboard</DialogTitle>
          <DialogDescription>Drawings for this page</DialogDescription>
        </DialogHeader>
        {open ? <WhiteboardWorkspace pageKey={pageKey} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function WhiteboardWorkspace({ pageKey }: { pageKey: string }) {
  const { data, isError, isLoading } = useWhiteboards(pageKey);
  const createWhiteboard = useCreateWhiteboard(pageKey);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const boards = React.useMemo(() => data?.whiteboards ?? [], [data]);
  const selected =
    boards.find((board) => board.id === selectedId) ?? boards[0] ?? null;

  function addWhiteboard() {
    createWhiteboard.mutate(DEFAULT_TITLE, {
      onSuccess: (response) => setSelectedId(response.whiteboard.id),
    });
  }

  return (
    <div className="grid h-full grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r border-border bg-muted/30">
        <div className="flex h-14 items-center justify-between gap-2 border-b border-border pr-2 pl-4">
          <p className="text-sm font-medium">Whiteboards</p>
          <Button
            aria-label="New whiteboard"
            disabled={createWhiteboard.isPending}
            onClick={addWhiteboard}
            size="icon-sm"
            variant="ghost"
          >
            <Plus />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <ul className="space-y-0.5 p-2">
            {isLoading
              ? [0, 1, 2].map((index) => (
                  <li key={index}>
                    <Skeleton className="h-8 w-full rounded-2xl" />
                  </li>
                ))
              : boards.map((board) => (
                  <li key={board.id}>
                    <button
                      aria-current={
                        board.id === selected?.id ? "true" : undefined
                      }
                      className={cn(
                        "w-full truncate rounded-2xl px-3 py-1.5 text-left text-sm transition-colors motion-reduce:transition-none",
                        board.id === selected?.id
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                      )}
                      onClick={() => setSelectedId(board.id)}
                      type="button"
                    >
                      {board.title}
                    </button>
                  </li>
                ))}
          </ul>
        </ScrollArea>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* A failed background refresh must not tear down a working canvas;
            the error panel is only for having nothing to show at all. */}
        {isError && !data ? (
          <PanelMessage>
            Could not load whiteboards. Close the panel and try again.
          </PanelMessage>
        ) : !isLoading && !selected ? (
          <PanelMessage>No whiteboards.</PanelMessage>
        ) : selected ? (
          <WhiteboardPanel
            key={selected.id}
            onDeleted={() => setSelectedId(null)}
            pageKey={pageKey}
            title={selected.title}
            whiteboardId={selected.id}
          />
        ) : (
          <CanvasFallback />
        )}
      </div>
    </div>
  );
}

function WhiteboardPanel({
  onDeleted,
  pageKey,
  title,
  whiteboardId,
}: {
  onDeleted: () => void;
  pageKey: string;
  title: string;
  whiteboardId: string;
}) {
  const { data, isLoading } = useWhiteboard(whiteboardId);
  const updateWhiteboard = useUpdateWhiteboard(pageKey);
  const deleteWhiteboard = useDeleteWhiteboard(pageKey);
  const [draftTitle, setDraftTitle] = React.useState(title);

  const saveDocument = React.useCallback(
    (document: WhiteboardDocument) =>
      updateWhiteboard.mutate({ whiteboardId, body: { document } }),
    [updateWhiteboard, whiteboardId],
  );

  function commitTitle() {
    const next = draftTitle.trim();
    if (!next) {
      setDraftTitle(title);
      return;
    }
    if (next === title) return;
    updateWhiteboard.mutate({ whiteboardId, body: { title: next } });
  }

  return (
    <>
      <div className="flex h-14 items-center gap-2 border-b border-border pr-2 pl-4">
        <Input
          aria-label="Whiteboard title"
          className="h-9 max-w-80 border-transparent bg-transparent px-2 text-sm font-medium shadow-none focus-visible:border-input focus-visible:bg-background"
          maxLength={200}
          onBlur={commitTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setDraftTitle(title);
          }}
          value={draftTitle}
        />

        {/* The dialog's own close button sits at the top right, so this row
            stops short of it. */}
        <div className="mr-10 ml-auto flex items-center gap-1">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  aria-label="Delete whiteboard"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <Trash2 />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  The drawing is deleted permanently.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    deleteWhiteboard.mutate(whiteboardId, {
                      onSuccess: onDeleted,
                    })
                  }
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <CanvasFallback />
        ) : !data ? (
          <PanelMessage>
            Could not load that drawing. Close the panel and try again.
          </PanelMessage>
        ) : (
          // Escape cancels the current tldraw tool; it must not also close the
          // dialog out from under the drawing.
          <div
            className="absolute inset-0"
            onKeyDown={(event) => {
              if (event.key === "Escape") event.stopPropagation();
            }}
          >
            <WhiteboardCanvas
              initialDocument={data.whiteboard.document}
              onDocumentChange={saveDocument}
            />
          </div>
        )}
      </div>
    </>
  );
}

function PanelMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center p-6">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function CanvasFallback() {
  return (
    <div className="h-full w-full p-4">
      <Skeleton className="h-full w-full rounded-2xl" />
    </div>
  );
}
