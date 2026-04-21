import {beforeEach, describe, expect, it, vi} from 'vitest';

// --- Mocks ---

type Identity = {
  provider: string;
  id: string;
  identity_data?: Record<string, unknown>;
};

let _mockUser: {id: string; identities?: Identity[]; email?: string} | null = null;

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
  // Sequence of values returned by each awaited chain; used to simulate:
  //   (1) profile lookup  → []
  //   (2) insert .returning() → [{created profile}]
  const _resolveQueue: unknown[] = [];
  const _calls: Record<string, unknown[][]> = {};

  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') {
        const v = _resolveQueue.shift() ?? [];
        return (r: (v: unknown) => void) => Promise.resolve(v).then(r);
      }
      if (prop === '_enqueue') return (v: unknown) => _resolveQueue.push(v);
      if (prop === '_getCalls') return (n: string) => _calls[n] ?? [];
      if (prop === '_reset') {
        return () => {
          _resolveQueue.length = 0;
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
  profiles: {userId: 'user_id', discordId: 'discord_id', discordUsername: 'discord_username'},
}));

function setMockUser(user: typeof _mockUser) {
  _mockUser = user;
}

function enqueue(v: unknown) {
  (mockDb as Record<string, (v: unknown) => void>)._enqueue(v);
}

function getDbCalls(name: string): unknown[][] {
  return (mockDb as Record<string, (n: string) => unknown[][]>)._getCalls(name);
}

function resetDb() {
  (mockDb as Record<string, () => void>)._reset();
}

function makeRequest() {
  return {url: 'http://localhost/api/profile', method: 'GET'};
}

describe('GET /api/profile — Discord identity clamp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    setMockUser(null);
  });

  it('returns 401 when not authenticated', async () => {
    const {GET} = await import('@/app/api/profile/route');
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(401);
  });

  it('clamps discordUsername to 255 chars when creating new profile', async () => {
    setMockUser({
      id: 'user-1',
      identities: [
        {
          provider: 'discord',
          id: 'did',
          identity_data: {full_name: 'a'.repeat(600), avatar_url: 'https://cdn.discordapp.com/x.png'},
        },
      ],
    });
    // (1) existing profile lookup: not found
    enqueue([]);
    // (2) insert .returning(): created row
    enqueue([{userId: 'user-1', discordUsername: 'a'.repeat(255)}]);
    const {GET} = await import('@/app/api/profile/route');
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(201);

    // Verify insert was called with clamped username + valid avatar url
    const valuesCalls = getDbCalls('values');
    const payload = valuesCalls[0]?.[0] as {
      discordUsername: string;
      displayName: string;
      avatarUrl: string | null;
    };
    expect(payload.discordUsername).toBe('a'.repeat(255));
    expect(payload.displayName).toBe('a'.repeat(255));
    expect(payload.avatarUrl).toBe('https://cdn.discordapp.com/x.png');
  });

  it('drops non-https avatar URL (null-safe)', async () => {
    setMockUser({
      id: 'user-2',
      identities: [
        {
          provider: 'discord',
          id: 'did',
          identity_data: {name: 'hank', avatar_url: 'http://evil.example.com/pic.png'},
        },
      ],
    });
    enqueue([]);
    enqueue([{userId: 'user-2'}]);
    const {GET} = await import('@/app/api/profile/route');
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(201);

    const payload = getDbCalls('values')[0]?.[0] as {avatarUrl: string | null};
    expect(payload.avatarUrl).toBeNull();
  });

  it('drops malformed avatar URL', async () => {
    setMockUser({
      id: 'user-3',
      identities: [
        {
          provider: 'discord',
          id: 'did',
          identity_data: {name: 'hank', avatar_url: 'not a url'},
        },
      ],
    });
    enqueue([]);
    enqueue([{userId: 'user-3'}]);
    const {GET} = await import('@/app/api/profile/route');
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(201);

    const payload = getDbCalls('values')[0]?.[0] as {avatarUrl: string | null};
    expect(payload.avatarUrl).toBeNull();
  });

  it('drops avatar URL >= 500 chars', async () => {
    const tooLong = 'https://cdn.discordapp.com/' + 'a'.repeat(500);
    setMockUser({
      id: 'user-4',
      identities: [
        {
          provider: 'discord',
          id: 'did',
          identity_data: {name: 'hank', avatar_url: tooLong},
        },
      ],
    });
    enqueue([]);
    enqueue([{userId: 'user-4'}]);
    const {GET} = await import('@/app/api/profile/route');
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(201);

    const payload = getDbCalls('values')[0]?.[0] as {avatarUrl: string | null};
    expect(payload.avatarUrl).toBeNull();
  });

  it('returns existing profile without inserting', async () => {
    setMockUser({id: 'user-5'});
    enqueue([{userId: 'user-5', discordUsername: 'hank'}]);
    const {GET} = await import('@/app/api/profile/route');
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);
    // Insert should NOT have been called
    expect(getDbCalls('values').length).toBe(0);
  });
});
