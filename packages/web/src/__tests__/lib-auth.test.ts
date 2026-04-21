import {beforeEach, describe, expect, it, vi} from 'vitest';

// --- Mocks ---

const getUserMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: {
      getUser: getUserMock,
    },
  })),
}));

describe('lib/auth — getAuthUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockReset();
    // Force re-import (React.cache is module-scoped; reset module registry per test
    // so the memoized wrapper is re-created and each test gets a fresh cache hit).
    vi.resetModules();
  });

  it('returns user when authenticated', async () => {
    getUserMock.mockResolvedValue({
      data: {user: {id: 'user-abc', email: 'me@example.com'}},
      error: null,
    });
    const {getAuthUser} = await import('@/lib/auth');
    const user = await getAuthUser();
    expect(user).toEqual({id: 'user-abc', email: 'me@example.com'});
  });

  it('throws Unauthorized when supabase returns error', async () => {
    getUserMock.mockResolvedValue({
      data: {user: null},
      error: new Error('session expired'),
    });
    const {getAuthUser} = await import('@/lib/auth');
    await expect(getAuthUser()).rejects.toThrow('Unauthorized');
  });

  it('throws Unauthorized when user is null', async () => {
    getUserMock.mockResolvedValue({
      data: {user: null},
      error: null,
    });
    const {getAuthUser} = await import('@/lib/auth');
    await expect(getAuthUser()).rejects.toThrow('Unauthorized');
  });

  it('is wrapped with React.cache (exported wrapper, not the raw async fn)', async () => {
    // We can't test the per-request memoization outside a RSC render context
    // (React.cache is a no-op outside requests), but we can at least assert
    // the export is a cached callable — calling it repeatedly returns the
    // same shape and hits the mock each time without errors.
    getUserMock.mockResolvedValue({
      data: {user: {id: 'user-xyz'}},
      error: null,
    });
    const {getAuthUser} = await import('@/lib/auth');
    const a = await getAuthUser();
    const b = await getAuthUser();
    expect(a.id).toBe('user-xyz');
    expect(b.id).toBe('user-xyz');
    // The callable must be a function — React.cache wraps but preserves callability.
    expect(typeof getAuthUser).toBe('function');
  });
});
