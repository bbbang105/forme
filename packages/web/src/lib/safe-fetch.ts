/**
 * SSRF-safe fetch wrapper.
 *
 * Standard `fetch` follows HTTP 30x redirects automatically. If a public URL
 * first resolves to a safe host but redirects to a private one (or is subject
 * to DNS rebinding across hops), `isSafeUrl` on the initial URL is bypassed.
 *
 * `safeFetch` mitigates this by:
 *   1. Validating the initial URL with `isSafeUrl`.
 *   2. Using `redirect: 'manual'` and, on 30x responses, re-validating the
 *      `Location` header via `isSafeUrl` before issuing the next fetch.
 *   3. Capping the redirect chain at `MAX_REDIRECTS` to prevent loops.
 *   4. Applying a default 10s timeout via `AbortSignal.timeout`.
 *
 * Returns the final `Response` on success. Throws on unsafe redirects,
 * redirect loops, redirect-chain exhaustion, or non-safe initial URLs.
 */
import {isSafeUrl} from './url-safety';

export interface SafeFetchOptions extends Omit<RequestInit, 'redirect' | 'signal'> {
  /** Max redirect hops allowed (default 3). */
  maxRedirects?: number;
  /** Timeout per-request in ms (default 10_000). */
  timeoutMs?: number;
  /** Optional upstream signal to merge (caller cancellation). */
  signal?: AbortSignal;
}

const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<Response> {
  if (!isSafeUrl(url)) {
    throw new Error('Unsafe URL (SSRF guard)');
  }

  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Separate init (without signal/redirect) so we re-use the same opts across hops.
  const {signal: userSignal, maxRedirects: _mr, timeoutMs: _t, ...init} = opts;
  void _mr; void _t;

  let currentUrl = url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = userSignal
      ? AbortSignal.any([userSignal, timeoutSignal])
      : timeoutSignal;

    const res = await fetch(currentUrl, {
      ...init,
      redirect: 'manual',
      signal,
    });

    if (!isRedirectStatus(res.status)) {
      return res;
    }

    // Redirect: consume body defensively, then chase manually.
    try {
      await res.body?.cancel();
    } catch {
      // Ignore body cancel errors.
    }

    if (hop >= maxRedirects) {
      throw new Error('Too many redirects');
    }

    const loc = res.headers.get('location');
    if (!loc) {
      // 30x with no Location → treat as final response.
      return res;
    }

    // Resolve relative Location against current URL.
    let next: string;
    try {
      next = new URL(loc, currentUrl).toString();
    } catch {
      throw new Error('Invalid redirect Location');
    }

    if (!isSafeUrl(next)) {
      throw new Error('Unsafe redirect target (SSRF guard)');
    }

    currentUrl = next;
  }

  // Defensive: loop exit should happen via return/throw above.
  throw new Error('Too many redirects');
}
