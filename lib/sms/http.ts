import "server-only";

// A provider that has not answered by then is down; the caller logs and moves on.
const REQUEST_TIMEOUT_MS = 15_000;

/** A provider request that failed, worded for the server log. */
export class ProviderError extends Error {
  constructor(provider: string, action: string, detail: string) {
    super(`${provider} ${action} ${detail}`);
    this.name = "ProviderError";
  }
}

/**
 * Sends a request to a messaging provider and returns the response body as
 * text. A non-2xx answer throws with the status and body, which providers use
 * to say what was wrong.
 */
export async function providerRequest(
  provider: string,
  action: string,
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.text().catch(() => "");
  if (!response.ok) {
    throw new ProviderError(
      provider,
      action,
      `failed (${response.status}): ${body}`,
    );
  }
  return body;
}

export function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
