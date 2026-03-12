import {NextResponse} from 'next/server';
import {and, eq} from 'drizzle-orm';
import {db, videoBookmarkCollections, videoItems} from '@forme/shared';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';

interface PatchBody {
  isRead?: boolean;
  isBookmarked?: boolean;
  memo?: string | null;
  collectionId?: string | null;
}

export const PATCH = withTracing('PATCH /api/video/[id]', async (request, ctx) => {
  const {id} = await (ctx as {params: Promise<{id: string}>}).params;

  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({error: 'Invalid item id'}, {status: 400});
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({error: 'Invalid JSON'}, {status: 400});
  }

  const {isRead, isBookmarked, memo, collectionId} = body;

  if (isRead === undefined && isBookmarked === undefined && memo === undefined && collectionId === undefined) {
    return NextResponse.json({error: 'At least one field required'}, {status: 400});
  }
  if (isRead !== undefined && typeof isRead !== 'boolean') {
    return NextResponse.json({error: 'isRead must be boolean'}, {status: 400});
  }
  if (isBookmarked !== undefined && typeof isBookmarked !== 'boolean') {
    return NextResponse.json({error: 'isBookmarked must be boolean'}, {status: 400});
  }
  if (memo !== undefined && memo !== null && typeof memo !== 'string') {
    return NextResponse.json({error: 'memo must be string or null'}, {status: 400});
  }
  if (collectionId !== undefined && collectionId !== null && (typeof collectionId !== 'string' || !UUID_REGEX.test(collectionId))) {
    return NextResponse.json({error: 'collectionId must be UUID or null'}, {status: 400});
  }

  try {
    const [existing] = await db.select({id: videoItems.id})
      .from(videoItems)
      .where(and(eq(videoItems.id, id), eq(videoItems.userId, user.id)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({error: 'Item not found'}, {status: 404});
    }

    const updateValues: Partial<{isRead: boolean; isBookmarked: boolean; memo: string | null; collectionId: string | null}> = {};

    if (isRead !== undefined) updateValues.isRead = isRead;
    if (isBookmarked !== undefined) updateValues.isBookmarked = isBookmarked;
    if (memo !== undefined) {
      updateValues.memo = memo ? memo.slice(0, 500) : null;
      if (memo) updateValues.isBookmarked = true;
    }
    if (collectionId !== undefined) {
      if (collectionId !== null) {
        const [col] = await db.select({id: videoBookmarkCollections.id})
          .from(videoBookmarkCollections)
          .where(and(eq(videoBookmarkCollections.id, collectionId), eq(videoBookmarkCollections.userId, user.id)))
          .limit(1);
        if (!col) {
          return NextResponse.json({error: 'Collection not found'}, {status: 404});
        }
      }
      updateValues.collectionId = collectionId;
      if (collectionId !== null) updateValues.isBookmarked = true;
    }

    const [updated] = await db.update(videoItems)
      .set(updateValues)
      .where(and(eq(videoItems.id, id), eq(videoItems.userId, user.id)))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    console.error(`[PATCH /api/video/${id}]`, err);
    return NextResponse.json({error: 'Internal server error'}, {status: 500});
  }
});

export const DELETE = withTracing('DELETE /api/video/[id]', async (_request, ctx) => {
  const {id} = await (ctx as {params: Promise<{id: string}>}).params;

  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({error: 'Invalid item id'}, {status: 400});
  }

  try {
    const deleted = await db.delete(videoItems)
      .where(and(eq(videoItems.id, id), eq(videoItems.userId, user.id)))
      .returning({id: videoItems.id});

    if (deleted.length === 0) {
      return NextResponse.json({error: 'Item not found'}, {status: 404});
    }

    return new NextResponse(null, {status: 204});
  } catch (err) {
    console.error(`[DELETE /api/video/${id}]`, err);
    return NextResponse.json({error: 'Internal server error'}, {status: 500});
  }
});
