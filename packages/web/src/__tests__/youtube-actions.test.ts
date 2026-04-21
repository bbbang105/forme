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
  let _resolveValue: unknown = [];
  const _calls: Record<string, unknown[][]> = {};

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) =>
          Promise.resolve(_resolveValue).then(resolve);
      }
      if (prop === '_setResolve') {
        return (v: unknown) => {
          _resolveValue = v;
        };
      }
      if (prop === '_getCalls') {
        return (name: string) => _calls[name] ?? [];
      }
      if (prop === '_resetCalls') {
        return () => {
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
  youtubeItems: {
    id: 'id',
    userId: 'user_id',
    title: 'title',
    channelName: 'channel_name',
    thumbnailUrl: 'thumbnail_url',
    status: 'status',
    summarizedAt: 'summarized_at',
  },
}));

function setMockUser(id: string | null) {
  _mockUser = id ? {id} : null;
}

function setDbResolve(value: unknown) {
  (mockDb as Record<string, (v: unknown) => void>)._setResolve(value);
}

function getDbCalls(name: string): unknown[][] {
  return (mockDb as Record<string, (n: string) => unknown[][]>)._getCalls(name);
}

function resetDbCalls() {
  (mockDb as Record<string, () => void>)._resetCalls();
}

describe('YouTube Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbCalls();
    setDbResolve([]);
  });

  describe('getRecentYoutubeItems', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const {getRecentYoutubeItems} = await import('@/lib/actions/youtube');
      await expect(getRecentYoutubeItems()).rejects.toThrow('Unauthorized');
    });

    it('should clamp limit to max 20', async () => {
      setMockUser('user-123');
      setDbResolve([]);
      const {getRecentYoutubeItems} = await import('@/lib/actions/youtube');
      const result = await getRecentYoutubeItems(500);
      expect(result).toBeDefined();
      // Verify that limit() was invoked with the clamped value (20)
      const limitCalls = getDbCalls('limit');
      expect(limitCalls.length).toBeGreaterThan(0);
      expect(limitCalls[limitCalls.length - 1]?.[0]).toBe(20);
    });

    it('should issue DB select for authenticated user', async () => {
      setMockUser('user-123');
      setDbResolve([
        {
          id: 'v1',
          title: 'Hello',
          channelName: 'Ch',
          thumbnailUrl: 'https://example.com/thumb.jpg',
        },
      ]);
      const {getRecentYoutubeItems} = await import('@/lib/actions/youtube');
      const result = await getRecentYoutubeItems(5);
      expect(Array.isArray(result)).toBe(true);
      // Verify select + from(youtubeItems) were called
      expect(getDbCalls('select').length).toBeGreaterThan(0);
      expect(getDbCalls('from').length).toBeGreaterThan(0);
      expect(getDbCalls('limit').length).toBeGreaterThan(0);
      // Explicit limit used
      const limitCalls = getDbCalls('limit');
      expect(limitCalls[limitCalls.length - 1]?.[0]).toBe(5);
    });
  });
});
