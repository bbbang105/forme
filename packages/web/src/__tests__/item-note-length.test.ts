import {beforeEach, describe, expect, it, vi} from 'vitest';

import {ITEM_NOTE_MAX_LENGTH} from '@/lib/constants';

/**
 * Regression: PATCH /api/youtube/[id] and PATCH /api/feed/[id] must NOT
 * silently truncate oversize notes. They should reject with 400 so the
 * client is never misled by "save succeeded" while the server actually
 * discarded the tail of the note.
 */

// --- Shared mocks ---

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
  // Sequential queue: callers .enqueue() the results expected per await.
  const _resolveQueue: unknown[] = [];

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        const v = _resolveQueue.shift() ?? [];
        return (resolve: (v: unknown) => void) => Promise.resolve(v).then(resolve);
      }
      if (prop === '_enqueue') {
        return (v: unknown) => _resolveQueue.push(v);
      }
      if (prop === '_reset') {
        return () => {
          _resolveQueue.length = 0;
        };
      }
      return vi.fn().mockImplementation(() => new Proxy({}, handler));
    },
  };

  return {mockDb: new Proxy({}, handler) as Record<string, unknown>};
});

vi.mock('@forme/shared', () => ({
  db: mockDb,
  youtubeItems: {
    id: 'id',
    userId: 'user_id',
    pinnedAt: 'pinned_at',
  },
  feedItems: {
    id: 'id',
    sourceId: 'source_id',
    pinnedAt: 'pinned_at',
    deletedAt: 'deleted_at',
  },
  feedSources: {
    id: 'id',
    userId: 'user_id',
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

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function makePatchRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/youtube/[id] — note length', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
  });

  it('rejects with 400 when note exceeds ITEM_NOTE_MAX_LENGTH', async () => {
    setMockUser('user-1');
    const {PATCH} = await import('@/app/api/youtube/[id]/route');
    const req = makePatchRequest('http://localhost/api/youtube/x', {
      note: 'a'.repeat(ITEM_NOTE_MAX_LENGTH + 1),
    });
    const res = await PATCH(req, {params: Promise.resolve({id: VALID_UUID})} as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain(String(ITEM_NOTE_MAX_LENGTH));
  });

  it('accepts a note exactly at the max length', async () => {
    setMockUser('user-1');
    // (1) ownership lookup
    enqueue([{id: VALID_UUID, currentPinnedAt: null}]);
    // (2) update .returning()
    enqueue([{id: VALID_UUID, note: 'x'}]);

    const {PATCH} = await import('@/app/api/youtube/[id]/route');
    const req = makePatchRequest('http://localhost/api/youtube/x', {
      note: 'a'.repeat(ITEM_NOTE_MAX_LENGTH),
    });
    const res = await PATCH(req, {params: Promise.resolve({id: VALID_UUID})} as never);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/feed/[id] — note length', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
  });

  it('rejects with 400 when note exceeds ITEM_NOTE_MAX_LENGTH', async () => {
    setMockUser('user-1');
    const {PATCH} = await import('@/app/api/feed/[id]/route');
    const req = makePatchRequest('http://localhost/api/feed/x', {
      note: 'a'.repeat(ITEM_NOTE_MAX_LENGTH + 1),
    });
    const res = await PATCH(req, {params: Promise.resolve({id: VALID_UUID})} as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain(String(ITEM_NOTE_MAX_LENGTH));
  });

  it('accepts a note at the max length', async () => {
    setMockUser('user-1');
    // (1) ownership lookup
    enqueue([{id: VALID_UUID, currentPinnedAt: null}]);
    // (2) update .returning()
    enqueue([
      {
        id: VALID_UUID,
        sourceId: 'src',
        title: 't',
        url: 'http://x',
        description: null,
        thumbnailUrl: null,
        publishedAt: null,
        category: 'ai',
        tags: null,
        isRead: false,
        isBookmarked: true,
        collectedAt: new Date(),
        note: 'a'.repeat(ITEM_NOTE_MAX_LENGTH),
        pinnedAt: null,
      },
    ]);

    const {PATCH} = await import('@/app/api/feed/[id]/route');
    const req = makePatchRequest('http://localhost/api/feed/x', {
      note: 'a'.repeat(ITEM_NOTE_MAX_LENGTH),
    });
    const res = await PATCH(req, {params: Promise.resolve({id: VALID_UUID})} as never);
    expect(res.status).toBe(200);
  });
});
