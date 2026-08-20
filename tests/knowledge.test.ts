import { describe, expect, it } from "vitest";

import {
  buildBookSearchUrl,
  buildWorkLookupUrl,
  editionCoverUrl,
  parseBookCandidates,
  parseBookQuery,
  workCoverUrl,
} from "@/lib/knowledge/covers";
import {
  createKnowledgeItemSchema,
  updateKnowledgeItemSchema,
} from "@/lib/knowledge/contracts";
import { parseArchivePdfUrl } from "@/lib/knowledge/ebook";
import {
  hostLabel,
  normalizeArticleUrl,
  parseEntry,
} from "@/lib/knowledge/entry";
import {
  fallbackArticleMetadata,
  parseArticleMetadata,
} from "@/lib/knowledge/metadata";
import { isFetchableUrl } from "@/lib/knowledge/safe-url";

describe("knowledge entry", () => {
  it("reads a pasted link as an article", () => {
    expect(parseEntry("  https://www.newyorker.com/magazine/piece  ")).toEqual({
      kind: "article",
      url: "https://www.newyorker.com/magazine/piece",
    });
  });

  it("accepts a host typed without a scheme", () => {
    expect(parseEntry("theatlantic.com/2026/08/piece")).toEqual({
      kind: "article",
      url: "https://theatlantic.com/2026/08/piece",
    });
  });

  it("keeps a dotted or spaced title a book", () => {
    expect(parseEntry("Ready.Player.One")).toEqual({
      kind: "book",
      title: "Ready.Player.One",
    });
    expect(parseEntry("The Brothers Karamazov")).toEqual({
      kind: "book",
      title: "The Brothers Karamazov",
    });
    expect(parseEntry("1984")).toEqual({ kind: "book", title: "1984" });
  });

  it("rejects a scheme that is not http", () => {
    expect(parseEntry("mailto:reader@example.com")).toEqual({
      kind: "book",
      title: "mailto:reader@example.com",
    });
  });

  it("drops campaign parameters and the fragment so a link has one identity", () => {
    expect(
      normalizeArticleUrl(
        "https://example.com/piece?utm_source=x&fbclid=1&id=7#intro",
      ),
    ).toBe("https://example.com/piece?id=7");
  });

  it("treats a bare host and its root path as the same page", () => {
    expect(normalizeArticleUrl("https://example.com/")).toBe(
      "https://example.com",
    );
  });

  it("reports the host without www for a source label", () => {
    expect(hostLabel("https://www.ft.com/content/1")).toBe("ft.com");
    expect(hostLabel("not a url")).toBeNull();
  });
});

describe("article metadata", () => {
  const html = `
    <html><head>
      <title>Ignored &mdash; Publisher</title>
      <meta property="og:title" content="On Reading &amp; Rereading" />
      <meta property="og:site_name" content="The Paris Review" />
      <meta property="og:image" content="/images/lead.jpg" />
      <meta name="author" content="Jorge Luis Borges" />
    </head><body><title>Body title</title></body></html>
  `;

  it("prefers Open Graph tags and resolves a relative image", () => {
    expect(
      parseArticleMetadata(html, "https://theparisreview.org/blog/piece"),
    ).toEqual({
      title: "On Reading & Rereading",
      author: "Jorge Luis Borges",
      source: "The Paris Review",
      imageUrl: "https://theparisreview.org/images/lead.jpg",
    });
  });

  it("falls back to the document title and the host", () => {
    expect(
      parseArticleMetadata(
        "<html><head><title>A Plain Page</title></head></html>",
        "https://www.example.com/piece",
      ),
    ).toMatchObject({
      title: "A Plain Page",
      author: null,
      source: "example.com",
      imageUrl: null,
    });
  });

  it("drops a trailing publication name but keeps a real dash", () => {
    const of = (title: string, url: string) =>
      parseArticleMetadata(`<head><title>${title}</title></head>`, url).title;

    expect(
      of("Marginalia - Wikipedia", "https://en.wikipedia.org/wiki/M"),
    ).toBe("Marginalia");
    expect(
      of("Attention — and how to keep it", "https://en.wikipedia.org/wiki/M"),
    ).toBe("Attention — and how to keep it");
  });

  it("ignores an author given as a profile URL", () => {
    expect(
      parseArticleMetadata(
        '<head><meta property="article:author" content="https://example.com/staff/a" /></head>',
        "https://example.com/piece",
      ).author,
    ).toBeNull();
  });

  it("reads a headline out of the slug when the page cannot be fetched", () => {
    expect(
      fallbackArticleMetadata(
        "https://www.wired.com/story/the-quiet-part-out-loud-11729834",
      ),
    ).toEqual({
      title: "The quiet part out loud",
      author: null,
      source: "wired.com",
      imageUrl: null,
    });
  });
});

