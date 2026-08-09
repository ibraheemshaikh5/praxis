/**
 * Book candidates come from Open Library, which needs no key and indexes
 * editions as well as works. Its own ordering puts study guides, translations
 * and abridgements above the book itself often enough that the results are
 * scored here and the set is offered to the owner, rather than the top row
 * being taken on trust.
 */

const SEARCH_ENDPOINT = "https://openlibrary.org/search.json";
const COVERS_ORIGIN = "https://covers.openlibrary.org";

const SEARCH_FIELDS = [
  "key",
  "title",
  "author_name",
  "cover_i",
  "edition_key",
  "edition_count",
  "first_publish_year",
  "language",
  "ebook_access",
  "ia",
  "readinglog_count",
].join(",");

const SEARCH_LIMIT = 16;

/** The row's cover set is capped in the database; the picker shows a screenful. */
const MAX_COVERS = 12;
const MAX_EDITIONS = 8;
const MAX_CANDIDATES = 6;
const MAX_ARCHIVE_IDS = 4;

const WORK_KEY = /^\/works\/OL\d+W$/;
const EDITION_KEY = /^OL\w+M$/;

// Interpolated into a URL path, so anything that could climb out of it is not
// an identifier worth following.
const ARCHIVE_ID = /^[a-z0-9][a-z0-9._-]{0,119}$/i;

/** Only a public scan has a PDF that can be opened without a loan. */
const PUBLIC_EBOOK_ACCESS = "public";

/**
 * Retellings and course notes carry the book's title and outrank it on a bare
 * title search. They are demoted only when the reader did not ask for one.
 */
const DERIVATIVE =
  /\b(summary|summaries|study guide|studyguide|cliffs?notes|sparknotes|workbook|companion|abridged|adaptation|adapted|quicklet)\b/i;

/** Particles and suffixes that identify nobody on their own. */
const NAME_NOISE = new Set([
  "and",
  "de",
  "del",
  "den",
  "der",
  "di",
  "jr",
  "la",
  "le",
  "sr",
  "the",
  "van",
  "von",
]);

export type BookQuery = {
  /** What was typed, whole. */
  text: string;
  title: string;
  author: string | null;
};

export type BookCandidate = {
  workKey: string;
  title: string;
  author: string | null;
  firstPublishYear: number | null;
  editionCount: number;
  covers: string[];
  /** Internet Archive scans, carried only when the whole item is public. */
  archiveIds: string[];
};

export function buildBookSearchUrl(query: string) {
  // `q` reads the title and the author together, so "sapiens harari" and
  // "Death by Black Hole" both land without the caller taking them apart.
  const params = new URLSearchParams({
    q: query,
    fields: SEARCH_FIELDS,
    limit: String(SEARCH_LIMIT),
  });

  return `${SEARCH_ENDPOINT}?${params}`;
}

/**
 * A work chosen in the picker is read back from the catalogue by key instead of
 * being trusted from the client, so a saved row always holds the catalogue's
 * own title, author and covers.
 */
export function buildWorkLookupUrl(workKey: string) {
  const params = new URLSearchParams({
    q: `key:${workKey}`,
    fields: SEARCH_FIELDS,
    limit: "1",
  });

  return `${SEARCH_ENDPOINT}?${params}`;
}

