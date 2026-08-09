import "server-only";

import { z } from "zod";

import {
  DispatchError,
  DispatchNotConfiguredError,
  DispatchRateLimitedError,
} from "./errors";

export const FIRE_URL_VARIABLE = "CLAUDE_ROUTINE_FIRE_URL";
export const FIRE_TOKEN_VARIABLE = "CLAUDE_ROUTINE_TOKEN";

// The /fire endpoint is in research preview and gated behind a dated beta
// header. Anthropic keeps the two previous versions working, so bumping this
// is the migration step when the shape changes.
const BETA_HEADER = "experimental-cc-routine-2026-04-01";
const API_VERSION = "2023-06-01";
const FIRE_HOST = "api.anthropic.com";
const FIRE_PATH = /^\/v1\/claude_code\/routines\/[A-Za-z0-9_-]+\/fire$/;
const REQUEST_TIMEOUT_MS = 15_000;

const fireResponseSchema = z.object({
  claude_code_session_id: z.string().min(1).max(200),
  claude_code_session_url: z.string().url().startsWith("https://").max(2000),
});

export type RoutineSession = {
  sessionId: string;
  sessionUrl: string;
};

export function isDispatchConfigured() {
  return Boolean(
    readVariable(FIRE_URL_VARIABLE) && readVariable(FIRE_TOKEN_VARIABLE),
  );
}

/**
 * Starts a Claude Code cloud session from the configured routine.
 *
 * Returns as soon as the session exists; it does not wait for the run to
 * finish. There is no read-back API for routine sessions, so the returned URL
 * is the only handle on the run.
 */
export async function fireRoutine(text: string): Promise<RoutineSession> {
  const url = requireFireUrl();
  const token = readVariable(FIRE_TOKEN_VARIABLE);

  if (!token) {
    throw new DispatchNotConfiguredError(
      `${FIRE_TOKEN_VARIABLE} is not configured`,
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "anthropic-beta": BETA_HEADER,
        "anthropic-version": API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("Routine fire request failed", error);
    throw new DispatchError("Could not reach the agent service");
  }

  if (!response.ok) throw fireFailure(response.status);

  const payload = fireResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!payload.success) {
    throw new DispatchError(
      "The agent service returned an unexpected response",
    );
  }

  return {
    sessionId: payload.data.claude_code_session_id,
    sessionUrl: payload.data.claude_code_session_url,
  };
}

function fireFailure(status: number) {
  if (status === 429) return new DispatchRateLimitedError();

  if (status === 401 || status === 403) {
    return new DispatchError(
      `The routine rejected ${FIRE_TOKEN_VARIABLE}; regenerate it and try again`,
    );
  }

  if (status === 404) {
    return new DispatchError(
      `No routine matches ${FIRE_URL_VARIABLE}; check the URL and try again`,
    );
  }

  if (status === 400) {
    return new DispatchError("The routine rejected the request");
  }

  return new DispatchError();
}

function requireFireUrl() {
  const configured = readVariable(FIRE_URL_VARIABLE);
  if (!configured) {
    throw new DispatchNotConfiguredError(
      `${FIRE_URL_VARIABLE} is not configured`,
    );
  }

  // The token travels in an Authorization header, so a mistyped or swapped
  // value would leak it to whatever host it names. Only the routine endpoint
  // is an acceptable target.
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new DispatchNotConfiguredError(`${FIRE_URL_VARIABLE} is not a URL`);
  }

  if (
    url.protocol !== "https:" ||
    url.host !== FIRE_HOST ||
    !FIRE_PATH.test(url.pathname)
  ) {
    throw new DispatchNotConfiguredError(
      `${FIRE_URL_VARIABLE} must be a https://${FIRE_HOST}/v1/claude_code/routines/<id>/fire URL`,
    );
  }

  return url.toString();
}

function readVariable(name: string) {
  return process.env[name]?.trim() || null;
}
