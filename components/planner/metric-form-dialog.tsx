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
import type { MetricPayload, MetricPeriod } from "@/lib/api/types";

export type MetricFormValues = {
  name: string;
  keywords: string[];
  targetCount: number;
  period: MetricPeriod;
  endsOn: string | null;
};

type FormState = {
  name: string;
  keywordsText: string;
  targetCount: string;
  period: MetricPeriod;
  endDate: string;
};

type FieldErrors = {
  name?: string;
  keywords?: string;
  targetCount?: string;
  period?: string;
  endDate?: string;
};

const PERIOD_LABELS: Record<MetricPeriod, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

function emptyForm(): FormState {
  return {
    name: "",
    keywordsText: "",
    targetCount: "1",
    period: "week",
    endDate: "",
  };
}

function formFromMetric(metric: MetricPayload): FormState {
  return {
    name: metric.name,
    keywordsText: metric.keywords.join(", "),
    targetCount: String(metric.targetCount),
    period: metric.period,
    endDate: metric.endsOn ?? "",
  };
}

function parseKeywords(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function validate(form: FormState): {
  values?: MetricFormValues;
  errors: FieldErrors;
} {
  const errors: FieldErrors = {};
  const name = form.name.trim();
  const keywords = parseKeywords(form.keywordsText);
  const targetCount = Number(form.targetCount);

  if (!name) errors.name = "Enter a name.";
  if (keywords.length === 0) {
    errors.keywords = "Add at least one keyword.";
  }
  if (
    !Number.isFinite(targetCount) ||
    !Number.isInteger(targetCount) ||
    targetCount < 1
  ) {
    errors.targetCount = "Enter a whole number of at least 1.";
  }
  if (!form.period) errors.period = "Choose a period.";
  const endDate = form.endDate.trim();
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    errors.endDate = "Enter a valid date.";
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    values: {
      name,
      keywords,
      targetCount,
      period: form.period,
      endsOn: endDate || null,
    },
  };
}

function MetricFormFields({
  metric,
  onCancel,
  onSubmit,
  pending,
}: {
  metric: MetricPayload | null;
  onCancel: () => void;
  onSubmit: (values: MetricFormValues) => Promise<void>;
  pending?: boolean;
}) {
  const editing = Boolean(metric);
  const [form, setForm] = React.useState<FormState>(() =>
    metric ? formFromMetric(metric) : emptyForm(),
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
    <form
      className="grid gap-4"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="metric-name">Name</Label>
        <Input
          autoFocus
          id="metric-name"
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
          placeholder="Gym"
          value={form.name}
        />
        {errors.name ? (
          <p className="text-xs text-destructive">{errors.name}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="metric-keywords">Keywords</Label>
        <Input
          id="metric-keywords"
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              keywordsText: event.target.value,
            }))
          }
          placeholder="gym, workout"
          value={form.keywordsText}
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated. Matching is fuzzy and case-insensitive.
        </p>
        {errors.keywords ? (
          <p className="text-xs text-destructive">{errors.keywords}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="metric-target">Target count</Label>
        <Input
          id="metric-target"
          inputMode="numeric"
          min={1}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              targetCount: event.target.value,
            }))
          }
          type="number"
          value={form.targetCount}
        />
        {errors.targetCount ? (
          <p className="text-xs text-destructive">{errors.targetCount}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="metric-period">Period</Label>
        <Select
          items={PERIOD_LABELS}
          onValueChange={(value) => {
            if (value === "day" || value === "week" || value === "month") {
              setForm((current) => ({ ...current, period: value }));
            }
          }}
          value={form.period}
        >
          <SelectTrigger className="w-full rounded-xl" id="metric-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {(Object.keys(PERIOD_LABELS) as MetricPeriod[]).map((period) => (
              <SelectItem className="rounded-lg" key={period} value={period}>
                {PERIOD_LABELS[period]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.period ? (
          <p className="text-xs text-destructive">{errors.period}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="metric-end-date">End date</Label>
        <Input
          id="metric-end-date"
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              endDate: event.target.value,
            }))
          }
          type="date"
          value={form.endDate}
        />
        <p className="text-xs text-muted-foreground">
          Optional. How long you want to keep this up consistently.
        </p>
        {errors.endDate ? (
          <p className="text-xs text-destructive">{errors.endDate}</p>
        ) : null}
      </div>

      <DialogFooter>
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button disabled={pending} type="submit">
          {pending ? "Saving..." : editing ? "Save" : "Add goal"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MetricFormDialog({
  metric,
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  metric: MetricPayload | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: MetricFormValues) => Promise<void>;
  pending?: boolean;
}) {
  const editing = Boolean(metric);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit goal" : "Add goal"}</DialogTitle>
          <DialogDescription>
            Track how often matching tasks are completed in a period.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <MetricFormFields
            key={metric?.id ?? "create"}
            metric={metric}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            pending={pending}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
