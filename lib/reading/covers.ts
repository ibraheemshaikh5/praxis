/**
 * Book covers come from Open Library, which needs no key and indexes editions
 * as well as works. One title has many printings, so the search yields a set of
 * covers and the owner keeps the one that matches the copy on their shelf.
 */

const SEARCH_ENDPOINT = "https://openlibrary.org/search.json";
const COVERS_ORIGIN = "https://covers.openlibrary.org";

const MAX_COVERS = 12;
const MAX_EDITIONS = 8;

export type BookMatch = {
  title: string;
  author: string | null;
  firstPublishYear: number | null;
  covers: string[];
};

export function buildBookSearchUrl(title: string) {
  const query = new URLSearchParams({
    title,
    fields: "title,author_name,cover_i,edition_key,first_publish_year",
    limit: "8",
  });

  return `${SEARCH_ENDPOINT}?${query}`;
}

/** Work-level cover: always present when the identifier is. */
export function workCoverUrl(coverId: number) {
  return `${COVERS_ORIGIN}/b/id/${coverId}-L.jpg`;
}

/**
 * Edition-level cover. `default=false` makes a missing cover a 404 rather than
 * a placeholder image, so the picker can drop it instead of showing a blank.
 */
export function editionCoverUrl(editionKey: string) {
  return `${COVERS_ORIGIN}/b/olid/${encodeURIComponent(editionKey)}-L.jpg?default=false`;
}

export function parseBookSearch(payload: unknown): BookMatch | null {
  const docs = readArray(readRecord(payload)?.docs).map(readRecord);
  const best = docs.find((doc) => doc && readString(doc.title));
  if (!best) return null;

  const title = readString(best.title);
  if (!title) return null;

  const covers: string[] = [];
  const add = (cover: string) => {
    if (covers.length < MAX_COVERS && !covers.includes(cover)) {
      covers.push(cover);
    }
  };

  const workCover = readNumber(best.cover_i);
  if (workCover !== null) add(workCoverUrl(workCover));

  // Other results only belong in the set when they are the same book under a
  // different printing, so their titles have to agree.
  for (const doc of docs) {
    if (!doc || doc === best) continue;
    if (normalizeTitle(readString(doc.title) ?? "") !== normalizeTitle(title)) {
      continue;
    }
    const cover = readNumber(doc.cover_i);
    if (cover !== null) add(workCoverUrl(cover));
  }

  for (const editionKey of readArray(best.edition_key).slice(0, MAX_EDITIONS)) {
    if (typeof editionKey === "string" && /^OL\w+M$/.test(editionKey)) {
      add(editionCoverUrl(editionKey));
    }
  }

  return {
    title,
    author:
      readArray(best.author_name)
        .map(readString)
        .find((name) => name !== null) ?? null,
    firstPublishYear: readNumber(best.first_publish_year),
    covers,
  };
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
