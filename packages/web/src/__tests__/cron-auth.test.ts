import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// Prevent shared db from needing DATABASE_URL at import time.
vi.mock('@forme/shared', () => ({
  db: new Proxy({}, {get: () => () => undefined}),
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
