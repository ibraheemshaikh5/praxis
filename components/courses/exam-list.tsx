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
  useCreateExam,
  useDeleteExam,
  useUpdateExam,
} from "@/hooks/use-courses";
import type { CourseExamPayload } from "@/lib/api/types";
import { reminderDaysLabel, timeOfDayLabel } from "@/lib/courses/format";
import { DEFAULT_REMINDER_DAYS } from "@/lib/courses/schedule";
import { formatCalendarDate } from "@/lib/rolodex/dates";

type ExamFormValues = {
  title: string;
  examOn: string;
  examTime: string | null;
  reminderDays: number[];
  notes: string | null;
};

type FormState = {
  title: string;
  examOn: string;
  examTime: string;
  reminderDaysText: string;
  notes: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

function emptyForm(): FormState {
  return {
    title: "",
    examOn: "",
    examTime: "",
    reminderDaysText: DEFAULT_REMINDER_DAYS.join(", "),
    notes: "",
  };
}

function formFromExam(exam: CourseExamPayload): FormState {
  return {
    title: exam.title,
    examOn: exam.examOn,
    examTime: exam.examTime ?? "",
    reminderDaysText: exam.reminderDays.join(", "),
    notes: exam.notes ?? "",
  };
}

/** "7, 3, 1" to [7, 3, 1]; null when something in it is not a day count. */
export function parseReminderDays(text: string): number[] | null {
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const days = parts.map(Number);
  if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 60)) {
    return null;
  }
  const unique = [...new Set(days)].sort((a, b) => b - a);
  return unique.length > 10 ? null : unique;
}

function validate(form: FormState): {
  values?: ExamFormValues;
  errors: FieldErrors;
} {
  const errors: FieldErrors = {};
  const title = form.title.trim();
  const reminderDays = parseReminderDays(form.reminderDaysText);

  if (!title) errors.title = "Enter a title.";
  if (!form.examOn) errors.examOn = "Enter a date.";
  if (reminderDays === null) {
    errors.reminderDaysText = "Whole numbers from 1 to 60, at most 10.";
  }

  if (Object.keys(errors).length > 0 || reminderDays === null) {
    return { errors };
  }

  return {
    errors,
    values: {
      title,
      examOn: form.examOn,
      examTime: form.examTime || null,
      reminderDays,
      notes: form.notes.trim() || null,
    },
  };
}

function ExamFormFields({
  exam,
  onCancel,
  onSubmit,
}: {
  exam: CourseExamPayload | null;
  onCancel: () => void;
  onSubmit: (values: ExamFormValues) => void;
}) {
  const [form, setForm] = React.useState<FormState>(() =>
    exam ? formFromExam(exam) : emptyForm(),
  );
  const [errors, setErrors] = React.useState<FieldErrors>({});

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
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
        <Label htmlFor="exam-title">Title</Label>
        <Input
          autoFocus
          id="exam-title"
          onChange={(event) => set("title", event.target.value)}
          placeholder="Midterm 1"
          value={form.title}
        />
        {errors.title ? (
          <p className="text-xs text-destructive">{errors.title}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="exam-date">Date</Label>
          <Input
            id="exam-date"
            onChange={(event) => set("examOn", event.target.value)}
            type="date"
            value={form.examOn}
          />
          {errors.examOn ? (
            <p className="text-xs text-destructive">{errors.examOn}</p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exam-time">Time</Label>
          <Input
            id="exam-time"
            onChange={(event) => set("examTime", event.target.value)}
            type="time"
            value={form.examTime}
          />
          <p className="text-xs text-muted-foreground">Optional.</p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="exam-reminders">Remind</Label>
        <Input
          id="exam-reminders"
          inputMode="numeric"
          onChange={(event) => set("reminderDaysText", event.target.value)}
          placeholder="7, 3, 1"
          value={form.reminderDaysText}
        />
        <p className="text-xs text-muted-foreground">
          Days before, comma-separated.
        </p>
        {errors.reminderDaysText ? (
          <p className="text-xs text-destructive">{errors.reminderDaysText}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="exam-notes">Notes</Label>
        <Textarea
          className="min-h-20 resize-y"
          id="exam-notes"
          onChange={(event) => set("notes", event.target.value)}
          value={form.notes}
        />
      </div>

      <DialogFooter>
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button type="submit">{exam ? "Save" : "Add exam"}</Button>
      </DialogFooter>
    </form>
  );
}

export function ExamList({
  courseId,
  exams,
  today,
}: {
  courseId: string;
  exams: CourseExamPayload[];
  today: string | null;
}) {
  const createExam = useCreateExam(courseId);
  const updateExam = useUpdateExam(courseId);
  const deleteExam = useDeleteExam(courseId);

  const [editor, setEditor] = React.useState<
    | { mode: "closed" }
    | { mode: "create" }
    | { mode: "edit"; exam: CourseExamPayload }
  >({ mode: "closed" });
  const [removing, setRemoving] = React.useState<CourseExamPayload | null>(
    null,
  );

  const editing = editor.mode === "edit" ? editor.exam : null;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Exams
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

      {exams.length === 0 ? (
        <p className="text-sm text-muted-foreground">No exams.</p>
      ) : (
        <ol className="space-y-4">
          {exams.map((exam) => {
            const past = today !== null && exam.examOn < today;
            const time = timeOfDayLabel(exam.examTime);
            return (
              <li
                className="border-l-2 border-border pl-4 transition-colors hover:border-primary/40 motion-reduce:transition-none"
                key={exam.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{exam.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCalendarDate(exam.examOn)}
                      {time ? ` · ${time}` : ""}
                      {past
                        ? " · Past"
                        : ` · ${reminderDaysLabel(exam.reminderDays)}`}
                    </p>
                    {exam.notes ? (
                      <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
                        {exam.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center">
                    <Button
                      aria-label={`Edit ${exam.title}`}
                      onClick={() => setEditor({ mode: "edit", exam })}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      aria-label={`Remove ${exam.title}`}
                      onClick={() => setRemoving(exam)}
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
            <DialogTitle>{editing ? "Edit exam" : "Add exam"}</DialogTitle>
          </DialogHeader>
          {editor.mode !== "closed" ? (
            <ExamFormFields
              exam={editing}
              key={editing?.id ?? "create"}
              onCancel={() => setEditor({ mode: "closed" })}
              // The row lands in the list optimistically, so the dialog
              // closes at once; a rejected write rolls back with a toast.
              onSubmit={(values) => {
                if (editing) {
                  updateExam.mutate({ examId: editing.id, body: values });
                } else {
                  createExam.mutate(values);
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
            Upcoming planner reminders for it are removed too.
          </p>
          <DialogFooter>
            <Button onClick={() => setRemoving(null)} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!removing) return;
                deleteExam.mutate(removing.id);
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
