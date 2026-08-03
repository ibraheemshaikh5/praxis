import { z } from "zod";

import {
  TASK_COLOR_KEYS,
  TASK_ICON_KEYS,
} from "@/lib/daily-planner/appearance";

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD calendar date")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value)
    );
  }, "Invalid calendar date");

const timestampWithOffset = z.string().datetime({ offset: true });
const expectedVersion = z.number().int().positive();
const taskIconKey = z.enum(TASK_ICON_KEYS);
const taskColorKey = z.enum(TASK_COLOR_KEYS);

const metricName = z.string().trim().min(1).max(120);
const metricKeywords = z
  .array(z.string().trim().toLowerCase().min(1).max(60))
  .min(1)
  .max(20);
const metricTargetCount = z.number().int().min(1).max(1000);
const metricPeriod = z.enum(["day", "week", "month"]);

export const plannerRangeQuerySchema = z
  .object({
    from: calendarDate,
    to: calendarDate,
    inbox: z.enum(["true", "false"]).default("false"),
  })
  .superRefine(({ from, to }, context) => {
    const fromTime = Date.parse(`${from}T00:00:00.000Z`);
    const toTime = Date.parse(`${to}T00:00:00.000Z`);
    const days = (toTime - fromTime) / 86_400_000;

    if (days < 0 || days > 30) {
      context.addIssue({
        code: "custom",
        message: "Planner ranges must contain between 1 and 31 days",
        path: ["to"],
      });
    }
  });

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    notes: z.string().max(50_000).nullable().optional(),
    iconKey: taskIconKey.optional(),
    colorKey: taskColorKey.optional(),
    plannerDate: calendarDate.nullable().optional(),
    startsAt: timestampWithOffset.nullable().optional(),
    endsAt: timestampWithOffset.nullable().optional(),
  })
  .superRefine(validateScheduleFields);

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    notes: z.string().max(50_000).nullable().optional(),
    iconKey: taskIconKey.optional(),
    colorKey: taskColorKey.optional(),
    expectedVersion,
  })
  .refine(
    ({ title, notes, iconKey, colorKey }) =>
      title !== undefined ||
      notes !== undefined ||
      iconKey !== undefined ||
      colorKey !== undefined,
    { message: "Provide at least one task field to update" },
  );

export const completionSchema = z.object({
  completed: z.boolean(),
  expectedVersion,
});

export const scheduleTaskSchema = z
  .object({
    plannerDate: calendarDate.nullable(),
    startsAt: timestampWithOffset.nullable().optional(),
    endsAt: timestampWithOffset.nullable().optional(),
    position: z.number().int().positive().optional(),
    expectedVersion,
  })
  .superRefine(validateScheduleFields);

export const reorderPlannerSchema = z.object({
  plannerDate: calendarDate,
  orderedEntryIds: z
    .array(z.string().uuid())
    .max(500)
    .refine((values) => new Set(values).size === values.length, {
      message: "Planner entry IDs must be unique",
    }),
});

export const expectedVersionQuerySchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
});

export const restoreTaskSchema = z.object({
  expectedVersion,
});

export const reserveAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "application/pdf",
    "text/plain",
    "text/markdown",
  ]),
  byteSize: z.number().int().min(1).max(26_214_400),
});

export const metricsQuerySchema = z.object({
  anchor: calendarDate,
});

export const createMetricSchema = z.object({
  name: metricName,
  keywords: metricKeywords,
  targetCount: metricTargetCount,
  period: metricPeriod,
  endsOn: calendarDate.nullable().optional(),
});

export const updateMetricSchema = z
  .object({
    name: metricName.optional(),
    keywords: metricKeywords.optional(),
    targetCount: metricTargetCount.optional(),
    period: metricPeriod.optional(),
    endsOn: calendarDate.nullable().optional(),
  })
  .refine(
    ({ name, keywords, targetCount, period, endsOn }) =>
      name !== undefined ||
      keywords !== undefined ||
      targetCount !== undefined ||
      period !== undefined ||
      endsOn !== undefined,
    { message: "Provide at least one metric field to update" },
  );

export const setMetricLinkSchema = z.object({
  metricId: z.string().uuid(),
  state: z.enum(["included", "excluded", "clear"]),
});

const pageKey = z.string().min(1).max(500).startsWith("/");

export const pageNoteQuerySchema = z.object({
  key: pageKey,
});

export const upsertPageNoteSchema = z.object({
  pageKey,
  content: z.string().max(50_000),
});

function validateScheduleFields(
  value: {
    plannerDate?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
  },
  context: z.RefinementCtx,
) {
  if (!value.plannerDate && (value.startsAt || value.endsAt)) {
    context.addIssue({
      code: "custom",
      message: "Time blocks require a planner date",
      path: ["plannerDate"],
    });
  }

  if (value.endsAt && !value.startsAt) {
    context.addIssue({
      code: "custom",
      message: "An end time requires a start time",
      path: ["endsAt"],
    });
  }

  if (
    value.startsAt &&
    value.endsAt &&
    Date.parse(value.endsAt) <= Date.parse(value.startsAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "The end time must be later than the start time",
      path: ["endsAt"],
    });
  }
}

export type PlannerRangeQuery = z.infer<typeof plannerRangeQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CompletionInput = z.infer<typeof completionSchema>;
export type ScheduleTaskInput = z.infer<typeof scheduleTaskSchema>;
export type ReorderPlannerInput = z.infer<typeof reorderPlannerSchema>;
export type ReserveAttachmentInput = z.infer<typeof reserveAttachmentSchema>;
export type MetricsQuery = z.infer<typeof metricsQuerySchema>;
export type CreateMetricInput = z.infer<typeof createMetricSchema>;
export type UpdateMetricInput = z.infer<typeof updateMetricSchema>;
export type SetMetricLinkInput = z.infer<typeof setMetricLinkSchema>;
export type PageNoteQuery = z.infer<typeof pageNoteQuerySchema>;
export type UpsertPageNoteInput = z.infer<typeof upsertPageNoteSchema>;
