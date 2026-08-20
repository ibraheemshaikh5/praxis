/**
 * A YouTube link reaches the bar as a watch link, a share link, a short, or an
 * embed. Each form is reduced to the video id and rebuilt as one watch URL, so
 * the same video pasted twice is a lookup rather than a second card.
 */

const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

const VIDEO_ID = /^[\w-]{11}$/;

/** Paths that carry the id as their last segment rather than as `?v=`. */
const ID_PATHS = new Set(["embed", "live", "shorts", "v"]);

export type VideoMetadata = {
  title: string;
  author: string | null;
  imageUrl: string | null;
};

export function parseYouTubeVideoId(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  const segments = url.pathname.split("/").filter(Boolean);

  if (host.endsWith("youtu.be")) return videoId(segments[0]);
  if (segments.length === 1 && segments[0] === "watch") {
    return videoId(url.searchParams.get("v"));
  }
  if (segments.length === 2 && ID_PATHS.has(segments[0])) {
    return videoId(segments[1]);
  }

  return null;
}

export function youTubeWatchUrl(id: string) {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** The no-cookie host so a saved card does not carry an ad profile with it. */
export function youTubeEmbedUrl(id: string) {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

export function buildYouTubeOEmbedUrl(id: string) {
  const target = encodeURIComponent(youTubeWatchUrl(id));
  return `https://www.youtube.com/oembed?url=${target}&format=json`;
}

/**
 * oEmbed is the only YouTube endpoint that answers without a key. A video that
 * will not answer still gets a card; the link is the point.
 */
export function parseYouTubeOEmbed(
  payload: unknown,
  id: string,
): VideoMetadata {
  const record =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {};

  return {
    title: clamp(readString(record.title), 300) || id,
    author: clamp(readString(record.author_name), 200) || null,
    imageUrl: readThumbnail(record.thumbnail_url) ?? youTubeThumbnailUrl(id),
  };
}

/** Present for every video, unlike the higher resolutions. */
function youTubeThumbnailUrl(id: string) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function videoId(value: string | null | undefined) {
  return value && VIDEO_ID.test(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readThumbnail(value: unknown) {
  const candidate = readString(value);
  if (!candidate || candidate.length > 2000) return null;
  return /^https:\/\//i.test(candidate) ? candidate : null;
}

function clamp(value: string, length: number) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > length
    ? `${collapsed.slice(0, length - 1).trimEnd()}…`
    : collapsed;
}
