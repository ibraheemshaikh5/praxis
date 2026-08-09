import "server-only";

import { nameFromHandle, type ParsedConnection } from "./entry";
import {
  buildEnrichmentUrl,
  parseEnrichedProfile,
  readEnrichmentConfig,
  type EnrichedProfile,
} from "./provider";

const REQUEST_TIMEOUT_MS = 8_000;

// A profile record is small; anything this large is not one.
const MAX_RESPONSE_BYTES = 1_000_000;

export type ResolvedConnection = {
  name: string;
  headline: string | null;
  company: string | null;
  role: string | null;
  location: string | null;
  linkedinUrl: string | null;
  avatarUrl: string | null;
};

export async function resolveConnection(
  parsed: ParsedConnection,
): Promise<ResolvedConnection> {
  if (parsed.kind === "name") {
    return {
      name: clampName(parsed.name),
      headline: null,
      company: null,
      role: null,
      location: null,
      linkedinUrl: null,
      avatarUrl: null,
    };
  }

  // The handle names the person well enough to recognise the card, so the
  // lookup only ever improves on it and never blocks the save.
  const profile = await lookUpProfile(parsed.url);

  return {
    name: clampName(
      profile?.name ?? nameFromHandle(parsed.handle) ?? parsed.handle,
    ),
    headline: profile?.headline ?? null,
    company: profile?.company ?? null,
    role: profile?.role ?? null,
    location: profile?.location ?? null,
    linkedinUrl: parsed.url,
    avatarUrl: profile?.avatarUrl ?? null,
  };
}

/**
 * The input bar accepts more text than a name column holds, so a paragraph
 * pasted into it becomes a long card rather than a rejected one.
 */
function clampName(value: string) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 200
    ? `${collapsed.slice(0, 199).trimEnd()}…`
    : collapsed;
}

async function lookUpProfile(
  profileUrl: string,
): Promise<EnrichedProfile | null> {
  const config = readEnrichmentConfig(process.env);
  if (!config) return null;

  try {
    const response = await fetch(
      buildEnrichmentUrl(config.endpoint, profileUrl),
      {
        headers: {
          accept: "application/json",
          [config.headerName]: config.headerValue,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }

    const size = Number(response.headers.get("content-length") ?? 0);
    if (size > MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      return null;
    }

    return parseEnrichedProfile(await response.json());
  } catch {
    // A provider that is down, rate limited, or has no record of this person
    // costs the card nothing: it is saved from the link either way.
    return null;
  }
}
