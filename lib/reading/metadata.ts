import { hostLabel } from "./entry";

/**
 * Article pages are read for their Open Graph tags rather than their body: the
 * card needs a title, a byline, a publication and a lead image, and every
 * publisher already publishes those for social previews.
 */

export type ArticleMetadata = {
  title: string;
  author: string | null;
  source: string | null;
  imageUrl: string | null;
};

const META_TAG = /<meta\b[^>]*>/gi;
const ATTRIBUTE = /([a-z0-9:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const TITLE_TAG = /<title[^>]*>([\s\S]*?)<\/title>/i;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function parseArticleMetadata(
  html: string,
  url: string,
): ArticleMetadata {
  // Body copy can contain its own <title> (inside inline SVG, for one), so the
  // head is the authority whenever the document has one.
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd === -1 ? html : html.slice(0, headEnd);
  const meta = readMetaTags(head);

  const host = hostLabel(url);
  const title =
    firstValue(meta, ["og:title", "twitter:title", "title"]) ??
    documentTitle(head) ??
    host ??
    url;

  const author = firstValue(meta, [
    "author",
    "article:author",
    "byl",
    "twitter:creator",
  ]);

  const source = firstValue(meta, ["og:site_name"]) ?? host;

  return {
    // The card already names the publication, so the title does not repeat it.
    title: clamp(stripPublisherSuffix(title, source, host), 300),
    // article:author is often a profile URL rather than a name.
    author: author && !/^https?:\/\//i.test(author) ? clamp(author, 200) : null,
    source: clamp(source ?? "", 200) || null,
    imageUrl: resolveImage(
      firstValue(meta, ["og:image", "og:image:url", "twitter:image"]),
      url,
    ),
  };
}

/**
 * Used when the page cannot be read at all. A slug carries enough of the
 * headline to recognise the card; a bare host is the last resort.
 */
export function fallbackArticleMetadata(url: string): ArticleMetadata {
  const host = hostLabel(url);
  let slug = "";

  try {
    slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
  } catch {
    slug = "";
  }

  const words = slug
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[-_]+/g, " ")
    // Trailing article identifiers ("...-11729834") are not part of a title.
    .replace(/\b\d{4,}\b/g, "")
    .trim();

  const title = words ? capitalize(words) : (host ?? url);

  return {
    title: clamp(title, 300),
    author: null,
    source: host,
    imageUrl: null,
  };
}

/**
 * "Marginalia - Wikipedia" is the page title, but only "Marginalia" is the
 * article. The trailing segment is dropped only when it is the publication
 * itself, so a title that genuinely contains a dash survives.
 */
function stripPublisherSuffix(
  title: string,
  source: string | null,
  host: string | null,
) {
  // en.wikipedia.org is published by "Wikipedia".
  const labels = host?.split(".") ?? [];
  const registrable = labels.length > 1 ? labels[labels.length - 2] : null;

  for (const publisher of [source, registrable]) {
    if (!publisher) continue;

    const pattern = new RegExp(
      `^(.*\\S)\\s*[-–—|:·•]\\s*${escapeRegExp(publisher)}$`,
      "i",
    );
    const head = pattern.exec(title.trim())?.[1];
    if (head && head.length >= 3) return head;
  }

  return title;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function readMetaTags(html: string) {
  const values = new Map<string, string>();

  for (const tag of html.match(META_TAG) ?? []) {
    const attributes = readAttributes(tag);
    const key = attributes.get("property") ?? attributes.get("name");
    const content = attributes.get("content");
    if (!key || !content) continue;

    const normalized = key.toLowerCase();
    // First declaration wins; duplicates further down are usually fallbacks.
    if (!values.has(normalized))
      values.set(normalized, decodeEntities(content));
  }

  return values;
}

function readAttributes(tag: string) {
  const attributes = new Map<string, string>();
  ATTRIBUTE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE.exec(tag))) {
    const [, name, , doubleQuoted, singleQuoted, bare] = match;
    attributes.set(name.toLowerCase(), doubleQuoted ?? singleQuoted ?? bare);
  }

  return attributes;
}

function documentTitle(html: string) {
  const match = TITLE_TAG.exec(html);
  if (!match) return null;
  const title = decodeEntities(match[1]).trim();
  return title || null;
}

function firstValue(values: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = values.get(key)?.trim();
    if (value) return value;
  }
  return null;
}

function resolveImage(value: string | null, pageUrl: string) {
  if (!value) return null;

  try {
    // Publishers often ship a root-relative image path.
    const resolved = new URL(value, pageUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    const href = resolved.toString();
    return href.length <= 2000 ? href : null;
  } catch {
    return null;
  }
}

function decodeEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits) => codePoint(Number(digits)))
    .replace(
      /&([a-z]+);/gi,
      (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match,
    );
}

function codePoint(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return "";
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

function clamp(value: string, length: number) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > length
    ? `${collapsed.slice(0, length - 1).trimEnd()}…`
    : collapsed;
}
