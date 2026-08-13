/**
 * LinkedIn itself answers an unauthenticated request with a sign-in wall, and
 * the vendors that used to sell a profile lookup keep being replaced — the one
 * this ran against would be a bet, not a dependency. So the provider is a seam
 * rather than an integration: whichever service the owner has an account with
 * is configured by URL and key, and the response is read for whatever field
 * names it happens to use.
 *
 *   ROLODEX_ENRICHMENT_URL   endpoint template containing {url}
 *   ROLODEX_ENRICHMENT_KEY   the API key
 *   ROLODEX_ENRICHMENT_HEADER  header carrying it (default: authorization,
 *                              sent as a bearer token)
 *
 * With none of them set the rolodex still works; a card is then whatever the
 * link and the typed name say.
 */

export type EnrichmentConfig = {
  endpoint: string;
  headerName: string;
  headerValue: string;
};

export type EnrichedProfile = {
  name: string | null;
  headline: string | null;
  company: string | null;
  role: string | null;
  location: string | null;
  avatarUrl: string | null;
};

const URL_PLACEHOLDER = "{url}";

const EMPTY_PROFILE: EnrichedProfile = {
  name: null,
  headline: null,
  company: null,
  role: null,
  location: null,
  avatarUrl: null,
};

// Providers wrap the record differently, and some do not wrap it at all.
const ENVELOPES = ["data", "person", "profile", "result"];

const FIELDS = {
  name: ["full_name", "fullName", "name", "display_name", "displayName"],
  headline: ["headline", "occupation", "sub_title", "subTitle", "summary"],
  company: [
    "job_company_name",
    "jobCompanyName",
    "company_name",
    "companyName",
    "company",
    "employer",
    "organization",
  ],
  role: [
    "job_title",
    "jobTitle",
    "title",
    "position",
    "current_position",
    "currentPosition",
  ],
  location: [
    "location_name",
    "locationName",
    "location",
    "geo",
    "city",
    "location_country",
  ],
  avatarUrl: [
    "profile_pic_url",
    "profilePicUrl",
    "profile_picture",
    "profilePicture",
    "photo_url",
    "photoUrl",
    "avatar_url",
    "avatarUrl",
    "avatar",
    "picture",
    "image_url",
    "imageUrl",
  ],
} as const;

export function readEnrichmentConfig(
  env: Record<string, string | undefined>,
): EnrichmentConfig | null {
  const endpoint = env.ROLODEX_ENRICHMENT_URL?.trim();
  const key = env.ROLODEX_ENRICHMENT_KEY?.trim();
  if (!endpoint || !key) return null;

  // A template that cannot carry the profile would send every lookup to the
  // same URL, so it counts as unconfigured rather than as a default.
  if (!endpoint.includes(URL_PLACEHOLDER)) return null;
  if (!/^https:\/\//i.test(endpoint)) return null;

  const headerName = (
    env.ROLODEX_ENRICHMENT_HEADER?.trim() || "authorization"
  ).toLowerCase();

  return {
    endpoint,
    headerName,
    headerValue: headerName === "authorization" ? `Bearer ${key}` : key,
  };
}

export function buildEnrichmentUrl(endpoint: string, profileUrl: string) {
  return endpoint.replaceAll(URL_PLACEHOLDER, encodeURIComponent(profileUrl));
}

/**
 * Reads a provider's response into the six fields a card shows. Anything the
 * response does not carry stays null; nothing here is required.
 */
export function parseEnrichedProfile(payload: unknown): EnrichedProfile {
  const record = unwrap(payload);
  if (!record) return EMPTY_PROFILE;

  return {
    name: readText(record, FIELDS.name, 200),
    headline: readText(record, FIELDS.headline, 300),
    company: readText(record, FIELDS.company, 200),
    role: readText(record, FIELDS.role, 200),
    location: readText(record, FIELDS.location, 200),
    avatarUrl: readImageUrl(record, FIELDS.avatarUrl),
  };
}

function unwrap(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;

  for (const key of ENVELOPES) {
    const inner = payload[key];
    // An envelope holding one record; a list of matches is ambiguous and the
    // rolodex would rather show the link than the wrong person.
    if (isRecord(inner)) return inner;
  }

  return payload;
}

function readText(
  record: Record<string, unknown>,
  keys: readonly string[],
  limit: number,
) {
  for (const key of keys) {
    const value = flatten(record[key]);
    if (value)
      return value.length > limit ? value.slice(0, limit).trim() : value;
  }
  return null;
}

function readImageUrl(
  record: Record<string, unknown>,
  keys: readonly string[],
) {
  for (const key of keys) {
    const value = flatten(record[key]);
    if (!value || value.length > 2000) continue;
    if (/^https?:\/\//i.test(value)) return value;
  }
  return null;
}

/** A field is a string for most providers and `{ name }` for some. */
function flatten(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.replace(/\s+/g, " ").trim();
    return trimmed || null;
  }

  if (isRecord(value)) {
    for (const key of ["name", "full_name", "fullName", "url", "title"]) {
      const inner = value[key];
      if (typeof inner === "string") return flatten(inner);
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
