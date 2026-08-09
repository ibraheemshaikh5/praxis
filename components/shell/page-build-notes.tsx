"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  ExternalLink,
  NotebookPen,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useBuildNotes,
  useCreateBuildNote,
  useDeleteBuildNote,
  useDispatchBuildNotes,
  useUpdateBuildNote,
} from "@/hooks/use-build-notes";
import type { BuildNotePayload } from "@/lib/api/types";
import {
  BUILD_NOTE_PRIORITIES,
  DEFAULT_BUILD_NOTE_PRIORITY,
  PRIORITY_LABELS,
  type BuildNotePriority,
} from "@/lib/build-notes/priority";
import { cn } from "@/lib/utils";

const PRIORITY_TONES: Record<BuildNotePriority, string> = {
  p0: "bg-destructive/12 text-destructive",
  p1: "bg-primary/12 text-primary",
  p2: "bg-muted text-muted-foreground",
  p3: "bg-muted text-muted-foreground",
};

export function PageBuildNotes() {
  const pageKey = usePathname();
  return <PageBuildNotesForPage key={pageKey} pageKey={pageKey} />;
}

function PageBuildNotesForPage({ pageKey }: { pageKey: string }) {
  const { data, isError, isLoading } = useBuildNotes(pageKey);
  const notes = React.useMemo(() => data?.notes ?? [], [data]);
  const openCount = notes.filter((note) => note.status !== "done").length;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label="Open build notes"
            className={cn(openCount > 0 && "text-primary")}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <NotebookPen />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(26rem,calc(100vw-2rem))] gap-3 rounded-2xl p-3.5"
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
          <BuildNotesPanel
            dispatchConfigured={data?.dispatchConfigured ?? false}
            notes={notes}
            pageKey={pageKey}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function BuildNotesPanel({
  dispatchConfigured,
  notes,
  pageKey,
}: {
  dispatchConfigured: boolean;
  notes: BuildNotePayload[];
  pageKey: string;
}) {
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const dispatch = useDispatchBuildNotes(pageKey);

  const dispatchable = React.useMemo(
    () =>
      new Set(notes.filter((note) => note.status !== "done").map((n) => n.id)),
    [notes],
  );

  const openNotes = React.useMemo(
    () => notes.filter((note) => note.status !== "done"),
    [notes],
  );
  const doneNotes = React.useMemo(
    () => notes.filter((note) => note.status === "done"),
    [notes],
  );

  // A note can be deleted or completed while it is selected.
  const selectedIds = React.useMemo(
    () => [...selected].filter((id) => dispatchable.has(id)),
    [dispatchable, selected],
  );

  function toggle(noteId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(noteId);
      else next.delete(noteId);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <NoteComposer pageKey={pageKey} />

      {notes.length === 0 ? (
        <p className="px-0.5 py-6 text-center text-sm text-muted-foreground">
          No notes.
        </p>
      ) : (
        <>
          {openNotes.length === 0 ? (
            <p className="px-0.5 py-6 text-center text-sm text-muted-foreground">
              No open notes.
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {openNotes.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  onToggle={toggle}
                  pageKey={pageKey}
                  selected={selected.has(note.id)}
                />
              ))}
            </ul>
          )}
          {doneNotes.length > 0 ? (
            <CompletedNotes
              notes={doneNotes}
              onToggle={toggle}
              pageKey={pageKey}
              selected={selected}
            />
          ) : null}
        </>
      )}

      <div className="space-y-1.5 border-t pt-3">
        <Button
          className="w-full"
          disabled={
            !dispatchConfigured ||
            selectedIds.length === 0 ||
            dispatch.isPending
          }
          onClick={() => dispatch.mutate(selectedIds)}
          size="sm"
        >
          {dispatch.isPending
            ? "Starting agent"
            : `Send ${selectedIds.length} to Claude`}
        </Button>
        {dispatchConfigured ? null : (
          <p className="px-0.5 text-center text-xs text-muted-foreground">
            Dispatch is not configured on the server.
          </p>
        )}
      </div>
    </div>
  );
}

