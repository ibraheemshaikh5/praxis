"use client";

import * as React from "react";

import { CourseColorSwatches } from "@/components/courses/course-color";
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
import type { BareCoursePayload } from "@/lib/api/types";
import { termRangeIssue } from "@/lib/courses/contracts";
import type { TaskColorKey } from "@/lib/daily-planner/appearance";

export type CourseFormValues = {
  name: string;
  term: string;
  startsOn: string;
  endsOn: string;
  colorKey: TaskColorKey;
};

type FieldErrors = Partial<Record<keyof CourseFormValues, string>>;

const DEFAULT_COLOR: TaskColorKey = "sky";

function emptyForm(): CourseFormValues {
  return {
    name: "",
    term: "",
    startsOn: "",
    endsOn: "",
    colorKey: DEFAULT_COLOR,
  };
}

function formFromCourse(course: BareCoursePayload): CourseFormValues {
  return {
    name: course.name,
    term: course.term,
    startsOn: course.startsOn,
    endsOn: course.endsOn,
    colorKey: course.colorKey,
  };
}

function validate(form: CourseFormValues): {
  values?: CourseFormValues;
  errors: FieldErrors;
} {
  const errors: FieldErrors = {};
  const name = form.name.trim();
  const term = form.term.trim();

  if (!name) errors.name = "Enter a name.";
  if (!term) errors.term = "Enter a term.";
  if (!form.startsOn) errors.startsOn = "Enter a start date.";
  if (!form.endsOn) errors.endsOn = "Enter an end date.";
  if (form.startsOn && form.endsOn) {
    const issue = termRangeIssue(form.startsOn, form.endsOn);
    if (issue) errors.endsOn = `${issue}.`;
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { errors, values: { ...form, name, term } };
}

function CourseFormFields({
  course,
  onCancel,
  onSubmit,
  pending,
}: {
  course: BareCoursePayload | null;
  onCancel: () => void;
  onSubmit: (values: CourseFormValues) => void;
  pending?: boolean;
}) {
  const [form, setForm] = React.useState<CourseFormValues>(() =>
    course ? formFromCourse(course) : emptyForm(),
  );
  const [errors, setErrors] = React.useState<FieldErrors>({});

  function set<K extends keyof CourseFormValues>(
    key: K,
    value: CourseFormValues[K],
  ) {
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
        <Label htmlFor="course-name">Name</Label>
        <Input
          autoFocus
          id="course-name"
          onChange={(event) => set("name", event.target.value)}
          placeholder="CS 161"
          value={form.name}
        />
        {errors.name ? (
          <p className="text-xs text-destructive">{errors.name}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="course-term">Term</Label>
        <Input
          id="course-term"
          onChange={(event) => set("term", event.target.value)}
          placeholder="Fall 2026"
          value={form.term}
        />
        {errors.term ? (
          <p className="text-xs text-destructive">{errors.term}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="course-starts">Starts</Label>
          <Input
            id="course-starts"
            onChange={(event) => set("startsOn", event.target.value)}
            type="date"
            value={form.startsOn}
          />
          {errors.startsOn ? (
            <p className="text-xs text-destructive">{errors.startsOn}</p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="course-ends">Ends</Label>
          <Input
            id="course-ends"
            onChange={(event) => set("endsOn", event.target.value)}
            type="date"
            value={form.endsOn}
          />
          {errors.endsOn ? (
            <p className="text-xs text-destructive">{errors.endsOn}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Color</Label>
        <CourseColorSwatches
          onChange={(colorKey) => set("colorKey", colorKey)}
          value={form.colorKey}
        />
      </div>

      <DialogFooter>
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button disabled={pending} type="submit">
          {pending ? "Saving..." : course ? "Save" : "Add class"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CourseFormDialog({
  course,
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  course: BareCoursePayload | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CourseFormValues) => void;
  pending?: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{course ? "Edit class" : "Add class"}</DialogTitle>
        </DialogHeader>

        {open ? (
          <CourseFormFields
            course={course}
            key={course?.id ?? "create"}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            pending={pending}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