describe("book candidates", () => {
  const doc = (values: Record<string, unknown>) => ({
    key: "/works/OL1W",
    edition_count: 1,
    ...values,
  });

  const payload = {
    docs: [
      doc({
        key: "/works/OL10W",
        title: "The Odyssey",
        author_name: ["Homer"],
        cover_i: 111,
        first_publish_year: -750,
        edition_key: ["OL1M", "OL2M"],
        edition_count: 400,
      }),
      doc({ key: "/works/OL11W", title: "the odyssey!", cover_i: 222 }),
      doc({ key: "/works/OL12W", title: "The Iliad", cover_i: 333 }),
    ],
  };

  it("collects covers for the same title across printings", () => {
    const [best] = parseBookCandidates(payload, "The Odyssey");

    expect(best).toEqual({
      workKey: "/works/OL10W",
      title: "The Odyssey",
      author: "Homer",
      firstPublishYear: -750,
      editionCount: 400,
      archiveIds: [],
      covers: [
        workCoverUrl(111),
        workCoverUrl(222),
        editionCoverUrl("OL1M"),
        editionCoverUrl("OL2M"),
      ],
    });
  });

  it("offers the alternatives rather than only the winner", () => {
    expect(parseBookCandidates(payload, "The Odyssey")).toHaveLength(3);
  });

  it("survives an empty or malformed response", () => {
    expect(parseBookCandidates({ docs: [] }, "x")).toEqual([]);
    expect(parseBookCandidates(null, "x")).toEqual([]);
    expect(parseBookCandidates({ docs: [{ cover_i: 1 }] }, "x")).toEqual([]);
    // Without a work key the row cannot be chosen later.
    expect(parseBookCandidates({ docs: [{ title: "Dune" }] }, "Dune")).toEqual(
      [],
    );
  });

  it("ranks the book above a study guide that shares its title", () => {
    const ranked = parseBookCandidates(
      {
        docs: [
          doc({
            key: "/works/OL2W",
            title: "A Study Guide for Homer's The Odyssey",
            edition_count: 2,
          }),
          doc({
            key: "/works/OL3W",
            title: "The Odyssey",
            author_name: ["Homer"],
            cover_i: 9,
            edition_count: 400,
            language: ["eng"],
          }),
        ],
      },
      "The Odyssey",
    );

    expect(ranked.map((candidate) => candidate.workKey)).toEqual([
      "/works/OL3W",
      "/works/OL2W",
    ]);
  });

  it("reads an author typed without the word 'by'", () => {
    const ranked = parseBookCandidates(
      {
        docs: [
          doc({ key: "/works/OL4W", title: "Sapiens", edition_count: 3 }),
          doc({
            key: "/works/OL5W",
            title: "Sapiens: A Brief History of Humankind",
            author_name: ["Yuval Noah Harari"],
            edition_count: 86,
          }),
        ],
      },
      "sapiens harari",
    );

    expect(ranked[0].workKey).toBe("/works/OL5W");
  });

  it("keeps a title that reads like a byline together", () => {
    expect(parseBookQuery("Death by Black Hole")).toEqual({
      text: "Death by Black Hole",
      title: "Death",
      author: "Black Hole",
    });

    const ranked = parseBookCandidates(
      {
        docs: [
          doc({ key: "/works/OL6W", title: "Death", edition_count: 5 }),
          doc({
            key: "/works/OL7W",
            title: "Death by Black Hole",
            author_name: ["Neil deGrasse Tyson"],
            edition_count: 12,
          }),
        ],
      },
      "Death by Black Hole",
    );

    expect(ranked[0].workKey).toBe("/works/OL7W");
  });

  it("carries archive identifiers only for a public scan", () => {
    const [borrowable] = parseBookCandidates(
      {
        docs: [
          doc({ title: "Sapiens", ebook_access: "borrowable", ia: ["scan1"] }),
        ],
      },
      "Sapiens",
    );
    expect(borrowable.archiveIds).toEqual([]);

    const [publicScan] = parseBookCandidates(
      {
        docs: [
          doc({
            title: "Walden",
            ebook_access: "public",
            ia: ["waldenorlifei00thor", "../escape"],
          }),
        ],
      },
      "Walden",
    );
    expect(publicScan.archiveIds).toEqual(["waldenorlifei00thor"]);
  });

  it("asks the catalogue for the fields the ranking needs", () => {
    const url = new URL(buildBookSearchUrl("The Odyssey"));
    expect(url.searchParams.get("q")).toBe("The Odyssey");
    expect(url.searchParams.get("fields")).toContain("edition_count");
    expect(url.searchParams.get("fields")).toContain("ebook_access");

    const lookup = new URL(buildWorkLookupUrl("/works/OL10W"));
    expect(lookup.searchParams.get("q")).toBe("key:/works/OL10W");
  });
});

