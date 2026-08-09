"use client";

import * as React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Check,
  ExternalLink,
  ListTodo,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
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
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useBuildNoteDispatches,
  useBuildNotes,
  useCreateBuildNote,
  useDeleteBuildNote,
  useDispatchBuildNotes,
  useUpdateBuildNote,
} from "@/hooks/use-build-notes";
import type {
  BareBuildNotePayload,
  BuildNoteDispatchGroupPayload,
  BuildNotePayload,
} from "@/lib/api/types";
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

type TaskTab = "tasks" | "cloud";

export function PageBuildNotes() {
  const pageKey = usePathname();
  return <PageBuildNotesForPage key={pageKey} pageKey={pageKey} />;
}

function PageBuildNotesForPage({ pageKey }: { pageKey: string }) {
  const { data, isError, isLoading } = useBuildNotes(pageKey);
  const notes = React.useMemo(() => data?.notes ?? [], [data]);
  const openCount = notes.filter((note) => note.status === "open").length;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label="Open tasks"
            className={cn(openCount > 0 && "text-primary")}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <ListTodo />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(30rem,calc(100vw-2rem))] gap-3 rounded-2xl p-3.5"
        sideOffset={8}
      >
        <PopoverHeader className="px-0.5">
          <PopoverTitle className="text-sm font-semibold">Tasks</PopoverTitle>
        </PopoverHeader>

        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : isError ? (
          <div className="grid h-64 place-items-center rounded-2xl border border-dashed px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Could not load these tasks. Close the panel and try again.
            </p>
          </div>
        ) : (
          <TaskPanels
            dispatchConfigured={data?.dispatchConfigured ?? false}
            notes={notes}
            pageKey={pageKey}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function TaskPanels({
  dispatchConfigured,
  notes,
  pageKey,
}: {
  dispatchConfigured: boolean;
  notes: BuildNotePayload[];
  pageKey: string;
}) {
  const [tab, setTab] = React.useState<TaskTab>("tasks");
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const dispatch = useDispatchBuildNotes(pageKey);

  // Dispatched tasks leave this list for the cloud tab.
  const pending = React.useMemo(
    () => notes.filter((note) => note.status !== "dispatched"),
    [notes],
  );

  const dispatchable = React.useMemo(
    () =>
      new Set(
        pending.filter((note) => note.status !== "done").map((n) => n.id),
      ),
    [pending],
  );

  // A task can be completed or deleted while it is selected.
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

  function send() {
    if (selectedIds.length === 0 || dispatch.isPending) return;
    dispatch.mutate(selectedIds, {
      onSuccess: () => {
        setSelected(new Set());
        setTab("cloud");
      },
    });
  }

  return (
    <Tabs onValueChange={(value) => setTab(value as TaskTab)} value={tab}>
      <TabsList>
        <TabsTab value="tasks">Tasks</TabsTab>
        <TabsTab value="cloud">Cloud</TabsTab>
      </TabsList>

      <TabsPanel className="space-y-3" value="tasks">
        <TaskComposer pageKey={pageKey} />

        {pending.length === 0 ? (
          <p className="px-0.5 py-6 text-center text-sm text-muted-foreground">
            No tasks.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {pending.map((note) => (
              <TaskRow
                key={note.id}
                note={note}
                onToggle={toggle}
                selected={selected.has(note.id)}
              />
            ))}
          </ul>
        )}

        <div className="space-y-1.5 border-t pt-3">
          <Button
            className="w-full"
            disabled={
              !dispatchConfigured ||
              selectedIds.length === 0 ||
              dispatch.isPending
            }
            onClick={send}
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
      </TabsPanel>

      <TabsPanel value="cloud">
        <CloudPanel />
      </TabsPanel>
    </Tabs>
  );
}

function TaskComposer({ pageKey }: { pageKey: string }) {
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
    <div className="flex items-start gap-2">
      <PrioritySelect
        className="mt-1.5"
        onChange={setPriority}
        value={priority}
      />
      <Textarea
        aria-label="New task"
        className="min-h-9 flex-1 bg-muted/55 py-1.5 leading-6"
        maxLength={2000}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          submit();
        }}
        placeholder="Add a task"
        rows={1}
        value={body}
      />
      <Button
        aria-label="Add task"
        className="mt-0.5"
        disabled={!trimmed || create.isPending}
        onClick={submit}
        size="icon-sm"
        variant="outline"
      >
        <Plus />
      </Button>
    </div>
  );
}

