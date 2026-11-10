// No single Google request may hang a caller; the SMS agent also passes its
// own deadline so the whole mirror fits inside the time it has left.
const GOOGLE_REQUEST_TIMEOUT_MS = 10_000;

export function googleRequestSignal(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}
