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

const {mockDb} = vi.hoisted(() => {
  const _queue: unknown[] = [];
  const _calls: Record<string, unknown[][]> = {};
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') {
        const v = _queue.shift() ?? [];
        return (r: (v: unknown) => void) => Promise.resolve(v).then(r);
      }
      if (prop === '_enqueue') return (v: unknown) => _queue.push(v);
      if (prop === '_reset') {
        return () => {
          _queue.length = 0;
          for (const k of Object.keys(_calls)) delete _calls[k];
        };
      }
      if (prop === '_calls') return (n: string) => _calls[n] ?? [];
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
  feedItems: {
    id: 'id',
    sourceId: 'source_id',
    url: 'url',
    deletedAt: 'deleted_at',
  },
  feedSources: {id: 'id', userId: 'user_id', url: 'url'},
}));

function setMockUser(id: string | null) {
  _mockUser = id ? {id} : null;
}

function enqueue(v: unknown) {
  (mockDb as Record<string, (v: unknown) => void>)._enqueue(v);
}

function getCalls(name: string): unknown[][] {
  return (mockDb as Record<string, (n: string) => unknown[][]>)._calls(name);
}

function resetDb() {
  (mockDb as Record<string, () => void>)._reset();
}

function makeRequest(body: unknown) {
  return {
    url: 'http://localhost/api/feed/add-url',
    method: 'POST',
    json: async () => body,
  };
}

describe('POST /api/feed/add-url — thumbnailUrl https enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    setMockUser(null);
  });

  it('accepts a valid https thumbnail URL', async () => {
    setMockUser('user-1');
    // Chain: (1) select manualSource → found, (2) select existing item → none, (3) insert returning → created
    enqueue([{id: 'src-1'}]); // manualSource
    enqueue([]); // existing
    enqueue([{
      id: 'item-1',
      sourceId: 'src-1',
      title: 'T',
      url: 'https://example.com/a',
      description: null,
      thumbnailUrl: 'https://cdn.example.com/pic.jpg',
      publishedAt: null,
      category: 'ai',
      tags: [],
      isRead: false,
      isBookmarked: false,
      collectedAt: new Date(),
      note: null,
      pinnedAt: null,
    }]);

    const {POST} = await import('@/app/api/feed/add-url/route');
    const res = await POST(makeRequest({
      url: 'https://example.com/a',
      title: 'T',
      thumbnailUrl: 'https://cdn.example.com/pic.jpg',
    }) as never);
    expect(res.status).toBe(201);
    const valuesCalls = getCalls('values');
    // First values() is manual source lookup (if insert happened). Our mock
    // returns an existing source so only the feedItems insert triggers
    // values(). Find the call whose payload has `thumbnailUrl`.
    const payload = valuesCalls
      .map((c) => c[0] as Record<string, unknown>)
      .find((p) => p && 'thumbnailUrl' in p)!;
    expect(payload.thumbnailUrl).toBe('https://cdn.example.com/pic.jpg');
  });

  it('rejects http:// thumbnail URL → saves null', async () => {
    setMockUser('user-1');
    enqueue([{id: 'src-1'}]);
    enqueue([]);
    enqueue([{id: 'item-1', sourceId: 'src-1', title: 'T', url: 'https://example.com/b', description: null, thumbnailUrl: null, publishedAt: null, category: 'ai', tags: [], isRead: false, isBookmarked: false, collectedAt: new Date(), note: null, pinnedAt: null}]);

    const {POST} = await import('@/app/api/feed/add-url/route');
    const res = await POST(makeRequest({
      url: 'https://example.com/b',
      title: 'T',
      thumbnailUrl: 'http://insecure.example.com/pic.jpg',
    }) as never);
    expect(res.status).toBe(201);
    const payload = getCalls('values')
      .map((c) => c[0] as Record<string, unknown>)
      .find((p) => p && 'thumbnailUrl' in p)!;
    expect(payload.thumbnailUrl).toBeNull();
  });

  it('rejects malformed thumbnail URL → saves null', async () => {
    setMockUser('user-1');
    enqueue([{id: 'src-1'}]);
    enqueue([]);
    enqueue([{id: 'item-1', sourceId: 'src-1', title: 'T', url: 'https://example.com/c', description: null, thumbnailUrl: null, publishedAt: null, category: 'ai', tags: [], isRead: false, isBookmarked: false, collectedAt: new Date(), note: null, pinnedAt: null}]);

    const {POST} = await import('@/app/api/feed/add-url/route');
    const res = await POST(makeRequest({
      url: 'https://example.com/c',
      title: 'T',
      thumbnailUrl: 'not a url',
    }) as never);
    expect(res.status).toBe(201);
    const payload = getCalls('values')
      .map((c) => c[0] as Record<string, unknown>)
      .find((p) => p && 'thumbnailUrl' in p)!;
    expect(payload.thumbnailUrl).toBeNull();
  });
});
