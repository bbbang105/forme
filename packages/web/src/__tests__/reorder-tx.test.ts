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

// Track transaction invocations. `db.transaction(fn)` should be called and
// the callback receives a `tx` that behaves like a proxy db.
const {mockDb, txSpy} = vi.hoisted(() => {
  const txSpy = vi.fn();
  const chainProxy: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') return (r: (v: unknown) => void) => Promise.resolve([]).then(r);
      return vi.fn().mockImplementation(() => new Proxy({}, chainProxy));
    },
  };
  const tx = new Proxy({}, chainProxy);
  const db = {
    transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      txSpy();
      return fn(tx);
    }),
    update: vi.fn().mockImplementation(() => new Proxy({}, chainProxy)),
  };
  return {mockDb: db, txSpy};
});

vi.mock('@forme/shared', () => ({
  db: mockDb,
  feedSources: {id: 'id', userId: 'user_id', favoriteOrder: 'favorite_order'},
  youtubeSources: {id: 'id', userId: 'user_id', favoriteOrder: 'favorite_order'},
}));

function setMockUser(id: string | null) {
  _mockUser = id ? {id} : null;
}

function makeRequest(body: unknown) {
  return {
    url: 'http://localhost/api/feed/sources/reorder',
    method: 'PUT',
    json: async () => body,
  };
}

describe('PUT /api/feed/sources/reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txSpy.mockClear();
    setMockUser(null);
  });

  it('returns 401 when not authenticated', async () => {
    const {PUT} = await import('@/app/api/feed/sources/reorder/route');
    const res = await PUT(makeRequest({items: []}) as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 for non-array items', async () => {
    setMockUser('user-1');
    const {PUT} = await import('@/app/api/feed/sources/reorder/route');
    const res = await PUT(makeRequest({items: 'nope'}) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid UUID in items', async () => {
    setMockUser('user-1');
    const {PUT} = await import('@/app/api/feed/sources/reorder/route');
    const res = await PUT(
      makeRequest({items: [{id: 'not-a-uuid', favoriteOrder: 0}]}) as never,
    );
    expect(res.status).toBe(400);
  });

  it('wraps updates in a DB transaction on success', async () => {
    setMockUser('user-1');
    const validId = '550e8400-e29b-41d4-a716-446655440000';
    const {PUT} = await import('@/app/api/feed/sources/reorder/route');
    const res = await PUT(
      makeRequest({items: [{id: validId, favoriteOrder: 0}]}) as never,
    );
    expect(res.status).toBe(200);
    expect(txSpy).toHaveBeenCalledTimes(1);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/youtube/sources/reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txSpy.mockClear();
    setMockUser(null);
  });

  it('returns 401 when not authenticated', async () => {
    const {PUT} = await import('@/app/api/youtube/sources/reorder/route');
    const res = await PUT(makeRequest({items: []}) as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid favoriteOrder type', async () => {
    setMockUser('user-1');
    const validId = '550e8400-e29b-41d4-a716-446655440000';
    const {PUT} = await import('@/app/api/youtube/sources/reorder/route');
    const res = await PUT(
      makeRequest({items: [{id: validId, favoriteOrder: 'bad'}]}) as never,
    );
    expect(res.status).toBe(400);
  });

  it('wraps updates in a DB transaction on success', async () => {
    setMockUser('user-1');
    const validId = '550e8400-e29b-41d4-a716-446655440000';
    const {PUT} = await import('@/app/api/youtube/sources/reorder/route');
    const res = await PUT(
      makeRequest({items: [{id: validId, favoriteOrder: 3}]}) as never,
    );
    expect(res.status).toBe(200);
    expect(txSpy).toHaveBeenCalledTimes(1);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });
});