function TaskRow({
  note,
  onToggle,
  selected,
}: {
  note: BuildNotePayload;
  onToggle: (noteId: string, checked: boolean) => void;
  selected: boolean;
}) {
  const update = useUpdateBuildNote();
  const remove = useDeleteBuildNote();
  const isDone = note.status === "done";

  return (
    <li className="flex items-start gap-2 rounded-xl px-1 py-1.5 hover:bg-muted/50">
      <Checkbox
        aria-label={`Select ${PRIORITY_LABELS[note.priority]} task`}
        checked={selected}
        className="mt-1"
        disabled={isDone}
        onCheckedChange={(checked) => onToggle(note.id, checked === true)}
      />

      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            "text-sm leading-6 break-words",
            isDone && "text-muted-foreground line-through",
          )}
        >
          {note.body}
        </p>
        <PrioritySelect
          onChange={(priority) => update.mutate({ noteId: note.id, priority })}
          value={note.priority}
        />
      </div>

      <div className="flex shrink-0 items-center">
        <Button
          aria-label={isDone ? "Reopen task" : "Mark task done"}
          onClick={() =>
            update.mutate({ noteId: note.id, status: isDone ? "open" : "done" })
          }
          size="icon-xs"
          variant="ghost"
        >
          {isDone ? <Undo2 /> : <Check />}
        </Button>
        <Button
          aria-label="Delete task"
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

function CloudPanel() {
  const { data, isError, isLoading } = useBuildNoteDispatches();
  const dispatches = React.useMemo(() => data?.dispatches ?? [], [data]);

  const tracked = dispatches.flatMap((dispatch) => dispatch.notes);
  const doneCount = tracked.filter((note) => note.status === "done").length;

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  if (isError) {
    return (
      <div className="grid h-64 place-items-center rounded-2xl border border-dashed px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Could not load these runs. Close the panel and try again.
        </p>
      </div>
    );
  }

  if (dispatches.length === 0) {
    return (
      <p className="px-0.5 py-6 text-center text-sm text-muted-foreground">
        No runs.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 px-0.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium">All pages</span>
          <span className="tabular-nums text-muted-foreground">
            {doneCount} of {tracked.length} done
          </span>
        </div>
        <ProgressBar done={doneCount} total={tracked.length} />
      </div>

      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {dispatches.map((dispatch) => (
          <DispatchCard dispatch={dispatch} key={dispatch.id} />
        ))}
      </ul>
    </div>
  );
}

function DispatchCard({
  dispatch,
}: {
  dispatch: BuildNoteDispatchGroupPayload;
}) {
  const total = dispatch.notes.length;
  const done = dispatch.notes.filter((note) => note.status === "done").length;

  return (
    <li className="space-y-2 rounded-2xl border p-2.5">
      <div className="flex items-center gap-2">
        <Badge className="min-w-0 shrink" variant="secondary">
          <span className="truncate">{dispatch.pageKey}</span>
        </Badge>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDistanceToNowStrict(new Date(dispatch.createdAt), {
            addSuffix: true,
          })}
        </span>
        <a
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          href={dispatch.sessionUrl}
          rel="noreferrer"
          target="_blank"
        >
          Session
          <ExternalLink className="size-3" />
        </a>
      </div>

      {total === 0 ? null : (
        <>
          <div className="flex items-center gap-2">
            <ProgressBar className="flex-1" done={done} total={total} />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {done}/{total}
            </span>
          </div>

          <ul className="space-y-0.5">
            {dispatch.notes.map((note) => (
              <DispatchedTaskRow key={note.id} note={note} />
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

function DispatchedTaskRow({ note }: { note: BareBuildNotePayload }) {
  const update = useUpdateBuildNote();
  const isDone = note.status === "done";

  return (
    <li className="flex items-start gap-2 rounded-xl px-1 py-1 hover:bg-muted/50">
      <span
        className={cn(
          "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
          PRIORITY_TONES[note.priority],
        )}
      >
        {PRIORITY_LABELS[note.priority]}
      </span>
      <p
        className={cn(
          "min-w-0 flex-1 text-sm leading-6 break-words",
          isDone && "text-muted-foreground line-through",
        )}
      >
        {note.body}
      </p>
      <Button
        aria-label={isDone ? "Reopen task" : "Mark task done"}
        className="shrink-0"
        onClick={() =>
          update.mutate({ noteId: note.id, status: isDone ? "open" : "done" })
        }
        size="icon-xs"
        variant="ghost"
      >
        {isDone ? <Undo2 /> : <Check />}
      </Button>
    </li>
  );
}

function ProgressBar({
  className,
  done,
  total,
}: {
  className?: string;
  done: number;
  total: number;
}) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div
      aria-valuemax={total}
      aria-valuemin={0}
      aria-valuenow={done}
      className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function PrioritySelect({
  className,
  onChange,
  value,
}: {
  className?: string;
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
          className,
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
