import { z } from "zod";

// Matches the page_notes convention: a board belongs to the page whose
// pathname opened it.
const pageKey = z.string().min(1).max(500).startsWith("/");

const title = z.string().trim().min(1).max(200);

// Mirrors whiteboards_document_size_check. The document is tldraw's own
// snapshot shape, so it is validated as an opaque object and bounded by the
// serialized size the column accepts.
export const MAX_DOCUMENT_BYTES = 4_194_304;

const document = z
  .record(z.string(), z.unknown())
  .refine(
    (value) =>
      new TextEncoder().encode(JSON.stringify(value)).length <=
      MAX_DOCUMENT_BYTES,
    { message: "Drawing is too large to store" },
  );

export const whiteboardsQuerySchema = z.object({
  key: pageKey,
});

export const createWhiteboardSchema = z.object({
  pageKey,
  title,
});

export const updateWhiteboardSchema = z
  .object({
    title: title.optional(),
    document: document.optional(),
  })
  .refine(
    ({ title, document }) => title !== undefined || document !== undefined,
    {
      message: "Provide a title or a document to update",
    },
  );

export type WhiteboardsQuery = z.infer<typeof whiteboardsQuerySchema>;
export type CreateWhiteboardInput = z.infer<typeof createWhiteboardSchema>;
export type UpdateWhiteboardInput = z.infer<typeof updateWhiteboardSchema>;
