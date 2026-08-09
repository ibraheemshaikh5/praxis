"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { CoverArt } from "@/components/reading/cover-art";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookSearch } from "@/hooks/use-reading";
import type { BookCandidatePayload } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export type BookChoice = { workKey: string } | { verbatim: true };

/**
 * One title names several books: the work, its abridgements, its translations
 * and the study guides written about it. The catalogue is ranked but not
 * trusted to decide, so the shelf takes whichever one the owner points at.
 */
export function BookPicker({
  onCancel,
  onChoose,
  pending,
  query,
}: {
  onCancel: () => void;
  onChoose: (choice: BookChoice) => void;
  pending: boolean;
  query: string | null;
}) {
  const { data, isError, isLoading } = useBookSearch(query);
  const candidates = data?.candidates ?? [];

  // Which control the reader pressed, so the wait shows where they pressed. It
  // is read only while a save is in flight, so a failed one leaves nothing set.
  const [chosen, setChosen] = React.useState<BookChoice | null>(null);
  const busy = pending ? chosen : null;

  function choose(choice: BookChoice) {
    setChosen(choice);
    onChoose(choice);
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
      open={query !== null}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose a book</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div
            aria-label="Searching"
            className="grid grid-cols-2 gap-4 sm:grid-cols-3"
            role="status"
          >
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton className="aspect-[2/3] rounded-lg" key={index} />
            ))}
            <span className="sr-only">Searching</span>
          </div>
        ) : null}

        {!isLoading && isError ? (
          <p className="text-sm text-muted-foreground">
            Could not reach the catalogue.
          </p>
        ) : null}

        {!isLoading && !isError && candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matches.</p>
        ) : null}

        {candidates.length > 0 ? (
          <div className="grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto sm:grid-cols-3">
            {candidates.map((candidate) => (
              <CandidateButton
                busy={
                  busy !== null &&
                  "workKey" in busy &&
                  busy.workKey === candidate.workKey
                }
                candidate={candidate}
                disabled={pending}
                key={candidate.workKey}
                onSelect={() => choose({ workKey: candidate.workKey })}
              />
            ))}
          </div>
        ) : null}

        <DialogFooter>
          <Button disabled={pending} onClick={onCancel} variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() => choose({ verbatim: true })}
            variant="outline"
          >
            {busy !== null && "verbatim" in busy ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            ) : null}
            Save as typed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CandidateButton({
  busy,
  candidate,
  disabled,
  onSelect,
}: {
  busy: boolean;
  candidate: BookCandidatePayload;
  disabled: boolean;
  onSelect: () => void;
}) {
  const printings =
    candidate.editionCount > 1 ? `${candidate.editionCount} editions` : null;
  const detail = [candidate.firstPublishYear, printings]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      className={cn(
        "group flex flex-col gap-2 rounded-lg text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
        disabled && !busy && "pointer-events-none opacity-60",
        disabled && busy && "pointer-events-none",
      )}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <span className="relative block aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-foreground/10 transition group-hover:ring-ring group-focus-visible:ring-ring motion-reduce:transition-none">
        <CoverArt
          author={candidate.author}
          className="object-cover"
          imageUrl={candidate.covers[0] ?? null}
          kind="book"
          title={candidate.title}
        />
        {busy ? (
          <span className="absolute inset-0 grid place-items-center bg-background/70">
            <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
          </span>
        ) : null}
      </span>

      <span className="block">
        <span className="line-clamp-2 text-sm font-medium">
          {candidate.title}
        </span>
        {candidate.author ? (
          <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
            {candidate.author}
          </span>
        ) : null}
        {detail ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
    </button>
  );
}
