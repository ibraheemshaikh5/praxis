"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
} from "@/lib/applications/status";
import type { ApplicationPayload, ApplicationStatus } from "@/lib/api/types";

export type ApplicationFormValues = {
  company: string;
  title: string;
  status: ApplicationStatus;
  notes: string | null;
  appliedOn: string;
};

type FormState = {
  company: string;
  title: string;
  status: ApplicationStatus;
  notes: string;
  appliedOn: string;
};

type FieldErrors = {
  company?: string;
  title?: string;
  appliedOn?: string;
};

function emptyForm(todayKey: string): FormState {
  return {
    company: "",
    title: "",
    status: "applied",
    notes: "",
    appliedOn: todayKey,
  };
}

function formFromApplication(application: ApplicationPayload): FormState {
  return {
    company: application.company,
    title: application.title,
    status: application.status,
    notes: application.notes ?? "",
    appliedOn: application.appliedOn,
  };
}

function validate(form: FormState): {
  values?: ApplicationFormValues;
  errors: FieldErrors;
} {
  const errors: FieldErrors = {};
  const company = form.company.trim();
  const title = form.title.trim();
  const appliedOn = form.appliedOn.trim();

  if (!company) errors.company = "Enter a company.";
  if (company.length > 200) errors.company = "Keep this under 200 characters.";
  if (!title) errors.title = "Enter a role title.";
  if (title.length > 200) errors.title = "Keep this under 200 characters.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(appliedOn)) {
    errors.appliedOn = "Enter a valid date.";
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    values: {
      company,
      title,
      status: form.status,
      notes: form.notes.trim() || null,
      appliedOn,
    },
  };
}

function ApplicationFormFields({
  application,
  companySuggestions,
  onCancel,
  onSubmit,
  pending,
  todayKey,
}: {
  application: ApplicationPayload | null;
  companySuggestions: string[];
  onCancel: () => void;
  onSubmit: (values: ApplicationFormValues) => Promise<void>;
  pending?: boolean;
  todayKey: string;
}) {
  const editing = Boolean(application);
  const [form, setForm] = React.useState<FormState>(() =>
    application ? formFromApplication(application) : emptyForm(todayKey),
  );
  const [errors, setErrors] = React.useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(form);
    setErrors(result.errors);
    if (!result.values) return;
    await onSubmit(result.values);
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
      <div className="grid gap-1.5">
        <Label htmlFor="application-company">Company</Label>
        <Input
          autoComplete="off"
          autoFocus
          // Suggestions still surface while typing; only the crude native
          // dropdown arrow is suppressed.
          className="[&::-webkit-calendar-picker-indicator]:hidden"
          id="application-company"
          list="application-company-options"
          onChange={(event) =>
            setForm((current) => ({ ...current, company: event.target.value }))
          }
          placeholder="Ramp"
          value={form.company}
        />
        <datalist id="application-company-options">
          {companySuggestions.map((company) => (
            <option key={company} value={company} />
          ))}
        </datalist>
        {errors.company ? (
          <p className="text-xs text-destructive">{errors.company}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="application-title">Title</Label>
        <Input
          id="application-title"
          onChange={(event) =>
            setForm((current) => ({ ...current, title: event.target.value }))
          }
          placeholder="Software Engineer Intern"
          value={form.title}
        />
        {errors.title ? (
          <p className="text-xs text-destructive">{errors.title}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="application-date">Date applied</Label>
          <Input
            id="application-date"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                appliedOn: event.target.value,
              }))
            }
            type="date"
            value={form.appliedOn}
          />
          {errors.appliedOn ? (
            <p className="text-xs text-destructive">{errors.appliedOn}</p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="application-status">Status</Label>
          <Select
            items={APPLICATION_STATUS_LABELS}
            onValueChange={(value) =>
              setForm((current) => ({
                ...current,
                status: value as ApplicationStatus,
              }))
            }
            value={form.status}
          >
            <SelectTrigger
              className="w-full rounded-xl"
              id="application-status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {APPLICATION_STATUSES.map((status) => (
                <SelectItem className="rounded-lg" key={status} value={status}>
                  {APPLICATION_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="application-notes">Notes</Label>
        <Textarea
          id="application-notes"
          onChange={(event) =>
            setForm((current) => ({ ...current, notes: event.target.value }))
          }
          placeholder="Referral from Priya, posting closes Friday"
          value={form.notes}
        />
        <p className="text-xs text-muted-foreground">
          Optional. Goes straight into the Notes column.
        </p>
      </div>

      <DialogFooter>
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button disabled={pending} type="submit">
          {pending ? "Saving..." : editing ? "Save" : "Log application"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ApplicationFormDialog({
  application,
  companySuggestions,
  cycle,
  needsImport,
  open,
  onOpenChange,
  onSubmit,
  pending,
  todayKey,
}: {
  application: ApplicationPayload | null;
  companySuggestions: string[];
  cycle: string;
  needsImport?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ApplicationFormValues) => Promise<void>;
  pending?: boolean;
  todayKey: string;
}) {
  const editing = Boolean(application);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit application" : "Log application"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes are pushed to the matching row in the sheet."
              : `Added to ${cycle} here and appended to the ${cycle} tab.`}
          </DialogDescription>
        </DialogHeader>

        {!editing && needsImport ? (
          <p className="rounded-2xl border border-dashed border-border px-3.5 py-3 text-xs text-muted-foreground">
            Import the {cycle} tab first so numbering continues from the rows
            already in your sheet.
          </p>
        ) : null}

        {open ? (
          <ApplicationFormFields
            application={application}
            companySuggestions={companySuggestions}
            key={application?.id ?? "create"}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            pending={pending}
            todayKey={todayKey}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
