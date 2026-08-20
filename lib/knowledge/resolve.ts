import "server-only";

import { ValidationError } from "@/lib/daily-planner/errors";

import type { CreateKnowledgeItemInput } from "./contracts";
import {
  buildBookSearchUrl,
  buildWorkLookupUrl,
  isWorkKey,
  parseBookCandidates,
  type BookCandidate,
} from "./covers";
import { buildArchiveMetadataUrl, parseArchivePdfUrl } from "./ebook";
import { hostLabel, parseEntry } from "./entry";
import { fallbackArticleMetadata, parseArticleMetadata } from "./metadata";
import { isFetchableUrl } from "./safe-url";

const REQUEST_TIMEOUT_MS = 8_000;

/** One book can hold a dozen scans; the first that answers settles the link. */
const MAX_ARCHIVE_LOOKUPS = 2;

// Enough of the document to reach the head of any real article page.
const MAX_HTML_BYTES = 512_000;

// Publishers serve a different page to a client with no user agent, and some
// serve none at all.
const USER_AGENT =
  "Mozilla/5.0 (compatible; PraxisKnowledge/1.0; +https://github.com/praxis)";

export type ResolvedEntry = {
  kind: "book" | "article";
  title: string;
  author: string | null;
  source: string | null;
  url: string | null;
  pdfUrl: string | null;
  imageUrl: string | null;
  coverOptions: string[];
};

export async function resolveCreate(
  input: CreateKnowledgeItemInput,
): Promise<ResolvedEntry> {
  const entry = parseEntry(input.input);
  if (entry.kind === "article") return resolveArticle(entry.url);

  // The reader looked at the catalogue and wanted none of it.
  if (input.verbatim) return typedBook(entry.title);

  return resolveBook(entry.title, input.workKey ?? null);
}

/** The candidates the picker offers for a typed title, best first. */
export async function searchBookCandidates(query: string) {
  const payload = await readJson(buildBookSearchUrl(query));
  return payload ? parseBookCandidates(payload, query) : [];
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
    pdfUrl: null,
    imageUrl: metadata.imageUrl,
    coverOptions: [],
  };
}

async function resolveBook(
  title: string,
  workKey: string | null,
): Promise<ResolvedEntry> {
  const candidate = workKey
    ? await lookupWork(workKey)
    : ((await searchBookCandidates(title))[0] ?? null);

  // The chosen work went missing between the search and the save, or the
  // catalogue has nothing for the title; what was typed is still worth keeping.
  if (!candidate) return typedBook(title);

  return {
    kind: "book",
    // Typed titles are approximate; the catalogue spelling is the better one.
    title: candidate.title,
    author: candidate.author,
    source: candidate.firstPublishYear
      ? String(candidate.firstPublishYear)
      : null,
    url: null,
    pdfUrl: await findArchivePdf(candidate.archiveIds),
    imageUrl: candidate.covers[0] ?? null,
    coverOptions: candidate.covers,
  };
}

/** What the reader typed, saved as a bare shelf entry. */
function typedBook(title: string): ResolvedEntry {
  return {
    kind: "book",
    title,
    author: null,
    source: null,
    url: null,
    pdfUrl: null,
    imageUrl: null,
    coverOptions: [],
  };
}

async function lookupWork(workKey: string): Promise<BookCandidate | null> {
  if (!isWorkKey(workKey)) return null;

  const payload = await readJson(buildWorkLookupUrl(workKey));
  if (!payload) return null;

  const [candidate] = parseBookCandidates(payload, "");
  // A key lookup that answered with a different work is not an answer.
  return candidate?.workKey === workKey ? candidate : null;
}

/**
 * A public scan has a PDF anyone can open. Nothing here fails the save: a book
 * with no readable copy is still a book on the shelf, and the owner can paste
 * their own link on the detail page.
 */
async function findArchivePdf(archiveIds: string[]) {
  for (const archiveId of archiveIds.slice(0, MAX_ARCHIVE_LOOKUPS)) {
    const payload = await readJson(buildArchiveMetadataUrl(archiveId));
    if (!payload) continue;

    const pdfUrl = parseArchivePdfUrl(payload, archiveId);
    if (pdfUrl) return pdfUrl;
  }

  return null;
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

/** A catalogue that will not answer is a missing cover, not a failed save. */
async function readJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}
