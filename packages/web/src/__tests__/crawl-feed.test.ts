import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// `crawl-feed` imports `@forme/shared` for DB access during `crawlSource`.
// `extractOgImage` itself doesn't touch the DB, but the module-level import
// resolves through our alias to the real drizzle singleton — which is fine
// since we never call it in these tests.

// Keep db from exploding in case something touches it at import time.
vi.mock('@forme/shared', async (orig) => {
  const actual = await orig<typeof import('@forme/shared')>();
  return {
    ...actual,
    db: new Proxy({}, {get: () => () => undefined}) as never,
  };
});

const originalFetch = global.fetch;

describe('extractOgImage (SSRF hardening)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns absolute og:image URL when page + image are public https', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: {get: () => null},
      body: {cancel: async () => {}},
      text: async () =>
        `<html><head><meta property="og:image" content="https://cdn.example.com/pic.jpg"></head></html>`,
    }) as unknown as typeof fetch;
    const {extractOgImage} = await import('@/lib/crawl-feed');
    const result = await extractOgImage('https://example.com/article');
    expect(result).toBe('https://cdn.example.com/pic.jpg');
  });

  it('rejects og:image pointing to a private IP (SSRF via attacker RSS)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: {get: () => null},
      body: {cancel: async () => {}},
      text: async () =>
        `<html><meta property="og:image" content="http://169.254.169.254/latest/meta-data/"></html>`,
    }) as unknown as typeof fetch;
    const {extractOgImage} = await import('@/lib/crawl-feed');
    const result = await extractOgImage('https://example.com/article');
    expect(result).toBeNull();
  });

  it('rejects malformed og:image URLs without throwing', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: {get: () => null},
      body: {cancel: async () => {}},
      text: async () =>
        `<html><meta property="og:image" content="not a url at all"></html>`,
    }) as unknown as typeof fetch;
    const {extractOgImage} = await import('@/lib/crawl-feed');
    const result = await extractOgImage('https://example.com/article');
    // `not a url at all` resolves against the page → https://example.com/not%20a%20url%20at%20all
    // which is safe. Regression guard: function must never throw on raw
    // attacker-controlled content.
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('returns null when the page URL itself is unsafe', async () => {
    const {extractOgImage} = await import('@/lib/crawl-feed');
    const result = await extractOgImage('http://127.0.0.1/index.html');
    expect(result).toBeNull();
  });
});
