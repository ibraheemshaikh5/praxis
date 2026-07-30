import { z } from "zod";

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
    plannerDate: calendarDate.nullable().optional(),
    startsAt: timestampWithOffset.nullable().optional(),
    endsAt: timestampWithOffset.nullable().optional(),
  })
  .superRefine(validateScheduleFields);

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    notes: z.string().max(50_000).nullable().optional(),
    expectedVersion,
  })
  .refine(({ title, notes }) => title !== undefined || notes !== undefined, {
    message: "Provide at least one task field to update",
  });

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
