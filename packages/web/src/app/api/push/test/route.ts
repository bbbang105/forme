import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {sendPushToUser} from '@/lib/push';
import {withTracing} from '@/lib/logger';

/**
 * In-memory rate-limit per user for push test endpoint.
 *
 * - 1 call per 60 seconds per userId.
 * - Serverless cold start resets the map; good enough to deter abuse
 *   without adding a Redis dependency for a diagnostic endpoint.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const lastCalledByUser = new Map<string, number>();

/** @internal — exposed for tests to reset state between cases */
export function __resetPushTestRateLimit() {
  lastCalledByUser.clear();
}

/**
 * POST /api/push/test — 테스트 푸시 알림 발송
 */
export const POST = withTracing('POST /api/push/test', async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit: one call per minute per user
  const now = Date.now();
  const last = lastCalledByUser.get(user.id);
  if (last !== undefined && now - last < RATE_LIMIT_WINDOW_MS) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  lastCalledByUser.set(user.id, now);

  try {
    const result = await sendPushToUser(user.id, {
      title: 'forme 테스트 알림',
      body: '푸시 알림이 정상적으로 작동합니다!',
      tag: 'test',
      url: '/dashboard',
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/push/test]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
