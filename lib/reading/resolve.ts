import "server-only";

import { ValidationError } from "@/lib/daily-planner/errors";

import { buildBookSearchUrl, parseBookSearch } from "./covers";
import { hostLabel, type ParsedEntry } from "./entry";
import { fallbackArticleMetadata, parseArticleMetadata } from "./metadata";
import { isFetchableUrl } from "./safe-url";

const REQUEST_TIMEOUT_MS = 8_000;

// Enough of the document to reach the head of any real article page.
const MAX_HTML_BYTES = 512_000;

// Publishers serve a different page to a client with no user agent, and some
// serve none at all.
const USER_AGENT =
  "Mozilla/5.0 (compatible; PraxisReading/1.0; +https://github.com/praxis)";

export type ResolvedEntry = {
  kind: "book" | "article";
  title: string;
  author: string | null;
  source: string | null;
  url: string | null;
  imageUrl: string | null;
  coverOptions: string[];
};

export async function resolveEntry(entry: ParsedEntry): Promise<ResolvedEntry> {
  return entry.kind === "article"
    ? resolveArticle(entry.url)
    : resolveBook(entry.title);
}

async function resolveArticle(url: string): Promise<ResolvedEntry> {
  if (!isFetchableUrl(url)) {
    throw new ValidationError("That link cannot be opened from here.");
  }

  const html = await readHtml(url);
  // A page that will not answer still gets a card; the link is the point.
  const metadata = html
    ? parseArticleMetadata(html, url)
    : fallbackArticleMetadata(url);

  return {
    kind: "article",
    title: metadata.title || (hostLabel(url) ?? url),
    author: metadata.author,
    source: metadata.source,
    url,
    imageUrl: metadata.imageUrl,
    coverOptions: [],
  };
}

async function resolveBook(title: string): Promise<ResolvedEntry> {
  const match = await searchBook(title);

  return {
    kind: "book",
    // Typed titles are approximate; the catalogue spelling is the better one.
    title: match?.title ?? title,
    author: match?.author ?? null,
    source: match?.firstPublishYear ? String(match.firstPublishYear) : null,
    url: null,
    imageUrl: match?.covers[0] ?? null,
    coverOptions: match?.covers ?? [],
  };
}

async function readHtml(url: string) {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": USER_AGENT,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !/text\/html|application\/xhtml/i.test(contentType)) {
    await response.body?.cancel();
    return null;
  }

  return readCapped(response);
}

/** Reads the head of the response and drops the connection at the cap. */
async function readCapped(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder("utf-8");
  let html = "";
  let bytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });

      if (bytes >= MAX_HTML_BYTES || /<\/head>/i.test(html)) break;
    }
  } catch {
    return html || null;
  } finally {
    await reader.cancel().catch(() => {});
  }

  return html || null;
}

async function searchBook(title: string) {
  try {
    const response = await fetch(buildBookSearchUrl(title), {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) return null;
    return parseBookSearch(await response.json());
  } catch {
    // A book with no cover is still worth keeping; the card falls back to a
    // typeset spine.
    return null;
  }
}
