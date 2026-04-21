import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {safeFetch} from '@/lib/safe-fetch';

/**
 * Build a fetch-like Response object compatible with the code path in
 * safeFetch (uses .status, .headers.get, .body?.cancel, and passes through
 * to caller). We avoid real Response to keep body.cancel() simple.
 */
function fakeResponse(status: number, location?: string) {
  return {
    status,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === 'location') return location ?? null;
        return null;
      },
    },
    body: {
      cancel: async () => {},
    },
    ok: status >= 200 && status < 300,
    text: async () => '',
  } as unknown as Response;
}

const originalFetch = global.fetch;

describe('safeFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects unsafe initial URLs without fetching', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    await expect(safeFetch('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/Unsafe URL/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects file:// / non-http(s) protocols', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    await expect(safeFetch('file:///etc/passwd')).rejects.toThrow(/Unsafe URL/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns final response on 200 without redirect', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(fakeResponse(200)) as unknown as typeof fetch;
    const res = await safeFetch('https://example.com/feed.xml');
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Verify redirect:manual is passed through
    const initArg = (global.fetch as unknown as {mock: {calls: unknown[][]}}).mock.calls[0]![1] as RequestInit;
    expect(initArg.redirect).toBe('manual');
  });

  it('follows a safe 302 to a safe host', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(fakeResponse(302, 'https://example.org/final'))
      .mockResolvedValueOnce(fakeResponse(200)) as unknown as typeof fetch;
    const res = await safeFetch('https://example.com/start');
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // 2nd call should be the redirect target
    const [secondUrl] = (global.fetch as unknown as {mock: {calls: unknown[][]}}).mock.calls[1]!;
    expect(secondUrl).toBe('https://example.org/final');
  });

  it('rejects a 302 that points to a private IP', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(fakeResponse(302, 'http://169.254.169.254/latest/meta-data/')) as unknown as typeof fetch;
    await expect(safeFetch('https://example.com/start')).rejects.toThrow(/Unsafe redirect target/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a 302 to loopback/localhost', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(fakeResponse(302, 'http://127.0.0.1:8080/admin')) as unknown as typeof fetch;
    await expect(safeFetch('https://example.com/start')).rejects.toThrow(/Unsafe redirect target/);
  });

  it('rejects after too many redirects', async () => {
    // maxRedirects=3 → allow 3 hops then fail on the 4th 30x
    global.fetch = vi.fn()
      .mockResolvedValueOnce(fakeResponse(302, 'https://a.example.com/1'))
      .mockResolvedValueOnce(fakeResponse(302, 'https://a.example.com/2'))
      .mockResolvedValueOnce(fakeResponse(302, 'https://a.example.com/3'))
      .mockResolvedValueOnce(fakeResponse(302, 'https://a.example.com/4')) as unknown as typeof fetch;
    await expect(safeFetch('https://example.com/start', {maxRedirects: 3})).rejects.toThrow(/Too many redirects/);
  });

  it('resolves relative Location against current URL and validates', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(fakeResponse(301, '/new-path'))
      .mockResolvedValueOnce(fakeResponse(200)) as unknown as typeof fetch;
    const res = await safeFetch('https://example.com/old');
    expect(res.status).toBe(200);
    const [secondUrl] = (global.fetch as unknown as {mock: {calls: unknown[][]}}).mock.calls[1]!;
    expect(secondUrl).toBe('https://example.com/new-path');
  });

  it('rejects malformed Location values', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(fakeResponse(302, '://not a url')) as unknown as typeof fetch;
    // "://not a url" resolved against base is still invalid → SSRF reject or parse reject
    await expect(safeFetch('https://example.com/start')).rejects.toThrow();
  });
});
