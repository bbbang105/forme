import {beforeEach, describe, expect, it, vi} from 'vitest';

// --- Mocks ---

let _mockUser: {id: string} | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: {
      getUser: vi.fn().mockImplementation(async () => ({
        data: {user: _mockUser},
        error: _mockUser ? null : new Error('Not authenticated'),
      })),
    },
  })),
}));

// url-safety: trust inputs in tests unless a test overrides
vi.mock('@/lib/url-safety', () => ({
  isSafeUrl: vi.fn().mockReturnValue(true),
}));

// Proxy-based Drizzle mock (same pattern as notes-actions.test.ts)
const {mockDb} = vi.hoisted(() => {
  let _resolveValue: unknown = [];
  const _calls: Record<string, unknown[][]> = {};

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) =>
          Promise.resolve(_resolveValue).then(resolve);
      }
      if (prop === '_setResolve') {
        return (v: unknown) => { _resolveValue = v; };
      }
      if (prop === '_getCalls') {
        return (name: string) => _calls[name] ?? [];
      }
      if (prop === '_resetCalls') {
        return () => { for (const k of Object.keys(_calls)) delete _calls[k]; };
      }
      const name = String(prop);
      return vi.fn().mockImplementation((...args: unknown[]) => {
        (_calls[name] ??= []).push(args);
        return new Proxy({}, handler);
      });
    },
  };
  return {mockDb: new Proxy({}, handler) as Record<string, unknown>};
});

vi.mock('@forme/shared', () => ({
  db: mockDb,
  youtubeSources: {
    id: 'id',
    userId: 'user_id',
    channelId: 'channel_id',
    channelName: 'channel_name',
    isFavorite: 'is_favorite',
    favoriteOrder: 'favorite_order',
    createdAt: 'created_at',
  },
}));

function setMockUser(id: string | null) {
  _mockUser = id ? {id} : null;
}

function setDbResolve(value: unknown) {
  (mockDb as Record<string, (v: unknown) => void>)._setResolve(value);
}

function makeRequest(body: unknown, bodyError?: Error) {
  return {
    url: 'http://localhost/api/youtube/sources',
    method: 'POST',
    json: async () => {
      if (bodyError) throw bodyError;
      return body;
    },
  };
}

// Stub global.fetch so channel/RSS lookups don't escape the test
const originalFetch = global.fetch;

describe('POST /api/youtube/sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockUser(null);
    setDbResolve([{id: 'src-1', channelId: 'UC' + 'a'.repeat(22), channelName: 'Test'}]);
    // default fetch: return minimal HTML/RSS that won't match anything. Individual
    // tests can override per-call with mockImplementationOnce.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
    }) as unknown as typeof fetch;
  });

  it('returns 401 when not authenticated', async () => {
    const {POST} = await import('@/app/api/youtube/sources/route');
    const res = await POST(
      makeRequest({channelUrl: 'https://youtube.com/@foo'}) as never,
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when channelUrl is missing', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/youtube/sources/route');
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/channelUrl is required/);
  });

  it('returns 400 when channelUrl exceeds 500 chars (DoS guard)', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/youtube/sources/route');
    const huge = 'https://youtube.com/@' + 'a'.repeat(600);
    const res = await POST(makeRequest({channelUrl: huge}) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too long/i);
  });

  it('returns 400 on malformed URI escape sequence (decodeURIComponent throws)', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/youtube/sources/route');
    // %ZZ is an invalid escape — decodeURIComponent throws URIError.
    // The URL must NOT match the /channel/UC... form so we reach the @handle branch
    // where decodeURIComponent runs.
    const res = await POST(
      makeRequest({channelUrl: 'https://youtube.com/@bad%ZZ'}) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid channel URL/);
  });

  it('returns 400 when URL matches neither /channel/ nor /@handle/', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/youtube/sources/route');
    const res = await POST(
      makeRequest({channelUrl: 'https://example.com/not-a-channel'}) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/채널을 찾을 수 없습니다/);
  });

  it('returns 201 for valid /channel/UC... URL (no external fetch needed for id)', async () => {
    setMockUser('user-1');
    const validId = 'UC' + 'a'.repeat(22);
    setDbResolve([{id: 'src-1', channelId: validId, channelName: validId}]);
    const {POST} = await import('@/app/api/youtube/sources/route');
    const res = await POST(
      makeRequest({channelUrl: `https://youtube.com/channel/${validId}`}) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.channelId).toBe(validId);
  });

  it('returns 201 for valid /@handle URL by resolving channelId from HTML', async () => {
    setMockUser('user-1');
    const validId = 'UC' + 'b'.repeat(22);
    setDbResolve([{id: 'src-2', channelId: validId, channelName: 'Handle Channel'}]);
    // First fetch: handle page HTML containing externalId
    // Second fetch: RSS feed for channel name
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<html>"externalId":"${validId}"</html>`,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<author><name>Handle Channel</name></author>',
      }) as unknown as typeof fetch;

    const {POST} = await import('@/app/api/youtube/sources/route');
    const res = await POST(
      makeRequest({channelUrl: 'https://youtube.com/@handle_user'}) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.channelId).toBe(validId);
  });
});

// Cleanup after all tests
describe('cleanup', () => {
  it('restores fetch', () => {
    global.fetch = originalFetch;
    expect(true).toBe(true);
  });
});
