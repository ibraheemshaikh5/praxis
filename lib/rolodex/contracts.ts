import { z } from "zod";

import { linkedInProfile, xProfile } from "./entry";

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

const name = z.string().trim().min(1).max(200);
const headline = z.string().trim().min(1).max(300).nullable();
const detail = z.string().trim().min(1).max(200).nullable();
const connectionNotes = z.string().max(50_000).nullable();
const meetingNotes = z.string().max(20_000).nullable();

/**
 * A profile is stored in one canonical form, so whatever was typed is reduced
 * to it here rather than being taken at face value.
 */
function profileField(
  normalize: (value: string) => { url: string } | null,
  message: string,
  limit: number,
) {
  return z
    .string()
    .trim()
    .max(limit)
    .transform((value, ctx) => {
      const profile = normalize(value);
      if (!profile) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return profile.url;
    })
    .nullable();
}

const linkedinUrl = profileField(
  linkedInProfile,
  "Expected a LinkedIn profile link",
  500,
);

const xUrl = profileField(xProfile, "Expected an X handle or link", 300);

// Enough of a check to catch a mistyped address without turning away a real
// one; the rolodex never sends mail, it only offers the link.
const email = z
  .string()
  .trim()
  .max(320)
  .refine(
    (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Expected an email address",
  )
  .nullable();

const phone = z.string().trim().min(1).max(50).nullable();

export const createConnectionSchema = z.object({
  /** A LinkedIn link or a name; which one it is, is read off the text. */
  input: z.string().trim().min(1).max(500),
});

/** Everything on a card an owner may set; the version is a guard, not a field. */
const CONNECTION_FIELDS = [
  "name",
  "headline",
  "company",
  "role",
  "location",
  "linkedinUrl",
  "email",
  "phone",
  "xUrl",
  "notes",
] as const;

export const updateConnectionSchema = z
  .object({
    name: name.optional(),
    headline: headline.optional(),
    company: detail.optional(),
    role: detail.optional(),
    location: detail.optional(),
    linkedinUrl: linkedinUrl.optional(),
    email: email.optional(),
    phone: phone.optional(),
    xUrl: xUrl.optional(),
    notes: connectionNotes.optional(),
    expectedVersion,
  })
  .refine(
    (input) => CONNECTION_FIELDS.some((field) => input[field] !== undefined),
    { message: "Provide at least one field to update" },
  );

export const createMeetingSchema = z.object({
  metOn: calendarDate,
  notes: meetingNotes.optional(),
});

export const updateMeetingSchema = z
  .object({
    metOn: calendarDate.optional(),
    notes: meetingNotes.optional(),
  })
  .refine(({ metOn, notes }) => metOn !== undefined || notes !== undefined, {
    message: "Provide at least one field to update",
  });

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
