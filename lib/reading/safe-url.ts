/**
 * The server fetches whatever link is pasted into the bar, so the host has to
 * be somewhere on the public internet. This blocks the obvious way to point the
 * app at its own network; it does not defend against a hostname that resolves
 * to a private address, which would need resolution-time checks.
 */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "instance-data",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isFetchableUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (!host) return false;
  if (BLOCKED_HOSTS.has(host)) return false;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;

  // IPv6 literals arrive bracketed; none of them are worth fetching an article
  // from, and the loopback and unique-local forms are exactly what to avoid.
  if (host.startsWith("[")) return false;

  const octets = IPV4.exec(host);
  if (!octets) return true;

  const [a, b] = octets.slice(1).map(Number);
  if (octets.slice(1).some((part) => Number(part) > 255)) return false;

  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a >= 224) return false;

  return true;
}