export function isWorkKey(value: string) {
  return WORK_KEY.test(value);
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

/**
 * "Death by Black Hole" is a title, not a book by someone called Black Hole.
 * The split is a hint for scoring only, so getting it wrong costs a bonus and
 * nothing else.
 */
export function parseBookQuery(input: string): BookQuery {
  const text = input.trim();
  const match = /^(.*\S)\s+by\s+(\S.*)$/i.exec(text);

  return match
    ? { text, title: match[1], author: match[2] }
    : { text, title: text, author: null };
}

export function parseBookCandidates(
  payload: unknown,
  query: string,
): BookCandidate[] {
  const docs = readArray(readRecord(payload)?.docs)
    .map(readRecord)
    .filter(
      (doc): doc is Record<string, unknown> =>
        doc !== null &&
        readString(doc.title) !== null &&
        // Without a key the row cannot be chosen, only guessed at again.
        isWorkKey(readString(doc.key) ?? ""),
    );

  const target = parseBookQuery(query);

  return docs
    .map((doc, index) => ({ doc, index, score: scoreDoc(doc, target) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_CANDIDATES)
    .map(({ doc }) => toCandidate(doc, docs));
}

function toCandidate(
  doc: Record<string, unknown>,
  docs: Record<string, unknown>[],
): BookCandidate {
  const title = readString(doc.title) ?? "";

  const covers: string[] = [];
  const add = (cover: string) => {
    if (covers.length < MAX_COVERS && !covers.includes(cover)) {
      covers.push(cover);
    }
  };

  const workCover = readNumber(doc.cover_i);
  if (workCover !== null) add(workCoverUrl(workCover));

  // Other results only belong in the set when they are the same book under a
  // different printing, so their titles have to agree.
  for (const other of docs) {
    if (other === doc) continue;
    if (compact(readString(other.title) ?? "") !== compact(title)) continue;
    const cover = readNumber(other.cover_i);
    if (cover !== null) add(workCoverUrl(cover));
  }

  for (const editionKey of readArray(doc.edition_key).slice(0, MAX_EDITIONS)) {
    if (typeof editionKey === "string" && EDITION_KEY.test(editionKey)) {
      add(editionCoverUrl(editionKey));
    }
  }

  return {
    workKey: readString(doc.key) ?? "",
    title,
    author: firstAuthor(doc),
    firstPublishYear: readNumber(doc.first_publish_year),
    editionCount: readNumber(doc.edition_count) ?? 0,
    covers,
    archiveIds:
      readString(doc.ebook_access) === PUBLIC_EBOOK_ACCESS
        ? readArray(doc.ia)
            .filter(
              (value): value is string =>
                typeof value === "string" && ARCHIVE_ID.test(value),
            )
            .slice(0, MAX_ARCHIVE_IDS)
        : [],
  };
}

function scoreDoc(doc: Record<string, unknown>, query: BookQuery) {
  const title = readString(doc.title) ?? "";
  const author = firstAuthor(doc);

  // The whole line, the line without a trailing "by ...", and the line with
  // this book's author struck out are all plausible titles; whichever matches
  // best is the one the reader meant.
  let score = Math.max(
    titleScore(title, query.text),
    titleScore(title, query.title),
    titleScore(title, withoutAuthor(query.text, author)),
  );

  score += authorScore(author, query);
  score += popularityScore(doc);

  if (readNumber(doc.cover_i) !== null) score += 12;
  if (readArray(doc.language).includes("eng")) score += 8;
  if (DERIVATIVE.test(title) && !DERIVATIVE.test(query.text)) score -= 70;

  return score;
}

function titleScore(title: string, query: string) {
  const found = compact(title);
  const wanted = compact(query);
  if (!found || !wanted) return 0;

  if (found === wanted) return 100;
  // A subtitle the reader did not type, or a title they typed the start of.
  if (found.startsWith(wanted) || wanted.startsWith(found)) return 62;
  if (found.includes(wanted) || wanted.includes(found)) return 34;

  const typed = new Set(words(query));
  const parts = words(title);
  if (parts.length === 0 || typed.size === 0) return 0;

  return (parts.filter((part) => typed.has(part)).length / parts.length) * 30;
}

function authorScore(author: string | null, query: BookQuery) {
  if (!author) return 0;
  if (query.author && compact(query.author) === compact(author)) return 60;

  // "sapiens harari" names the author without saying so; one part of the name
  // is enough to tell the book apart from a namesake.
  const typed = new Set(words(query.text));
  const parts = nameParts(author);
  if (parts.length === 0) return 0;

  const hits = parts.filter((part) => typed.has(part)).length;
  return hits === 0 ? 0 : 20 + (hits / parts.length) * 25;
}

/**
 * "sapiens harari" is a title and a surname run together. Measuring the title
 * against the whole line punishes it for holding a name, so the part of the
 * line that named this book's author is taken out first.
 */
function withoutAuthor(text: string, author: string | null) {
  if (!author) return text;

  const parts = new Set(nameParts(author));
  if (parts.size === 0) return text;

  return words(text)
    .filter((word) => !parts.has(word))
    .join(" ");
}

function nameParts(author: string) {
  return words(author).filter(
    (part) => part.length > 2 && !NAME_NOISE.has(part),
  );
}

/**
 * A book that has been printed and shelved many times is the one a bare title
 * usually means. Both counts are long-tailed, so they are read on a log scale.
 */
function popularityScore(doc: Record<string, unknown>) {
  const editions = Math.max(0, readNumber(doc.edition_count) ?? 0);
  const readers = Math.max(0, readNumber(doc.readinglog_count) ?? 0);

  return (
    Math.min(25, Math.log10(editions + 1) * 12) +
    Math.min(15, Math.log10(readers + 1) * 5)
  );
}

function firstAuthor(doc: Record<string, unknown>) {
  return (
    readArray(doc.author_name)
      .map(readString)
      .find((name) => name !== null) ?? null
  );
}

/** Punctuation and case carry no meaning in a typed title. */
function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function words(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
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
