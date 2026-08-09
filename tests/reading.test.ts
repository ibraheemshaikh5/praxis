import { describe, expect, it } from "vitest";

import {
  buildBookSearchUrl,
  editionCoverUrl,
  parseBookSearch,
  workCoverUrl,
} from "@/lib/reading/covers";
import {
  createReadingItemSchema,
  updateReadingItemSchema,
} from "@/lib/reading/contracts";
import {
  hostLabel,
  normalizeArticleUrl,
  parseEntry,
} from "@/lib/reading/entry";
import {
  fallbackArticleMetadata,
  parseArticleMetadata,
} from "@/lib/reading/metadata";
import { isFetchableUrl } from "@/lib/reading/safe-url";

describe("reading entry", () => {
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

describe("book covers", () => {
  const payload = {
    docs: [
      {
        title: "The Odyssey",
        author_name: ["Homer"],
        cover_i: 111,
        first_publish_year: -750,
        edition_key: ["OL1M", "OL2M"],
      },
      { title: "the odyssey!", cover_i: 222 },
      { title: "The Iliad", cover_i: 333 },
    ],
  };

  it("collects covers for the same title across printings", () => {
    expect(parseBookSearch(payload)).toEqual({
      title: "The Odyssey",
      author: "Homer",
      firstPublishYear: -750,
      covers: [
        workCoverUrl(111),
        workCoverUrl(222),
        editionCoverUrl("OL1M"),
        editionCoverUrl("OL2M"),
      ],
    });
  });

  it("survives an empty or malformed response", () => {
    expect(parseBookSearch({ docs: [] })).toBeNull();
    expect(parseBookSearch(null)).toBeNull();
    expect(parseBookSearch({ docs: [{ cover_i: 1 }] })).toBeNull();
  });

  it("asks the catalogue for the fields the card needs", () => {
    const url = new URL(buildBookSearchUrl("The Odyssey"));
    expect(url.searchParams.get("title")).toBe("The Odyssey");
    expect(url.searchParams.get("fields")).toContain("cover_i");
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

describe("reading contracts", () => {
  it("takes one line of input", () => {
    expect(createReadingItemSchema.parse({ input: "  Dune  " })).toEqual({
      input: "Dune",
    });
    expect(createReadingItemSchema.safeParse({ input: "  " }).success).toBe(
      false,
    );
  });

  it("only accepts http links for the stored URLs", () => {
    expect(
      updateReadingItemSchema.safeParse({
        pdfUrl: "javascript:alert(1)",
        expectedVersion: 1,
      }).success,
    ).toBe(false);

    expect(
      updateReadingItemSchema.parse({
        pdfUrl: " https://example.com/book.pdf ",
        expectedVersion: 2,
      }),
    ).toEqual({ pdfUrl: "https://example.com/book.pdf", expectedVersion: 2 });
  });

  it("clears a link with null but rejects an empty update", () => {
    expect(
      updateReadingItemSchema.parse({ pdfUrl: null, expectedVersion: 1 }),
    ).toEqual({ pdfUrl: null, expectedVersion: 1 });

    expect(
      updateReadingItemSchema.safeParse({ expectedVersion: 1 }).success,
    ).toBe(false);
  });
});
