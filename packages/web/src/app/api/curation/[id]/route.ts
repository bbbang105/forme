import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {curationItems, curationSources, db} from '@forme/shared';
import {and, eq} from 'drizzle-orm';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';

// ── Types ──

interface PatchBody {
  isRead?: boolean;
  isBookmarked?: boolean;
}

/**
 * PATCH /api/curation/[id]
 *
 * Updates read/bookmark status on a single curation item.
 * Ownership is verified by joining through curation_sources.user_id.
 *
 * Body: { isRead?: boolean, isBookmarked?: boolean }
 *
 * Response: updated item
 */
export const PATCH = withTracing('PATCH /api/curation/[id]', async (request, ctx) => {
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

  const { isRead, isBookmarked } = body;

  // At least one field must be provided
  if (isRead === undefined && isBookmarked === undefined) {
    return NextResponse.json(
      { error: 'At least one of isRead or isBookmarked must be provided' },
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

  try {
    // ── Verify ownership ──
    // curation_items has no user_id directly; ownership flows through curation_sources
    const [existing] = await db
      .select({
        id: curationItems.id,
        sourceUserId: curationSources.userId,
      })
      .from(curationItems)
      .innerJoin(
        curationSources,
        eq(curationItems.sourceId, curationSources.id)
      )
      .where(
        and(
          eq(curationItems.id, id),
          eq(curationSources.userId, user.id)
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
    }> = {};

    if (isRead !== undefined) {
      updateValues.isRead = isRead;
      updateValues.readAt = isRead ? new Date() : null;
    }
    if (isBookmarked !== undefined) updateValues.isBookmarked = isBookmarked;

    // ── Update ──
    const [updated] = await db
      .update(curationItems)
      .set(updateValues)
      .where(eq(curationItems.id, id))
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
    });
  } catch (err) {
    console.error(`[PATCH /api/curation/${id}]`, err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
