import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {bookmarkCollections, feedItems, feedSources, db} from '@forme/shared';
import {and, eq, isNull} from 'drizzle-orm';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';
import {ITEM_MEMO_MAX_LENGTH} from '@/lib/constants';

// ── Types ──

interface PatchBody {
  isRead?: boolean;
  isBookmarked?: boolean;
  memo?: string | null;
  collectionId?: string | null;
}

/**
 * DELETE /api/feed/[id]
 *
 * Deletes a single feed item.
 * Ownership is verified by joining through feed_sources.user_id.
 */
export const DELETE = withTracing('DELETE /api/feed/[id]', async (_request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json(
      { error: 'Invalid item id: must be a UUID' },
      { status: 400 }
    );
  }

  try {
    const [existing] = await db
      .select({ id: feedItems.id })
      .from(feedItems)
      .innerJoin(
        feedSources,
        eq(feedItems.sourceId, feedSources.id)
      )
      .where(
        and(
          eq(feedItems.id, id),
          eq(feedSources.userId, user.id),
          isNull(feedItems.deletedAt)
        )
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    await db.update(feedItems).set({ deletedAt: new Date() }).where(eq(feedItems.id, id));

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(`[DELETE /api/feed/${id}]`, err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/feed/[id]
 *
 * Updates read/bookmark status on a single feed item.
 * Ownership is verified by joining through feed_sources.user_id.
 *
 * Body: { isRead?: boolean, isBookmarked?: boolean }
 *
 * Response: updated item
 */
export const PATCH = withTracing('PATCH /api/feed/[id]', async (request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  // ── Auth ──
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Validate route param ──
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json(
      { error: 'Invalid item id: must be a UUID' },
      { status: 400 }
    );
  }

  // ── Parse body ──
  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { isRead, isBookmarked, memo, collectionId } = body;

  // At least one field must be provided
  if (isRead === undefined && isBookmarked === undefined && memo === undefined && collectionId === undefined) {
    return NextResponse.json(
      { error: 'At least one field must be provided' },
      { status: 400 }
    );
  }

  // Type-check provided fields
  if (isRead !== undefined && typeof isRead !== 'boolean') {
    return NextResponse.json(
      { error: 'isRead must be a boolean' },
      { status: 400 }
    );
  }

  if (isBookmarked !== undefined && typeof isBookmarked !== 'boolean') {
    return NextResponse.json(
      { error: 'isBookmarked must be a boolean' },
      { status: 400 }
    );
  }

  if (memo !== undefined && memo !== null && typeof memo !== 'string') {
    return NextResponse.json(
      { error: 'memo must be a string or null' },
      { status: 400 }
    );
  }

  if (collectionId !== undefined && collectionId !== null && (typeof collectionId !== 'string' || !UUID_REGEX.test(collectionId))) {
    return NextResponse.json(
      { error: 'collectionId must be a valid UUID or null' },
      { status: 400 }
    );
  }

  try {
    // ── Verify ownership ──
    // feed_items has no user_id directly; ownership flows through feed_sources
    const [existing] = await db
      .select({
        id: feedItems.id,
        sourceUserId: feedSources.userId,
      })
      .from(feedItems)
      .innerJoin(
        feedSources,
        eq(feedItems.sourceId, feedSources.id)
      )
      .where(
        and(
          eq(feedItems.id, id),
          eq(feedSources.userId, user.id),
          isNull(feedItems.deletedAt)
        )
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // ── Build update payload (only provided fields) ──
    const updateValues: Partial<{
      isRead: boolean;
      isBookmarked: boolean;
      readAt: Date | null;
      memo: string | null;
      collectionId: string | null;
    }> = {};

    if (isRead !== undefined) {
      updateValues.isRead = isRead;
      updateValues.readAt = isRead ? new Date() : null;
    }
    if (isBookmarked !== undefined) updateValues.isBookmarked = isBookmarked;
    if (memo !== undefined) {
      updateValues.memo = memo ? memo.slice(0, ITEM_MEMO_MAX_LENGTH) : null;
      // 메모 추가 시 자동 북마크 (단, 명시적 isBookmarked 지정 시 덮어쓰지 않음)
      if (memo && isBookmarked === undefined) updateValues.isBookmarked = true;
    }
    if (collectionId !== undefined) {
      // 컬렉션 소유권 검증
      if (collectionId !== null) {
        const [col] = await db.select({ id: bookmarkCollections.id })
          .from(bookmarkCollections)
          .where(and(eq(bookmarkCollections.id, collectionId), eq(bookmarkCollections.userId, user.id)))
          .limit(1);
        if (!col) {
          return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
        }
      }
      updateValues.collectionId = collectionId;
      // 컬렉션 지정 시 자동 북마크
      if (collectionId !== null) updateValues.isBookmarked = true;
    }

    // ── Update ──
    const [updated] = await db
      .update(feedItems)
      .set(updateValues)
      .where(eq(feedItems.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Update failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: updated.id,
      sourceId: updated.sourceId,
      title: updated.title,
      url: updated.url,
      description: updated.description ?? null,
      thumbnailUrl: updated.thumbnailUrl ?? null,
      publishedAt: updated.publishedAt?.toISOString() ?? null,
      category: updated.category,
      tags: updated.tags ?? null,
      isRead: updated.isRead,
      isBookmarked: updated.isBookmarked,
      collectedAt: updated.collectedAt.toISOString(),
      memo: updated.memo ?? null,
      collectionId: updated.collectionId ?? null,
    });
  } catch (err) {
    console.error(`[PATCH /api/feed/${id}]`, err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
