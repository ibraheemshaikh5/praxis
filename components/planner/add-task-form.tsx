"use client";

import * as React from "react";
import { CirclePlus, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PlannerDateKey } from "@/lib/planner/dates";

export function AddTaskForm({
  dateKey,
  onSubmit,
  pending,
}: {
  dateKey: PlannerDateKey;
  onSubmit: (input: { title: string; notes: string | null }) => Promise<void>;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState("");
  const titleRef = React.useRef<HTMLInputElement>(null);

  const titleId = `task-title-${dateKey}`;
  const notesId = `task-notes-${dateKey}`;
  const errorId = `task-error-${dateKey}`;

  React.useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    setTitle("");
    setNotes("");
    setError("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();

    if (!cleanTitle) {
      setError("Write a task before adding it.");
      titleRef.current?.focus();
      return;
    }

    await onSubmit({ title: cleanTitle, notes: notes.trim() || null });
    close();
  }

  if (!open) {
    return (
      <Button
        className="w-full justify-start rounded-xl border-dashed text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        variant="outline"
      >
        <CirclePlus data-icon="inline-start" />
        Add a task
      </Button>
    );
  }

  return (
    <form
      className="rounded-2xl border bg-card p-4"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="space-y-2">
        <Label htmlFor={titleId}>Task</Label>
        <Input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          disabled={pending}
          id={titleId}
          onChange={(event) => {
            setTitle(event.target.value);
            if (error) setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          placeholder="What needs your attention?"
          ref={titleRef}
          value={title}
        />
        {error ? (
          <p className="text-sm text-destructive" id={errorId}>
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor={notesId}>Note (optional)</Label>
        <Textarea
          disabled={pending}
          id={notesId}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add context, a link, or the next step."
          value={notes}
        />
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button disabled={pending} onClick={close} type="button" variant="ghost">
          Cancel
        </Button>
        <Button disabled={pending} type="submit">
          {pending ? (
            <>
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                data-icon="inline-start"
              />
              Adding
            </>
          ) : (
            "Add task"
          )}
        </Button>
      </div>
    </form>
  );
}
