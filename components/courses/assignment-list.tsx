"use client";

import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateAssignment,
  useDeleteAssignment,
  useUpdateAssignment,
} from "@/hooks/use-courses";
import type { CourseAssignmentPayload } from "@/lib/api/types";
import {
  dateRangeLabel,
  timeOfDayLabel,
  WEEK_ORDER,
  WEEKDAY_LABELS,
  weekdaysLabel,
} from "@/lib/courses/format";
import { cn } from "@/lib/utils";

type AssignmentFormValues = {
  title: string;
  weekdays: number[];
  dueTime: string | null;
  startsOn: string | null;
  endsOn: string | null;
  notes: string | null;
};

type FormState = {
  title: string;
  weekdays: number[];
  dueTime: string;
  startsOn: string;
  endsOn: string;
  notes: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

function emptyForm(): FormState {
  return {
    title: "",
    weekdays: [],
    dueTime: "",
    startsOn: "",
    endsOn: "",
    notes: "",
  };
}

function formFromAssignment(assignment: CourseAssignmentPayload): FormState {
  return {
    title: assignment.title,
    weekdays: assignment.weekdays,
    dueTime: assignment.dueTime ?? "",
    startsOn: assignment.startsOn ?? "",
    endsOn: assignment.endsOn ?? "",
    notes: assignment.notes ?? "",
  };
}

function validate(form: FormState): {
  values?: AssignmentFormValues;
  errors: FieldErrors;
} {
  const errors: FieldErrors = {};
  const title = form.title.trim();

  if (!title) errors.title = "Enter a title.";
  if (form.weekdays.length === 0) errors.weekdays = "Choose at least one day.";
  if (form.startsOn && form.endsOn && form.endsOn < form.startsOn) {
    errors.endsOn = "The end date must be on or after the start date.";
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    values: {
      title,
      weekdays: [...form.weekdays].sort((a, b) => a - b),
      dueTime: form.dueTime || null,
      startsOn: form.startsOn || null,
      endsOn: form.endsOn || null,
      notes: form.notes.trim() || null,
    },
  };
}

function AssignmentFormFields({
  assignment,
  onCancel,
  onSubmit,
}: {
  assignment: CourseAssignmentPayload | null;
  onCancel: () => void;
  onSubmit: (values: AssignmentFormValues) => void;
}) {
  const [form, setForm] = React.useState<FormState>(() =>
    assignment ? formFromAssignment(assignment) : emptyForm(),
  );
  const [errors, setErrors] = React.useState<FieldErrors>({});

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleWeekday(day: number) {
    setForm((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter((value) => value !== day)
        : [...current.weekdays, day],
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(form);
    setErrors(result.errors);
    if (!result.values) return;
    onSubmit(result.values);
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-1.5">
        <Label htmlFor="assignment-title">Title</Label>
        <Input
          autoFocus
          id="assignment-title"
          onChange={(event) => set("title", event.target.value)}
          placeholder="Problem set"
          value={form.title}
        />
        {errors.title ? (
          <p className="text-xs text-destructive">{errors.title}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label>Days</Label>
        <div className="flex flex-wrap gap-1.5" role="group">
          {WEEK_ORDER.map((day) => {
            const selected = form.weekdays.includes(day);
            return (
              <button
                aria-label={WEEKDAY_LABELS[day]}
                aria-pressed={selected}
                className={cn(
                  "h-8 min-w-10 rounded-xl border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 motion-reduce:transition-none",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
                key={day}
                onClick={() => toggleWeekday(day)}
                type="button"
              >
                {WEEKDAY_LABELS[day].slice(0, 3)}
              </button>
            );
          })}
        </div>
        {errors.weekdays ? (
          <p className="text-xs text-destructive">{errors.weekdays}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="assignment-time">Time</Label>
        <Input
          id="assignment-time"
          onChange={(event) => set("dueTime", event.target.value)}
          type="time"
          value={form.dueTime}
        />
        <p className="text-xs text-muted-foreground">Optional.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="assignment-starts">Starts</Label>
          <Input
            id="assignment-starts"
            onChange={(event) => set("startsOn", event.target.value)}
            type="date"
            value={form.startsOn}
          />
          <p className="text-xs text-muted-foreground">Optional.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="assignment-ends">Ends</Label>
          <Input
            id="assignment-ends"
            onChange={(event) => set("endsOn", event.target.value)}
            type="date"
            value={form.endsOn}
          />
          <p className="text-xs text-muted-foreground">Optional.</p>
          {errors.endsOn ? (
            <p className="text-xs text-destructive">{errors.endsOn}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="assignment-notes">Notes</Label>
        <Textarea
          className="min-h-20 resize-y"
          id="assignment-notes"
          onChange={(event) => set("notes", event.target.value)}
          value={form.notes}
        />
      </div>

      <DialogFooter>
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button type="submit">{assignment ? "Save" : "Add work"}</Button>
      </DialogFooter>
    </form>
  );
}

export function AssignmentList({
  assignments,
  courseId,
}: {
  assignments: CourseAssignmentPayload[];
  courseId: string;
}) {
  const createAssignment = useCreateAssignment(courseId);
  const updateAssignment = useUpdateAssignment(courseId);
  const deleteAssignment = useDeleteAssignment(courseId);

  const [editor, setEditor] = React.useState<
    | { mode: "closed" }
    | { mode: "create" }
    | { mode: "edit"; assignment: CourseAssignmentPayload }
  >({ mode: "closed" });
  const [removing, setRemoving] =
    React.useState<CourseAssignmentPayload | null>(null);

  const editing = editor.mode === "edit" ? editor.assignment : null;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Recurring work
        </h2>
        <Button
          onClick={() => setEditor({ mode: "create" })}
          size="sm"
          variant="ghost"
        >
          <Plus />
          Add
        </Button>
      </div>

      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recurring work.</p>
      ) : (
        <ol className="space-y-4">
          {assignments.map((assignment) => {
            const time = timeOfDayLabel(assignment.dueTime);
            return (
              <li
                className="border-l-2 border-border pl-4 transition-colors hover:border-primary/40 motion-reduce:transition-none"
                key={assignment.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{assignment.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {weekdaysLabel(assignment.weekdays)}
                      {time ? ` · ${time}` : ""}
                    </p>
                    {assignment.startsOn && assignment.endsOn ? (
                      <p className="text-xs text-muted-foreground">
                        {dateRangeLabel(assignment.startsOn, assignment.endsOn)}
                      </p>
                    ) : null}
                    {assignment.notes ? (
                      <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
                        {assignment.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center">
                    <Button
                      aria-label={`Edit ${assignment.title}`}
                      onClick={() => setEditor({ mode: "edit", assignment })}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      aria-label={`Remove ${assignment.title}`}
                      onClick={() => setRemoving(assignment)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Dialog
        onOpenChange={(open) => (open ? null : setEditor({ mode: "closed" }))}
        open={editor.mode !== "closed"}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit recurring work" : "Add recurring work"}
            </DialogTitle>
          </DialogHeader>
          {editor.mode !== "closed" ? (
            <AssignmentFormFields
              assignment={editing}
              key={editing?.id ?? "create"}
              onCancel={() => setEditor({ mode: "closed" })}
              onSubmit={(values) => {
                if (editing) {
                  updateAssignment.mutate({
                    assignmentId: editing.id,
                    body: values,
                  });
                } else {
                  createAssignment.mutate(values);
                }
                setEditor({ mode: "closed" });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => (open ? null : setRemoving(null))}
        open={removing !== null}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove {removing?.title}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Upcoming planner tasks for it are removed too.
          </p>
          <DialogFooter>
            <Button onClick={() => setRemoving(null)} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!removing) return;
                deleteAssignment.mutate(removing.id);
                setRemoving(null);
              }}
              variant="destructive"
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
