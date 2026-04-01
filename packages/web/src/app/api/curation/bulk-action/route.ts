import {NextResponse} from 'next/server';
import {and, eq, inArray, isNull} from 'drizzle-orm';
import {curationItems, curationSources, db} from '@forme/shared';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';

const MAX_BULK = 100;
type Action = 'mark_unread' | 'delete';
const VALID_ACTIONS: Action[] = ['mark_unread', 'delete'];

export const POST = withTracing('POST /api/curation/bulk-action', async (request: Request) => {
  const supabase = await createClient();
  const {data: {user}, error: authError} = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  let body: {ids: string[]; action: string};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({error: 'Invalid JSON'}, {status: 400});
  }

  const {ids, action} = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({error: 'ids required'}, {status: 400});
  }
  if (ids.length > MAX_BULK) {
    return NextResponse.json({error: `최대 ${MAX_BULK}개까지 가능합니다`}, {status: 400});
  }
  if (ids.some((id) => !UUID_REGEX.test(id))) {
    return NextResponse.json({error: 'Invalid item ID'}, {status: 400});
  }
  if (!VALID_ACTIONS.includes(action as Action)) {
    return NextResponse.json({error: 'Invalid action'}, {status: 400});
  }

  try {
    // 소유권 검증: curationSources join
    const ownedItems = await db
      .select({id: curationItems.id})
      .from(curationItems)
      .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
      .where(and(inArray(curationItems.id, ids), eq(curationSources.userId, user.id), isNull(curationItems.deletedAt)));

    const ownedIds = ownedItems.map((item) => item.id);
    if (ownedIds.length === 0) {
      return NextResponse.json({error: 'No items found'}, {status: 404});
    }

    const condition = inArray(curationItems.id, ownedIds);

    if (action === 'mark_unread') {
      await db.update(curationItems).set({isRead: false, readAt: null}).where(condition);
    } else if (action === 'delete') {
      await db.update(curationItems)
        .set({ deletedAt: new Date() })
        .where(condition);
    }

    return NextResponse.json({ok: true, affected: ownedIds.length});
  } catch (err) {
    console.error('[POST /api/curation/bulk-action]', err);
    return NextResponse.json({error: 'Internal server error'}, {status: 500});
  }
});
