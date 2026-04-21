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

// Proxy DB — supports a queue of awaited values so we can stage ownership
// lookup + update side-effects in order.
const {mockDb} = vi.hoisted(() => {
  const _queue: unknown[] = [];
  const _calls: Record<string, unknown[][]> = {};

  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') {
        // Pop one value per await chain; default to [] once the queue drains.
        const v = _queue.length > 0 ? _queue.shift() : [];
        return (resolve: (v: unknown) => void) => Promise.resolve(v).then(resolve);
      }
      if (prop === '_enqueue') return (v: unknown) => _queue.push(v);
      if (prop === '_getCalls') return (n: string) => _calls[n] ?? [];
      if (prop === '_reset') {
        return () => {
          _queue.length = 0;
          for (const k of Object.keys(_calls)) delete _calls[k];
        };
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
  feedItems: {
    id: 'id', sourceId: 'source_id', isRead: 'is_read',
    readAt: 'read_at', deletedAt: 'deleted_at',
  },
  feedSources: {
    id: 'id', userId: 'user_id',
  },
  youtubeItems: {
    id: 'id', userId: 'user_id', isRead: 'is_read', readAt: 'read_at',
  },
}));

function setMockUser(id: string | null) {
  _mockUser = id ? {id} : null;
}

function enqueue(v: unknown) {
  (mockDb as Record<string, (v: unknown) => void>)._enqueue(v);
}

function resetDb() {
  (mockDb as Record<string, () => void>)._reset();
}

function makeRequest(body: unknown, path: string, jsonError?: Error) {
  return {
    url: `http://localhost${path}`,
    method: 'POST',
    json: async () => {
      if (jsonError) throw jsonError;
      return body;
    },
  };
}

const VALID_UUID_1 = '11111111-1111-1111-1111-111111111111';
const VALID_UUID_2 = '22222222-2222-2222-2222-222222222222';
const VALID_UUID_3 = '33333333-3333-3333-3333-333333333333';

