import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {db, profiles} from '@forme/shared';
import {eq} from 'drizzle-orm';
import {withTracing} from '@/lib/logger';

/**
 * GET /api/profile — 현재 프로필 조회
 *
 * 프로필이 없으면 Discord identity에서 기본값으로 자동 생성 (upsert)
 */
export const GET = withTracing('GET /api/profile', async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 기존 프로필 조회
    const [existing] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    if (existing) {
      return NextResponse.json(existing);
    }

    // 프로필 없으면 Discord identity에서 기본값으로 생성
    const identity = user.identities?.find((i) => i.provider === 'discord');
    const discordId = identity?.id ?? '';
    const discordUsername =
      (identity?.identity_data?.full_name as string) ??
      (identity?.identity_data?.name as string) ??
      user.email ??
      'user';
    const avatarUrl = (identity?.identity_data?.avatar_url as string) ?? null;

    const [created] = await db
      .insert(profiles)
      .values({
        userId: user.id,
        discordId,
        discordUsername,
        displayName: discordUsername,
        avatarUrl,
        interests: [],
      })
      .onConflictDoNothing()
      .returning();

    // onConflictDoNothing 이 빈 배열을 반환하면 race condition — 다시 조회
    if (!created) {
      const [reFetched] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, user.id))
        .limit(1);
      if (!reFetched) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      return NextResponse.json(reFetched);
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[GET /api/profile]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
});

/**
 * PUT /api/profile — 프로필 수정 (관심사 포함)
 */
export const PUT = withTracing('PUT /api/profile', async (request) => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { displayName?: string; interests?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { displayName, interests } = body;

  // Validate displayName
  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || displayName.trim().length > 255) {
      return NextResponse.json(
        { error: 'displayName must be 255 characters or fewer' },
        { status: 400 },
      );
    }
  }

  // Validate interests
  if (interests !== undefined) {
    if (!Array.isArray(interests)) {
      return NextResponse.json(
        { error: 'interests must be an array' },
        { status: 400 },
      );
    }
    if (interests.length > 6) {
      return NextResponse.json(
        { error: 'interests must have at most 6 items' },
        { status: 400 },
      );
    }
    if (interests.some((t) => typeof t !== 'string' || t.length > 50)) {
      return NextResponse.json(
        { error: 'Each interest must be a string of 50 characters or fewer' },
        { status: 400 },
      );
    }
  }

  try {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (displayName !== undefined) updateData.displayName = displayName.trim();
    if (interests !== undefined) updateData.interests = interests;

    const [updated] = await db
      .update(profiles)
      .set(updateData)
      .where(eq(profiles.userId, user.id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[PUT /api/profile]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
});
