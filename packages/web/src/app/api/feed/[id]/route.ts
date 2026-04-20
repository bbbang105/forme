import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {feedItems, feedSources, db} from '@forme/shared';
import {and, count, eq, isNotNull, isNull, ne} from 'drizzle-orm';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';
import {ITEM_MEMO_MAX_LENGTH} from '@/lib/constants';

/** Max items a user can pin to the top of the Saved view. */
const MAX_PINNED = 3;

// ── Types ──

interface PatchBody {
  isRead?: boolean;
  isBookmarked?: boolean;
  memo?: string | null;
  /** When `true`, sets `pinned_at = now()`. When `false`, clears it. Enforces MAX_PINNED. */
  pinned?: boolean;
}

/**
 * DELETE /api/feed/[id]
 *
 * Soft-deletes a single feed item (sets deletedAt). Ownership through feed_sources.user_id.
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
      .innerJoin(feedSources, eq(feedItems.sourceId, feedSources.id))
      .where(
        and(
          eq(feedItems.id, id),
          eq(feedSources.userId, user.id),
          isNull(feedItems.deletedAt),
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * PATCH /api/feed/[id]
 *
 * Updates read / bookmark / memo / pinned on a single feed item.
 * Ownership verified by joining through feed_sources.user_id.
 *
 * Body: { isRead?, isBookmarked?, memo?, pinned? }
 */
export const PATCH = withTracing('PATCH /api/feed/[id]', async (request, ctx) => {
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

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { isRead, isBookmarked, memo, pinned } = body;

  if (isRead === undefined && isBookmarked === undefined && memo === undefined && pinned === undefined) {
    return NextResponse.json(
      { error: 'At least one field must be provided' },
      { status: 400 }
    );
  }

  if (isRead !== undefined && typeof isRead !== 'boolean') {
    return NextResponse.json({ error: 'isRead must be a boolean' }, { status: 400 });
  }
  if (isBookmarked !== undefined && typeof isBookmarked !== 'boolean') {
    return NextResponse.json({ error: 'isBookmarked must be a boolean' }, { status: 400 });
  }
  if (memo !== undefined && memo !== null && typeof memo !== 'string') {
    return NextResponse.json({ error: 'memo must be a string or null' }, { status: 400 });
  }
  if (pinned !== undefined && typeof pinned !== 'boolean') {
    return NextResponse.json({ error: 'pinned must be a boolean' }, { status: 400 });
  }

  try {
    // ── Verify ownership (feed_items flows through feed_sources) ──
    const [existing] = await db
      .select({
        id: feedItems.id,
        currentPinnedAt: feedItems.pinnedAt,
      })
      .from(feedItems)
      .innerJoin(feedSources, eq(feedItems.sourceId, feedSources.id))
      .where(
        and(
          eq(feedItems.id, id),
          eq(feedSources.userId, user.id),
          isNull(feedItems.deletedAt),
        )
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // ── Build update payload ──
    const updateValues: Partial<{
      isRead: boolean;
      isBookmarked: boolean;
      readAt: Date | null;
      memo: string | null;
      pinnedAt: Date | null;
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

    if (pinned !== undefined) {
      if (pinned) {
        // Pinning a not-yet-pinned item → count other currently-pinned items.
        // If already pinned, allow (idempotent, just bumps pinned_at).
        if (!existing.currentPinnedAt) {
          const [{ value }] = await db
            .select({ value: count() })
            .from(feedItems)
            .innerJoin(feedSources, eq(feedItems.sourceId, feedSources.id))
            .where(
              and(
                eq(feedSources.userId, user.id),
                isNotNull(feedItems.pinnedAt),
                isNull(feedItems.deletedAt),
                ne(feedItems.id, id),
              )
            );
          if (value >= MAX_PINNED) {
            return NextResponse.json(
              { error: `Maximum ${MAX_PINNED} pinned items allowed` },
              { status: 409 }
            );
          }
        }
        updateValues.pinnedAt = new Date();
        // Pinning implicitly keeps the item bookmarked.
        if (isBookmarked === undefined) updateValues.isBookmarked = true;
      } else {
        updateValues.pinnedAt = null;
      }
    }

    const [updated] = await db
      .update(feedItems)
      .set(updateValues)
      .where(eq(feedItems.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
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
      pinnedAt: updated.pinnedAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error(`[PATCH /api/feed/${id}]`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