// ─── /api/feed/bulk-delete ───────────────────────────────────────────────
describe('POST /api/feed/bulk-delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    setMockUser(null);
  });

  it('returns 401 when not authenticated', async () => {
    const {POST} = await import('@/app/api/feed/bulk-delete/route');
    const res = await POST(
      makeRequest({ids: [VALID_UUID_1]}, '/api/feed/bulk-delete') as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when body is not valid JSON', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/feed/bulk-delete/route');
    const res = await POST(
      makeRequest(null, '/api/feed/bulk-delete', new Error('bad')) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when ids is not a non-empty array', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/feed/bulk-delete/route');
    const res = await POST(
      makeRequest({ids: []}, '/api/feed/bulk-delete') as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when any id is not a valid UUID', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/feed/bulk-delete/route');
    const res = await POST(
      makeRequest({ids: [VALID_UUID_1, 'not-a-uuid']}, '/api/feed/bulk-delete') as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when more than 100 ids', async () => {
    setMockUser('user-1');
    const ids = Array.from({length: 101}, () => VALID_UUID_1);
    const {POST} = await import('@/app/api/feed/bulk-delete/route');
    const res = await POST(
      makeRequest({ids}, '/api/feed/bulk-delete') as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when ownership filter returns zero (other-user isolation)', async () => {
    setMockUser('user-1');
    // First await (ownership select) → no rows owned by user-1
    enqueue([]);
    const {POST} = await import('@/app/api/feed/bulk-delete/route');
    const res = await POST(
      makeRequest({ids: [VALID_UUID_1, VALID_UUID_2]}, '/api/feed/bulk-delete') as never,
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 and reports deleted count when user owns the items', async () => {
    setMockUser('user-1');
    // ownership lookup → two items owned
    enqueue([{id: VALID_UUID_1}, {id: VALID_UUID_2}]);
    // update (set deletedAt) → any
    enqueue([]);
    const {POST} = await import('@/app/api/feed/bulk-delete/route');
    const res = await POST(
      makeRequest(
        {ids: [VALID_UUID_1, VALID_UUID_2, VALID_UUID_3]},
        '/api/feed/bulk-delete',
      ) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(2);
  });
});

// ─── /api/feed/bulk-action ───────────────────────────────────────────────
describe('POST /api/feed/bulk-action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    setMockUser(null);
  });

  it('returns 401 when not authenticated', async () => {
    const {POST} = await import('@/app/api/feed/bulk-action/route');
    const res = await POST(
      makeRequest(
        {ids: [VALID_UUID_1], action: 'mark_unread'},
        '/api/feed/bulk-action',
      ) as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid action name', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/feed/bulk-action/route');
    const res = await POST(
      makeRequest(
        {ids: [VALID_UUID_1], action: 'nuke_everything'},
        '/api/feed/bulk-action',
      ) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid UUID in ids', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/feed/bulk-action/route');
    const res = await POST(
      makeRequest(
        {ids: ['bad-id'], action: 'mark_unread'},
        '/api/feed/bulk-action',
      ) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when user owns none of the ids (cross-user isolation)', async () => {
    setMockUser('user-1');
    enqueue([]); // ownership lookup empty
    const {POST} = await import('@/app/api/feed/bulk-action/route');
    const res = await POST(
      makeRequest(
        {ids: [VALID_UUID_1, VALID_UUID_2], action: 'mark_unread'},
        '/api/feed/bulk-action',
      ) as never,
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 affected=N when user owns items (mark_unread path)', async () => {
    setMockUser('user-1');
    enqueue([{id: VALID_UUID_1}]);
    enqueue([]); // update
    const {POST} = await import('@/app/api/feed/bulk-action/route');
    const res = await POST(
      makeRequest(
        {ids: [VALID_UUID_1, VALID_UUID_2], action: 'mark_unread'},
        '/api/feed/bulk-action',
      ) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.affected).toBe(1);
  });
});

// ─── /api/youtube/bulk-action ────────────────────────────────────────────
describe('POST /api/youtube/bulk-action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    setMockUser(null);
  });

  it('returns 401 when not authenticated', async () => {
    const {POST} = await import('@/app/api/youtube/bulk-action/route');
    const res = await POST(
      makeRequest(
        {itemIds: [VALID_UUID_1], action: 'delete'},
        '/api/youtube/bulk-action',
      ) as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when itemIds is empty', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/youtube/bulk-action/route');
    const res = await POST(
      makeRequest(
        {itemIds: [], action: 'mark_unread'},
        '/api/youtube/bulk-action',
      ) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when any id is not a valid UUID', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/youtube/bulk-action/route');
    const res = await POST(
      makeRequest(
        {itemIds: [VALID_UUID_1, 'nope'], action: 'delete'},
        '/api/youtube/bulk-action',
      ) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid action', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/youtube/bulk-action/route');
    const res = await POST(
      makeRequest(
        {itemIds: [VALID_UUID_1], action: 'drop_all'},
        '/api/youtube/bulk-action',
      ) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when more than 100 itemIds', async () => {
    setMockUser('user-1');
    const itemIds = Array.from({length: 101}, () => VALID_UUID_1);
    const {POST} = await import('@/app/api/youtube/bulk-action/route');
    const res = await POST(
      makeRequest(
        {itemIds, action: 'delete'},
        '/api/youtube/bulk-action',
      ) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 on valid input — user scoping via WHERE (userId = user.id)', async () => {
    setMockUser('user-1');
    // youtube uses single UPDATE/DELETE with WHERE user_id=user.id — no separate
    // ownership lookup. Just ensure the update chain resolves.
    enqueue([]);
    const {POST} = await import('@/app/api/youtube/bulk-action/route');
    const res = await POST(
      makeRequest(
        {itemIds: [VALID_UUID_1, VALID_UUID_2], action: 'mark_unread'},
        '/api/youtube/bulk-action',
      ) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
