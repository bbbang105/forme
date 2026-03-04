import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {db, pushSubscriptions} from '@forme/shared';
import {and, eq} from 'drizzle-orm';
import {withTracing} from '@/lib/logger';

/**
 * POST /api/push/subscribe — 푸시 구독 등록/갱신
 */
export const POST = withTracing('POST /api/push/subscribe', async (request) => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { endpoint, keys } = body;

  if (!endpoint || typeof endpoint !== 'string') {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
  }

  // SSRF 방어: endpoint는 반드시 HTTPS push service URL이어야 함
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    return NextResponse.json({ error: 'endpoint must be a valid URL' }, { status: 400 });
  }
  if (parsedEndpoint.protocol !== 'https:') {
    return NextResponse.json({ error: 'endpoint must use HTTPS' }, { status: 400 });
  }

  if (!keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'keys.p256dh and keys.auth are required' }, { status: 400 });
  }
  if (endpoint.length > 2048) {
    return NextResponse.json({ error: 'endpoint too long' }, { status: 400 });
  }
  if (keys.p256dh.length > 256 || keys.auth.length > 128) {
    return NextResponse.json({ error: 'invalid key length' }, { status: 400 });
  }

  try {
    // Upsert: 같은 endpoint면 갱신 (소유자 확인)
    const [existing] = await db
      .select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);

    if (existing) {
      if (existing.userId !== user.id) {
        // 다른 유저의 endpoint — 기존 것 비활성화 후 새로 생성
        await db
          .update(pushSubscriptions)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(pushSubscriptions.id, existing.id));

        const [created] = await db
          .insert(pushSubscriptions)
          .values({
            userId: user.id,
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
          })
          .returning();
        return NextResponse.json({ id: created!.id, isActive: true }, { status: 201 });
      }

      // 같은 유저 — 키 갱신
      await db
        .update(pushSubscriptions)
        .set({
          p256dh: keys.p256dh,
          auth: keys.auth,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(pushSubscriptions.id, existing.id));
      return NextResponse.json({ id: existing.id, isActive: true });
    }

    const [created] = await db
      .insert(pushSubscriptions)
      .values({
        userId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      .returning();

    return NextResponse.json({ id: created!.id, isActive: true }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/push/subscribe]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * DELETE /api/push/subscribe — 푸시 구독 비활성화
 */
export const DELETE = withTracing('DELETE /api/push/subscribe', async (request) => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { endpoint?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.endpoint || typeof body.endpoint !== 'string') {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
  }

  try {
    await db
      .update(pushSubscriptions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(pushSubscriptions.userId, user.id),
          eq(pushSubscriptions.endpoint, body.endpoint),
        )
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/push/subscribe]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * GET /api/push/subscribe — 현재 유저의 구독 상태 확인
 */
export const GET = withTracing('GET /api/push/subscribe', async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const subs = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, user.id),
          eq(pushSubscriptions.isActive, true),
        )
      )
      .limit(1);

    return NextResponse.json({ isSubscribed: subs.length > 0 });
  } catch (err) {
    console.error('[GET /api/push/subscribe]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
