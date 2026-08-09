/**
 * Open Library marks a work `public` when its Internet Archive scan is out of
 * copyright, and those items expose a PDF that opens without an account. A
 * borrowable or print-disabled scan lists a PDF of its own, but it is behind a
 * loan, so the item's own metadata is read before a link is kept. Books still
 * in copyright have no PDF to find; the owner links their own copy instead.
 */

const ARCHIVE_ORIGIN = "https://archive.org";

const MAX_URL_LENGTH = 2000;

export function buildArchiveMetadataUrl(archiveId: string) {
  return `${ARCHIVE_ORIGIN}/metadata/${encodeURIComponent(archiveId)}`;
}

export function parseArchivePdfUrl(
  payload: unknown,
  archiveId: string,
): string | null {
  const root = readRecord(payload);
  if (!root || root.is_dark === true) return null;

  // Set on every loan-only scan, whatever Open Library said about the work.
  const metadata = readRecord(root.metadata);
  if (String(metadata?.["access-restricted-item"] ?? "") === "true")
    return null;

  const files = readArray(root.files).map(readRecord);

  // "Text PDF" is the full scan; the grayscale derivative is a smaller stand-in
  // for it, and the encrypted ones are loan artefacts that will not open.
  const name =
    pickPdf(files, (format) => format === "Text PDF") ??
    pickPdf(
      files,
      (format) => format.endsWith("PDF") && !/encrypted/i.test(format),
    );

  if (!name) return null;

  const url = `${ARCHIVE_ORIGIN}/download/${encodeURIComponent(archiveId)}/${encodeURIComponent(name)}`;
  return url.length <= MAX_URL_LENGTH ? url : null;
}

function pickPdf(
  files: (Record<string, unknown> | null)[],
  matches: (format: string) => boolean,
) {
  for (const file of files) {
    if (!file) continue;

    const name = typeof file.name === "string" ? file.name : "";
    const format = typeof file.format === "string" ? file.format : "";

    if (!name.toLowerCase().endsWith(".pdf")) continue;
    if (name.includes("/")) continue;
    if (matches(format)) return name;
  }

  return null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
