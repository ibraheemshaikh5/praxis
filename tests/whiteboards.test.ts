import { describe, expect, it } from "vitest";

import {
  MAX_DOCUMENT_BYTES,
  createWhiteboardSchema,
  updateWhiteboardSchema,
  whiteboardsQuerySchema,
} from "@/lib/whiteboards/contracts";

describe("whiteboard contracts", () => {
  it("keys a board to a page path and trims its title", () => {
    expect(whiteboardsQuerySchema.parse({ key: "/careers" })).toEqual({
      key: "/careers",
    });
    expect(() => whiteboardsQuerySchema.parse({ key: "careers" })).toThrow();

    expect(
      createWhiteboardSchema.parse({
        pageKey: "/careers",
        title: "  Recruiting map  ",
      }),
    ).toMatchObject({ title: "Recruiting map" });
    expect(() =>
      createWhiteboardSchema.parse({ pageKey: "/careers", title: "   " }),
    ).toThrow();
  });

  it("accepts a tldraw document and requires something to update", () => {
    expect(
      updateWhiteboardSchema.parse({
        document: { store: {}, schema: { schemaVersion: 2 } },
      }),
    ).toMatchObject({ document: { schema: { schemaVersion: 2 } } });

    expect(() => updateWhiteboardSchema.parse({})).toThrow();
    expect(() => updateWhiteboardSchema.parse({ document: [] })).toThrow();
  });

  it("rejects a document larger than the column accepts", () => {
    const document = { store: "x".repeat(MAX_DOCUMENT_BYTES) };
    expect(() => updateWhiteboardSchema.parse({ document })).toThrow();
  });
});
