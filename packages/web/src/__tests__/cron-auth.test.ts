import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// getAllUserIds calls db.select().from().limit() and awaits the chain.
// We need a Proxy mock that can return arrays when awaited so the real
// implementation can iterate the result.
const {mockDb} = vi.hoisted(() => {
  let _resolveValue: unknown = [];

  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) =>
          Promise.resolve(_resolveValue).then(resolve);
      }
      if (prop === '_setResolve') {
        return (v: unknown) => { _resolveValue = v; };
      }
      return vi.fn().mockImplementation(() => new Proxy({}, handler));
    },
  };
  return {mockDb: new Proxy({}, handler) as Record<string, unknown>};
});

function setDbResolve(value: unknown) {
  (mockDb as Record<string, (v: unknown) => void>)._setResolve(value);
}

vi.mock('@forme/shared', () => ({
  db: mockDb,
  profiles: {userId: 'user_id'},
}));

const originalSecret = process.env.CRON_SECRET;

describe('cron-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it('safeCompare returns true for identical strings, false for different', async () => {
    const {safeCompare} = await import('@/lib/cron-auth');
    expect(safeCompare('abcdef', 'abcdef')).toBe(true);
    expect(safeCompare('abcdef', 'abcdeX')).toBe(false);
    // Length mismatch still false (and constant time internally)
    expect(safeCompare('abcdef', 'abcdefg')).toBe(false);
    expect(safeCompare('', '')).toBe(true);
  });

  it('verifyCronSecret returns 401 when env secret is missing', async () => {
    delete process.env.CRON_SECRET;
    const {verifyCronSecret} = await import('@/lib/cron-auth');
    const req = new Request('http://localhost/api/cron/test', {
      headers: {authorization: 'Bearer anything'},
    });
    const result = verifyCronSecret(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('verifyCronSecret returns 401 on wrong secret', async () => {
    process.env.CRON_SECRET = 'x'.repeat(40);
    const {verifyCronSecret} = await import('@/lib/cron-auth');
    const req = new Request('http://localhost/api/cron/test', {
      headers: {authorization: 'Bearer wrong'},
    });
    const result = verifyCronSecret(req);
    expect(result.ok).toBe(false);
  });

  it('verifyCronSecret returns ok on matching secret', async () => {
    const secret = 'a'.repeat(40);
    process.env.CRON_SECRET = secret;
    const {verifyCronSecret} = await import('@/lib/cron-auth');
    const req = new Request('http://localhost/api/cron/test', {
      headers: {authorization: `Bearer ${secret}`},
    });
    const result = verifyCronSecret(req);
    expect(result.ok).toBe(true);
  });

  it('warns once when CRON_SECRET is shorter than the minimum', async () => {
    process.env.CRON_SECRET = 'short';
    const {verifyCronSecret, _resetWeakSecretWarning} = await import('@/lib/cron-auth');
    _resetWeakSecretWarning();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const req = new Request('http://localhost/', {
      headers: {authorization: 'Bearer short'},
    });
    // Call twice — warning should fire exactly once (warn-once semantics).
    verifyCronSecret(req);
    verifyCronSecret(req);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toMatch(/CRON_SECRET is shorter/);

    warnSpy.mockRestore();
  });

  it('does not warn when CRON_SECRET meets the minimum length', async () => {
    process.env.CRON_SECRET = 'a'.repeat(64);
    const {verifyCronSecret, _resetWeakSecretWarning} = await import('@/lib/cron-auth');
    _resetWeakSecretWarning();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const req = new Request('http://localhost/', {
      headers: {authorization: `Bearer ${'a'.repeat(64)}`},
    });
    verifyCronSecret(req);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('cron-auth — getAllUserIds cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Module-scoped cache in cron-auth — reset modules so every test starts
    // with an empty cache.
    vi.resetModules();
  });

  it('queries db on first call and returns user ids', async () => {
    setDbResolve([
      {userId: '11111111-1111-1111-1111-111111111111'},
      {userId: '22222222-2222-2222-2222-222222222222'},
    ]);
    const {getAllUserIds} = await import('@/lib/cron-auth');
    const ids = await getAllUserIds();
    expect(ids).toEqual([
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ]);
  });

  it('caches result within TTL — second call does not hit db (value stays stable)', async () => {
    setDbResolve([{userId: 'cached-id-1'}]);
    const {getAllUserIds} = await import('@/lib/cron-auth');
    const first = await getAllUserIds();

    // Swap DB return value; cache should shield us.
    setDbResolve([{userId: 'new-value-must-not-appear'}]);
    const second = await getAllUserIds();
    expect(second).toEqual(first);
    expect(second).toEqual(['cached-id-1']);
  });

  it('re-queries db after TTL expiration (5 min)', async () => {
    vi.useFakeTimers();
    try {
      setDbResolve([{userId: 'first-batch'}]);
      const {getAllUserIds} = await import('@/lib/cron-auth');
      const first = await getAllUserIds();
      expect(first).toEqual(['first-batch']);

      // Advance 5 min + 1s past TTL
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

      setDbResolve([{userId: 'second-batch'}]);
      const second = await getAllUserIds();
      expect(second).toEqual(['second-batch']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('respects 100-row db cap (implementation uses .limit(100))', async () => {
    // Simulate DB already honoring .limit(100): return exactly 100 ids.
    const ids = Array.from({length: 100}, (_, i) =>
      `${(i + 1).toString().padStart(8, '0')}-0000-0000-0000-000000000000`,
    );
    setDbResolve(ids.map((userId) => ({userId})));
    const {getAllUserIds} = await import('@/lib/cron-auth');
    const result = await getAllUserIds();
    expect(result.length).toBe(100);
    expect(result[0]).toBe(ids[0]);
    expect(result[99]).toBe(ids[99]);
  });
});
