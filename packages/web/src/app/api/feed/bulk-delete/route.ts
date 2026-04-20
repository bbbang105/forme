import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {feedItems, feedSources, db} from '@forme/shared';
import {and, eq, inArray, isNull} from 'drizzle-orm';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';

/**
 * POST /api/feed/bulk-delete
 *
 * Deletes multiple feed items at once.
 * Body: { ids: string[] }
 * Ownership verified via feed_sources.user_id join.
 */
export const POST = withTracing('POST /api/feed/bulk-delete', async (request) => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: 'ids must be a non-empty array' },
      { status: 400 }
    );
  }

  if (ids.length > 100) {
    return NextResponse.json(
      { error: 'Maximum 100 items per request' },
      { status: 400 }
    );
  }

  if (ids.some((id) => !UUID_REGEX.test(id))) {
    return NextResponse.json(
      { error: 'All ids must be valid UUIDs' },
      { status: 400 }
    );
  }

  try {
    // Verify ownership: only delete items belonging to the user's sources
    const ownedItems = await db
      .select({ id: feedItems.id })
      .from(feedItems)
      .innerJoin(
        feedSources,
        eq(feedItems.sourceId, feedSources.id)
      )
      .where(
        and(
          inArray(feedItems.id, ids),
          eq(feedSources.userId, user.id),
          isNull(feedItems.deletedAt)
        )
      );

    const ownedIds = ownedItems.map((item) => item.id);

    if (ownedIds.length === 0) {
      return NextResponse.json({ error: 'No items found' }, { status: 404 });
    }

    await db.update(feedItems)
      .set({ deletedAt: new Date() })
      .where(inArray(feedItems.id, ownedIds));

    return NextResponse.json({ deleted: ownedIds.length });
  } catch (err) {
    console.error('[POST /api/feed/bulk-delete]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
