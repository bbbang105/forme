import {beforeEach, describe, expect, it, vi} from 'vitest';

// --- Mocks ---

// Swap updateSession to a configurable stub that returns {user, supabaseResponse}.
const updateSessionMock = vi.fn();

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: updateSessionMock,
}));

// NextResponse redirects call .cookies / pick the same session headers;
// we let the real next/server implementation handle that.
import {NextResponse} from 'next/server';

type ClonableURL = URL & {clone: () => ClonableURL};

type FakeRequest = {
  nextUrl: ClonableURL;
  cookies: {getAll: () => unknown[]; set: () => void};
  headers: Headers;
};

function makeRequest(pathname: string): FakeRequest {
  const base = new URL(`http://localhost${pathname}`);
  const clone = (): ClonableURL => {
    const next = new URL(base.toString()) as ClonableURL;
    next.clone = clone;
    return next;
  };
  const url = base as ClonableURL;
  url.clone = clone;
  return {
    nextUrl: url,
    cookies: {getAll: () => [], set: () => {}},
    headers: new Headers(),
  };
}

describe('proxy middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects unauthenticated request on a protected path to /login', async () => {
    updateSessionMock.mockResolvedValue({
      user: null,
      supabaseResponse: NextResponse.next(),
    });
    const {proxy} = await import('@/proxy');
    const res = await proxy(makeRequest('/notes') as never);
    // NextResponse.redirect sets status 307/308 and Location header
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('lets unauthenticated requests through on public paths (/login, /auth/callback, /api/cron/*)', async () => {
    const sessionResponse = NextResponse.next();
    updateSessionMock.mockResolvedValue({
      user: null,
      supabaseResponse: sessionResponse,
    });
    const {proxy} = await import('@/proxy');

    const paths = ['/login', '/auth/callback?code=xyz', '/api/cron/feed'];
    for (const p of paths) {
      const res = await proxy(makeRequest(p) as never);
      // Not a redirect — passes through with original supabase response.
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('redirects authenticated user on /login → /dashboard', async () => {
    updateSessionMock.mockResolvedValue({
      user: {id: 'user-1'},
      supabaseResponse: NextResponse.next(),
    });
    const {proxy} = await import('@/proxy');
    const res = await proxy(makeRequest('/login') as never);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toContain('/dashboard');
  });

  it('lets authenticated user through on a normal protected path', async () => {
    const sessionResponse = NextResponse.next();
    updateSessionMock.mockResolvedValue({
      user: {id: 'user-1'},
      supabaseResponse: sessionResponse,
    });
    const {proxy} = await import('@/proxy');
    const res = await proxy(makeRequest('/calendar') as never);
    // No redirect (no Location header, not a 3xx)
    expect(res.headers.get('location')).toBeNull();
  });
});
