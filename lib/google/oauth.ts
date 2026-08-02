import "server-only";

import { GoogleSyncError } from "./errors";

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const OAUTH_STATE_COOKIE = "praxis_google_oauth_state";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "openid",
  "email",
];

// Refresh a minute early so a token cannot expire mid-request.
const EXPIRY_SKEW_MS = 60_000;

type CachedAccessToken = {
  accessToken: string;
  expiresAt: number;
};

declare global {
  var praxisGoogleAccessTokens: Map<string, CachedAccessToken> | undefined;
}

export type GoogleTokenGrant = {
  accessToken: string;
  refreshToken: string;
  scope: string;
  googleEmail: string | null;
};

export function buildAuthorizationUrl(state: string) {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set(
    "client_id",
    requireEnvironment("GOOGLE_OAUTH_CLIENT_ID"),
  );
  url.searchParams.set("redirect_uri", requireRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  // Offline access plus a forced consent screen is the only combination that
  // reliably returns a refresh token on a repeat authorization.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeAuthorizationCode(
  code: string,
): Promise<GoogleTokenGrant> {
  const payload = await postToken({
    client_id: requireEnvironment("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: requireEnvironment("GOOGLE_OAUTH_CLIENT_SECRET"),
    code,
    grant_type: "authorization_code",
    redirect_uri: requireRedirectUri(),
  });

  if (!payload.refresh_token) {
    throw new GoogleSyncError(
      "Google did not return a refresh token. Remove Praxis from your Google account permissions and connect again.",
    );
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    scope: payload.scope ?? GOOGLE_SCOPES.join(" "),
    googleEmail: readIdTokenEmail(payload.id_token),
  };
}

export async function getAccessToken(userId: string, refreshToken: string) {
  const cache = (globalThis.praxisGoogleAccessTokens ??= new Map());
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;

  const payload = await postToken({
    client_id: requireEnvironment("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: requireEnvironment("GOOGLE_OAUTH_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  cache.set(userId, {
    accessToken: payload.access_token,
    expiresAt:
      Date.now() + (payload.expires_in ?? 3600) * 1000 - EXPIRY_SKEW_MS,
  });

  return payload.access_token;
}

export function forgetAccessToken(userId: string) {
  globalThis.praxisGoogleAccessTokens?.delete(userId);
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  id_token?: string;
};

async function postToken(body: Record<string, string>) {
  let response: Response;

  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });
  } catch {
    throw new GoogleSyncError("Could not reach Google to exchange the token");
  }

  const payload = (await response.json().catch(() => null)) as
    (TokenResponse & { error_description?: string; error?: string }) | null;

  if (!response.ok || !payload?.access_token) {
    throw new GoogleSyncError(
      payload?.error_description ??
        payload?.error ??
        "Google rejected the token request",
    );
  }

  return payload;
}

/**
 * The ID token arrives over TLS directly from Google's token endpoint, so the
 * claims are trustworthy without a separate signature check; only the email is
 * read, and it is display-only.
 */
function readIdTokenEmail(idToken: string | undefined) {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { email?: string };
    return claims.email ?? null;
  } catch {
    return null;
  }
}

function requireRedirectUri() {
  return requireEnvironment("GOOGLE_OAUTH_REDIRECT_URI");
}

function requireEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
