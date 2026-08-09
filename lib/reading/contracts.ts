import { z } from "zod";

import { isHttpUrl } from "./entry";

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(isHttpUrl, "Expected an http or https link");

const title = z.string().trim().min(1).max(300);
const author = z.string().trim().min(1).max(200).nullable();
const expectedVersion = z.number().int().positive();

export const createReadingItemSchema = z.object({
  /** A link or a book title; which one it is, is read off the text. */
  input: z.string().trim().min(1).max(2000),
});

export const updateReadingItemSchema = z
  .object({
    title: title.optional(),
    author: author.optional(),
    imageUrl: httpUrl.nullable().optional(),
    pdfUrl: httpUrl.nullable().optional(),
    expectedVersion,
  })
  .refine(
    ({ title, author, imageUrl, pdfUrl }) =>
      title !== undefined ||
      author !== undefined ||
      imageUrl !== undefined ||
      pdfUrl !== undefined,
    { message: "Provide at least one field to update" },
  );

export type CreateReadingItemInput = z.infer<typeof createReadingItemSchema>;
export type UpdateReadingItemInput = z.infer<typeof updateReadingItemSchema>;
