import {NextResponse} from 'next/server';
import {and, count, eq, isNotNull, ne} from 'drizzle-orm';
import {db, youtubeItems} from '@forme/shared';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';
import {ITEM_NOTE_MAX_LENGTH} from '@/lib/constants';

/** Max items a user can pin to the top of the Saved view. */
const MAX_PINNED = 3;

interface PatchBody {
  isRead?: boolean;
  isBookmarked?: boolean;
  note?: string | null;
  /** When `true`, sets `pinned_at = now()`. When `false`, clears it. Enforces MAX_PINNED. */
  pinned?: boolean;
}

export const PATCH = withTracing('PATCH /api/youtube/[id]', async (request, ctx) => {
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

  const {isRead, isBookmarked, note, pinned} = body;

  if (isRead === undefined && isBookmarked === undefined && note === undefined && pinned === undefined) {
    return NextResponse.json({error: 'At least one field required'}, {status: 400});
  }
  if (isRead !== undefined && typeof isRead !== 'boolean') {
    return NextResponse.json({error: 'isRead must be boolean'}, {status: 400});
  }
  if (isBookmarked !== undefined && typeof isBookmarked !== 'boolean') {
    return NextResponse.json({error: 'isBookmarked must be boolean'}, {status: 400});
  }
  if (note !== undefined && note !== null && typeof note !== 'string') {
    return NextResponse.json({error: 'note must be string or null'}, {status: 400});
  }
  if (pinned !== undefined && typeof pinned !== 'boolean') {
    return NextResponse.json({error: 'pinned must be boolean'}, {status: 400});
  }

  try {
    const [existing] = await db
      .select({id: youtubeItems.id, currentPinnedAt: youtubeItems.pinnedAt})
      .from(youtubeItems)
      .where(and(eq(youtubeItems.id, id), eq(youtubeItems.userId, user.id)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({error: 'Item not found'}, {status: 404});
    }

    const updateValues: Partial<{
      isRead: boolean;
      isBookmarked: boolean;
      note: string | null;
      pinnedAt: Date | null;
      readAt: Date | null;
    }> = {};

    if (isRead !== undefined) {
      updateValues.isRead = isRead;
      updateValues.readAt = isRead ? new Date() : null;
    }
    if (isBookmarked !== undefined) updateValues.isBookmarked = isBookmarked;
    if (note !== undefined) {
      updateValues.note = note ? note.slice(0, ITEM_NOTE_MAX_LENGTH) : null;
      if (note) updateValues.isBookmarked = true;
    }

    if (pinned !== undefined) {
      if (pinned) {
        if (!existing.currentPinnedAt) {
          const [{value}] = await db
            .select({value: count()})
            .from(youtubeItems)
            .where(
              and(
                eq(youtubeItems.userId, user.id),
                isNotNull(youtubeItems.pinnedAt),
                ne(youtubeItems.id, id),
              )
            );
          if (value >= MAX_PINNED) {
            return NextResponse.json(
              {error: `Maximum ${MAX_PINNED} pinned items allowed`},
              {status: 409}
            );
          }
        }
        updateValues.pinnedAt = new Date();
        if (isBookmarked === undefined) updateValues.isBookmarked = true;
      } else {
        updateValues.pinnedAt = null;
      }
    }

    const [updated] = await db
      .update(youtubeItems)
      .set(updateValues)
      .where(and(eq(youtubeItems.id, id), eq(youtubeItems.userId, user.id)))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    console.error(`[PATCH /api/youtube/${id}]`, err);
    return NextResponse.json({error: 'Internal server error'}, {status: 500});
  }
});

export const DELETE = withTracing('DELETE /api/youtube/[id]', async (_request, ctx) => {
  const {id} = await (ctx as {params: Promise<{id: string}>}).params;

  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({error: 'Invalid item id'}, {status: 400});
  }

  try {
    const deleted = await db
      .delete(youtubeItems)
      .where(and(eq(youtubeItems.id, id), eq(youtubeItems.userId, user.id)))
      .returning({id: youtubeItems.id});

    if (deleted.length === 0) {
      return NextResponse.json({error: 'Item not found'}, {status: 404});
    }

    return new NextResponse(null, {status: 204});
  } catch (err) {
    console.error(`[DELETE /api/youtube/${id}]`, err);
    return NextResponse.json({error: 'Internal server error'}, {status: 500});
  }
});
