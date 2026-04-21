import {beforeEach, describe, expect, it, vi} from 'vitest';

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

vi.mock('@/lib/push', () => ({
  sendPushToUser: vi.fn().mockResolvedValue({sent: 1, failed: 0}),
}));

function setUser(id: string | null) {
  _mockUser = id ? {id} : null;
}

function makeReq() {
  return {url: 'http://localhost/api/push/test', method: 'POST'};
}

describe('POST /api/push/test rate limit', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    const mod = await import('@/app/api/push/test/route');
    mod.__resetPushTestRateLimit();
    setUser(null);
  });

  it('returns 401 when not authenticated', async () => {
    const {POST} = await import('@/app/api/push/test/route');
    const res = await POST(makeReq() as never);
    expect(res.status).toBe(401);
  });

  it('first call succeeds (200), second call within 60s returns 429', async () => {
    setUser('user-rl-1');
    const {POST} = await import('@/app/api/push/test/route');

    const first = await POST(makeReq() as never);
    expect(first.status).toBe(200);

    const second = await POST(makeReq() as never);
    expect(second.status).toBe(429);
    const body = await second.json();
    expect(body.error).toBe('Too many requests');
  });

  it('call succeeds again after 60s window elapses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T12:00:00Z'));

    setUser('user-rl-2');
    const {POST} = await import('@/app/api/push/test/route');

    const first = await POST(makeReq() as never);
    expect(first.status).toBe(200);

    // Within window → 429
    vi.setSystemTime(new Date('2026-04-21T12:00:30Z'));
    const blocked = await POST(makeReq() as never);
    expect(blocked.status).toBe(429);

    // Past 60s → 200 again
    vi.setSystemTime(new Date('2026-04-21T12:01:01Z'));
    const third = await POST(makeReq() as never);
    expect(third.status).toBe(200);

    vi.useRealTimers();
  });

  it('rate limit is per-user (different users independent)', async () => {
    const {POST} = await import('@/app/api/push/test/route');

    setUser('user-a');
    const a = await POST(makeReq() as never);
    expect(a.status).toBe(200);

    setUser('user-b');
    const b = await POST(makeReq() as never);
    expect(b.status).toBe(200);
  });
});
