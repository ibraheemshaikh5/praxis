import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Google refresh tokens are long-lived credentials, so they are sealed with
 * AES-256-GCM before they touch a row. The key lives only in the server
 * environment, which keeps a database dump from being enough to impersonate
 * the owner against the Sheets API.
 */
export function encryptRefreshToken(token: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, readKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptRefreshToken(sealed: string) {
  const [iv, authTag, ciphertext] = sealed.split(":");
  if (!iv || !authTag || !ciphertext) {
    throw new Error("Stored Google refresh token is malformed");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    readKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Constant-time comparison for the OAuth `state` nonce. */
export function matchesStateNonce(expected: string, provided: string) {
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);

  return (
    expectedBytes.length > 0 &&
    expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}

export function createStateNonce() {
  return randomBytes(24).toString("base64url");
}

function readKey() {
  const configured = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured");
  }

  const key = Buffer.from(configured, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64",
    );
  }

  return key;
}
