import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {curationItems, curationSources, db} from '@forme/shared';
import {and, eq, inArray} from 'drizzle-orm';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';

/**
 * POST /api/curation/bulk-delete
 *
 * Deletes multiple curation items at once.
 * Body: { ids: string[] }
 * Ownership verified via curation_sources.user_id join.
 */
export const POST = withTracing('POST /api/curation/bulk-delete', async (request) => {
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
      .select({ id: curationItems.id })
      .from(curationItems)
      .innerJoin(
        curationSources,
        eq(curationItems.sourceId, curationSources.id)
      )
      .where(
        and(
          inArray(curationItems.id, ids),
          eq(curationSources.userId, user.id)
        )
      );

    const ownedIds = ownedItems.map((item) => item.id);

    if (ownedIds.length === 0) {
      return NextResponse.json({ error: 'No items found' }, { status: 404 });
    }

    await db.delete(curationItems).where(inArray(curationItems.id, ownedIds));

    return NextResponse.json({ deleted: ownedIds.length });
  } catch (err) {
    console.error('[POST /api/curation/bulk-delete]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
