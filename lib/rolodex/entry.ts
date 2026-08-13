/**
 * One input bar takes both kinds of entry, so the text itself decides: a
 * LinkedIn profile link is a profile to look up, anything else is a name typed
 * from memory.
 */

export type ParsedConnection =
  | { kind: "linkedin"; handle: string; url: string }
  | { kind: "name"; name: string };

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// linkedin.com, www.linkedin.com, and the country subdomains a shared link
// picks up ("uk.linkedin.com") are all the same site.
const LINKEDIN_HOST = /^([a-z0-9-]+\.)?linkedin\.com$/;

// The handle is the whole path segment. LinkedIn mints them from names, so
// non-ASCII letters are ordinary; only separators and whitespace are not.
const HANDLE = /^[^\s/?#]{1,100}$/;

// x.com is the site; twitter.com links keep being pasted and still resolve.
const X_HOST = /^([a-z0-9-]+\.)?(x|twitter)\.com$/;

// X handles have always been ASCII word characters, capped at fifteen.
const X_HANDLE = /^\w{1,15}$/;

const DIGITS = /\d/g;

export function parseConnectionInput(input: string): ParsedConnection {
  const trimmed = input.trim();
  const profile = linkedInProfile(trimmed);
  if (profile) return { kind: "linkedin", ...profile };

  return { kind: "name", name: trimmed };
}

/**
 * The canonical form of a LinkedIn profile link, or null if the text is not
 * one. Every variant of the same profile has to reduce to one string, because
 * that string is what makes a person unique in the rolodex.
 */
export function linkedInProfile(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const candidate = SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!LINKEDIN_HOST.test(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  // /in/<handle> is a member; /company/<x> and /jobs/<x> are not people.
  if (segments.length < 2 || segments[0].toLowerCase() !== "in") return null;

  const handle = decodeSegment(segments[1]);
  if (!handle || !HANDLE.test(handle)) return null;

  return {
    handle,
    url: `https://www.linkedin.com/in/${encodeURIComponent(handle)}`,
  };
}

/**
 * The canonical form of an X profile, from a handle or from a link to one.
 * Handles are typed far more often than links are pasted, so "@ada", "ada",
 * and "twitter.com/ada" all have to mean the same account.
 */
export function xProfile(value: string) {
  const trimmed = value.trim().replace(/^@/, "");
  if (!trimmed || /\s/.test(trimmed)) return null;

  if (X_HANDLE.test(trimmed)) {
    return { handle: trimmed, url: `https://x.com/${trimmed}` };
  }

  const candidate = SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!X_HOST.test(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  // /<handle> is the profile; /<handle>/status/<id> is one post of theirs.
  if (segments.length !== 1) return null;

  const handle = segments[0];
  if (!X_HANDLE.test(handle)) return null;

  return { handle, url: `https://x.com/${handle}` };
}

/**
 * "ada-lovelace-8a12b3" is the closest thing to a name a link carries on its
 * own, and it is what the card shows until something better arrives.
 */
export function nameFromHandle(handle: string) {
  const words = handle
    .split(/[-_.]+/)
    .filter(Boolean)
    .filter((word) => !isRegistrationNoise(word));

  if (words.length === 0) return null;

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * LinkedIn appends a segment to make a handle unique — a run of digits, or a
 * short alphanumeric blob carrying several of them. A name that happens to end
 * in one digit ("shaikh2") is left alone.
 */
function isRegistrationNoise(word: string) {
  const lowered = word.toLowerCase();
  if (/^\d+$/.test(lowered)) return true;
  if (!/^[a-z0-9]{4,}$/.test(lowered)) return false;
  return (lowered.match(DIGITS) ?? []).length >= 2;
}

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
