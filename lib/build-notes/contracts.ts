import { z } from "zod";

import { BUILD_NOTE_PRIORITIES, DEFAULT_BUILD_NOTE_PRIORITY } from "./priority";

const pageKey = z.string().min(1).max(500).startsWith("/");
const body = z.string().trim().min(1).max(2000);
const priority = z.enum(BUILD_NOTE_PRIORITIES);

// `dispatched` is set by dispatching, never by an edit.
const status = z.enum(["open", "done"]);

export const buildNotesQuerySchema = z.object({
  key: pageKey,
});

export const createBuildNoteSchema = z.object({
  pageKey,
  body,
  priority: priority.default(DEFAULT_BUILD_NOTE_PRIORITY),
});

export const updateBuildNoteSchema = z
  .object({
    body: body.optional(),
    priority: priority.optional(),
    status: status.optional(),
  })
  .refine(
    ({ body: nextBody, priority: nextPriority, status: nextStatus }) =>
      nextBody !== undefined ||
      nextPriority !== undefined ||
      nextStatus !== undefined,
    { message: "Provide at least one note field to update" },
  );

export const dispatchBuildNotesSchema = z.object({
  pageKey,
  noteIds: z.array(z.string().uuid()).min(1).max(50),
});

export type BuildNotesQuery = z.infer<typeof buildNotesQuerySchema>;
export type CreateBuildNoteInput = z.infer<typeof createBuildNoteSchema>;
export type UpdateBuildNoteInput = z.infer<typeof updateBuildNoteSchema>;
export type DispatchBuildNotesInput = z.infer<typeof dispatchBuildNotesSchema>;
