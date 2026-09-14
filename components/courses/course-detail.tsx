"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";

import { AssignmentList } from "@/components/courses/assignment-list";
import { CourseColorDot } from "@/components/courses/course-color";
import { CourseFormDialog } from "@/components/courses/course-form-dialog";
import { ExamList } from "@/components/courses/exam-list";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  useCourse,
  useDeleteCourse,
  useUpdateCourse,
} from "@/hooks/use-courses";
import { useToday } from "@/hooks/use-today";
import { signOut } from "@/lib/auth/actions";
import type { CoursePayload } from "@/lib/api/types";
import { dateRangeLabel } from "@/lib/courses/format";

export function CourseDetail({
  initialCourse,
  userEmail,
}: {
  initialCourse: CoursePayload;
  userEmail: string | null;
}) {
  const router = useRouter();
  const { data } = useCourse(initialCourse.id, initialCourse);
  const course = data.course;
  const today = useToday();

  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();
  const [editing, setEditing] = React.useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = React.useState(false);

  return (
    <AppShell onSignOut={signOut} title="Classes" userEmail={userEmail}>
      <div className="py-8 lg:py-10">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link
            className="inline-flex items-center gap-1 rounded-4xl text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            href="/classes"
          >
            <ChevronLeft className="size-4" />
            Classes
          </Link>

          <div className="flex items-center gap-1">
            <Button onClick={() => setEditing(true)} size="sm" variant="ghost">
              Edit
            </Button>
            <Button
              onClick={() => setConfirmingRemoval(true)}
              size="sm"
              variant="ghost"
            >
              Remove
            </Button>
          </div>
        </div>

        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-balance">
            <CourseColorDot className="size-3.5" colorKey={course.colorKey} />
            {course.name}
          </h1>

          <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Term</dt>
              <dd>{course.term}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Dates</dt>
              <dd>{dateRangeLabel(course.startsOn, course.endsOn)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-2 lg:gap-16">
          <ExamList courseId={course.id} exams={course.exams} today={today} />
          <AssignmentList
            assignments={course.assignments}
            courseId={course.id}
          />
        </div>

        <div className="mt-12">
          <CourseNotes
            course={course}
            onSave={(notes) =>
              updateCourse.mutate({
                courseId: course.id,
                body: { notes, expectedVersion: course.version },
              })
            }
          />
        </div>
      </div>

      <CourseFormDialog
        course={course}
        onOpenChange={setEditing}
        // The header updates optimistically, so the dialog closes at once and
        // a rejected write rolls back with a toast.
        onSubmit={(values) => {
          updateCourse.mutate({
            courseId: course.id,
            body: { ...values, expectedVersion: course.version },
          });
          setEditing(false);
        }}
        open={editing}
      />

      <Dialog onOpenChange={setConfirmingRemoval} open={confirmingRemoval}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove {course.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Its exams, recurring work, and upcoming planner tasks are removed
            too.
          </p>
          <DialogFooter>
            <Button
              onClick={() => setConfirmingRemoval(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deleteCourse.isPending}
              onClick={() =>
                deleteCourse.mutate(course.id, {
                  onSuccess: () => {
                    setConfirmingRemoval(false);
                    router.push("/classes");
                  },
                })
              }
              variant="destructive"
            >
              {deleteCourse.isPending ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" />
              ) : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function CourseNotes({
  course,
  onSave,
}: {
  course: CoursePayload;
  onSave: (notes: string | null) => void;
}) {
  const saved = course.notes ?? "";

  // A refetch replaces what is in the box only when nothing was being typed;
  // an edit in progress survives it.
  const [draft, setDraft] = React.useState({ base: saved, value: saved });
  if (draft.base !== saved) {
    setDraft({
      base: saved,
      value: draft.value === draft.base ? saved : draft.value,
    });
  }

  const value = draft.value;
  const setValue = (next: string) => setDraft({ base: saved, value: next });
  const dirty = value !== saved;

  return (
    <section>
      <h2 className="mb-4 text-sm font-medium tracking-wide text-muted-foreground uppercase">
        Notes
      </h2>

      <Textarea
        aria-label="Notes"
        className="min-h-40 resize-y bg-card"
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />

      <div className="mt-2 flex items-center gap-2">
        <Button
          disabled={!dirty}
          onClick={() => onSave(value.trim() || null)}
          size="sm"
        >
          Save
        </Button>
        {dirty ? (
          <Button onClick={() => setValue(saved)} size="sm" variant="ghost">
            Discard
          </Button>
        ) : null}
      </div>
    </section>
  );
}
