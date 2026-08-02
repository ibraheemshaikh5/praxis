import { z } from "zod";

import { APPLICATION_STATUSES } from "./status";

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD calendar date")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value)
    );
  }, "Invalid calendar date");

const expectedVersion = z.number().int().positive();

// The cycle names a spreadsheet tab verbatim, so it keeps the tab's own casing
// and punctuation ("F25/W26 Internship" is a real one).
const cycle = z.string().trim().min(1).max(100);

const company = z.string().trim().min(1).max(200);
const title = z.string().trim().min(1).max(200);
const notes = z.string().max(5000).nullable().optional();
const applicationStatus = z.enum(APPLICATION_STATUSES);

export const applicationsQuerySchema = z.object({
  cycle: cycle.optional(),
});

export const createApplicationSchema = z.object({
  cycle: cycle.optional(),
  company,
  title,
  status: applicationStatus.optional(),
  notes,
  appliedOn: calendarDate,
});

export const updateApplicationSchema = z
  .object({
    company: company.optional(),
    title: title.optional(),
    status: applicationStatus.optional(),
    notes,
    appliedOn: calendarDate.optional(),
    expectedVersion,
  })
  .refine(
    ({ company, title, status, notes, appliedOn }) =>
      company !== undefined ||
      title !== undefined ||
      status !== undefined ||
      notes !== undefined ||
      appliedOn !== undefined,
    { message: "Provide at least one application field to update" },
  );

export const importApplicationsSchema = z.object({
  cycle: cycle.optional(),
});

export type ApplicationsQuery = z.infer<typeof applicationsQuerySchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type ImportApplicationsInput = z.infer<typeof importApplicationsSchema>;