function CompletedNotes({
  notes,
  onToggle,
  pageKey,
  selected,
}: {
  notes: BuildNotePayload[];
  onToggle: (noteId: string, checked: boolean) => void;
  pageKey: string;
  selected: ReadonlySet<string>;
}) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="border-t pt-2">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span>Completed ({notes.length})</span>
        <ChevronDown
          className={cn("size-3.5 transition-transform", isOpen && "rotate-180")}
        />
      </button>
      {isOpen ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto pt-1">
          {notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              onToggle={onToggle}
              pageKey={pageKey}
              selected={selected.has(note.id)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function NoteComposer({ pageKey }: { pageKey: string }) {
  const [body, setBody] = React.useState("");
  const [priority, setPriority] = React.useState<BuildNotePriority>(
    DEFAULT_BUILD_NOTE_PRIORITY,
  );
  const create = useCreateBuildNote(pageKey);
  const trimmed = body.trim();

  function submit() {
    if (!trimmed || create.isPending) return;
    create.mutate(
      { body: trimmed, priority },
      { onSuccess: () => setBody("") },
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        aria-label="New build note"
        className="min-h-16 resize-y bg-muted/55 leading-6"
        maxLength={2000}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          submit();
        }}
        placeholder="Add a note"
        value={body}
      />
      <div className="flex items-center gap-2">
        <PrioritySelect onChange={setPriority} value={priority} />
        <Button
          className="ml-auto"
          disabled={!trimmed || create.isPending}
          onClick={submit}
          size="sm"
          variant="outline"
        >
          <Plus />
          Add
        </Button>
      </div>
    </div>
  );
}

function NoteRow({
  note,
  onToggle,
  pageKey,
  selected,
}: {
  note: BuildNotePayload;
  onToggle: (noteId: string, checked: boolean) => void;
  pageKey: string;
  selected: boolean;
}) {
  const update = useUpdateBuildNote(pageKey);
  const remove = useDeleteBuildNote(pageKey);
  const isDone = note.status === "done";
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(note.body);

  function startEditing() {
    setDraft(note.body);
    setIsEditing(true);
  }

  function saveEdit() {
    setIsEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === note.body) return;
    update.mutate({ noteId: note.id, body: trimmed });
  }

  return (
    <li className="group/note flex items-start gap-2 rounded-xl px-1 py-1.5 hover:bg-muted/50">
      <Checkbox
        aria-label={`Select ${PRIORITY_LABELS[note.priority]} note`}
        checked={selected}
        className="mt-1"
        disabled={isDone}
        onCheckedChange={(checked) => onToggle(note.id, checked === true)}
      />

      <div className="min-w-0 flex-1 space-y-1">
        {isEditing ? (
          <Textarea
            aria-label="Edit note"
            autoFocus
            className="min-h-0 resize-none bg-muted/55 text-sm leading-6"
            onBlur={saveEdit}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(note.body);
                setIsEditing(false);
              } else if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            value={draft}
          />
        ) : (
          <p
            className={cn(
              "cursor-text text-sm leading-6 break-words",
              isDone && "text-muted-foreground line-through",
            )}
            onClick={startEditing}
          >
            {note.body}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <PrioritySelect
            onChange={(priority) =>
              update.mutate({ noteId: note.id, priority })
            }
            value={note.priority}
          />
          {note.status === "dispatched" && note.dispatchSessionUrl ? (
            <a
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
              href={note.dispatchSessionUrl}
              rel="noreferrer"
              target="_blank"
            >
              Session
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center">
        <Button
          aria-label={isDone ? "Reopen note" : "Mark note done"}
          onClick={() =>
            update.mutate({ noteId: note.id, status: isDone ? "open" : "done" })
          }
          size="icon-xs"
          variant="ghost"
        >
          {isDone ? <Undo2 /> : <Check />}
        </Button>
        <Button
          aria-label="Delete note"
          onClick={() => remove.mutate(note.id)}
          size="icon-xs"
          variant="ghost"
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

function PrioritySelect({
  onChange,
  value,
}: {
  onChange: (priority: BuildNotePriority) => void;
  value: BuildNotePriority;
}) {
  return (
    <Select
      items={PRIORITY_LABELS}
      onValueChange={(next) => {
        if (isPriority(next)) onChange(next);
      }}
      value={value}
    >
      <SelectTrigger
        aria-label="Priority"
        className={cn(
          "h-6 rounded-full px-2 text-xs font-medium",
          PRIORITY_TONES[value],
        )}
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-xl">
        {BUILD_NOTE_PRIORITIES.map((priority) => (
          <SelectItem className="rounded-lg" key={priority} value={priority}>
            {PRIORITY_LABELS[priority]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function isPriority(value: unknown): value is BuildNotePriority {
  return BUILD_NOTE_PRIORITIES.includes(value as BuildNotePriority);
}