describe("archive pdfs", () => {
  const files = [
    { name: "walden_bw.pdf", format: "Grayscale PDF" },
    { name: "walden.pdf", format: "Text PDF" },
  ];

  it("links the full text scan of a public item", () => {
    expect(parseArchivePdfUrl({ files }, "walden")).toBe(
      "https://archive.org/download/walden/walden.pdf",
    );
  });

  it("refuses a scan that is only readable on loan", () => {
    expect(
      parseArchivePdfUrl(
        { files, metadata: { "access-restricted-item": "true" } },
        "walden",
      ),
    ).toBeNull();

    expect(parseArchivePdfUrl({ files, is_dark: true }, "walden")).toBeNull();
  });

  it("ignores the encrypted derivatives and anything that is not a pdf", () => {
    expect(
      parseArchivePdfUrl(
        {
          files: [
            { name: "walden.epub", format: "EPUB" },
            { name: "walden.lcpdf", format: "LCP Encrypted PDF" },
            { name: "walden_encrypted.pdf", format: "ACS Encrypted PDF" },
          ],
        },
        "walden",
      ),
    ).toBeNull();
  });

  it("survives a malformed response", () => {
    expect(parseArchivePdfUrl(null, "walden")).toBeNull();
    expect(parseArchivePdfUrl({ files: "no" }, "walden")).toBeNull();
  });
});

describe("fetchable urls", () => {
  it("allows an ordinary article host", () => {
    expect(isFetchableUrl("https://www.newyorker.com/piece")).toBe(true);
    expect(isFetchableUrl("http://93.184.216.34/piece")).toBe(true);
  });

  it("refuses anything that points back inside the network", () => {
    for (const url of [
      "http://localhost:3000/",
      "http://127.0.0.1/",
      "http://10.1.2.3/",
      "http://192.168.0.1/",
      "http://172.16.9.9/",
      "http://169.254.169.254/latest/meta-data/",
      "http://metadata.google.internal/",
      "http://printer.local/",
      "http://[::1]/",
      "file:///etc/passwd",
      "not a url",
    ]) {
      expect(isFetchableUrl(url), url).toBe(false);
    }
  });
});

describe("knowledge contracts", () => {
  it("takes one line of input", () => {
    expect(createKnowledgeItemSchema.parse({ input: "  Dune  " })).toEqual({
      input: "Dune",
    });
    expect(createKnowledgeItemSchema.safeParse({ input: "  " }).success).toBe(
      false,
    );
  });

  it("takes a chosen work only in the catalogue's own key form", () => {
    expect(
      createKnowledgeItemSchema.parse({
        input: "Walden",
        workKey: " /works/OL55649W ",
      }),
    ).toEqual({ input: "Walden", workKey: "/works/OL55649W" });

    for (const workKey of ["OL55649W", "/works/OL55649M", "/books/OL1W"]) {
      expect(
        createKnowledgeItemSchema.safeParse({ input: "Walden", workKey })
          .success,
        workKey,
      ).toBe(false);
    }
  });

  it("only accepts http links for the stored URLs", () => {
    expect(
      updateKnowledgeItemSchema.safeParse({
        pdfUrl: "javascript:alert(1)",
        expectedVersion: 1,
      }).success,
    ).toBe(false);

    expect(
      updateKnowledgeItemSchema.parse({
        pdfUrl: " https://example.com/book.pdf ",
        expectedVersion: 2,
      }),
    ).toEqual({ pdfUrl: "https://example.com/book.pdf", expectedVersion: 2 });
  });

  it("clears a link with null but rejects an empty update", () => {
    expect(
      updateKnowledgeItemSchema.parse({ pdfUrl: null, expectedVersion: 1 }),
    ).toEqual({ pdfUrl: null, expectedVersion: 1 });

    expect(
      updateKnowledgeItemSchema.safeParse({ expectedVersion: 1 }).success,
    ).toBe(false);
  });
});
