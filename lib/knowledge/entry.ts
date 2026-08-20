import { parseYouTubeVideoId, youTubeWatchUrl } from "./youtube";

/**
 * One input bar takes every kind of entry, so the text itself decides: a
 * YouTube link is a video, any other link is an article, anything else is a
 * book title.
 */

export type ParsedEntry =
  | { kind: "article"; url: string }
  | { kind: "video"; url: string; videoId: string }
  | { kind: "book"; title: string };

/**
 * A hostname typed without a scheme ("theatlantic.com/2026/..."). The host is
 * required to be lower case so that a dotted title ("Ready.Player.One") stays
 * a book.
 */
const BARE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}(?=$|[/?#])/;

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// Campaign parameters describe how a link was shared, not what it points at,
// so they are dropped before the URL becomes the article's identity.
const TRACKING_PARAMETERS = [
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "msclkid",
  "twclid",
];

export function parseEntry(input: string): ParsedEntry {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "book", title: "" };

  const candidate = SCHEME.test(trimmed)
    ? trimmed
    : BARE_HOST.test(trimmed) && !/\s/.test(trimmed)
      ? `https://${trimmed}`
      : null;

  if (!candidate) return { kind: "book", title: trimmed };

  const url = normalizeArticleUrl(candidate);
  if (!url) return { kind: "book", title: trimmed };

  const videoId = parseYouTubeVideoId(url);
  return videoId
    ? { kind: "video", url: youTubeWatchUrl(videoId), videoId }
    : { kind: "article", url };
}

/** Returns the canonical form of an http(s) URL, or null if it is neither. */
export function normalizeArticleUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;

  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || TRACKING_PARAMETERS.includes(key)) {
      url.searchParams.delete(key);
    }
  }

  url.hash = "";

  // URL always writes back the root path, but "example.com/" and
  // "example.com" are the same page and should not be saved twice.
  const normalized =
    url.pathname === "/" && !url.search ? url.origin : url.toString();

  return normalized.length <= 2000 ? normalized : null;
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** The bare hostname, used as an article's fallback source label. */
export function hostLabel(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
