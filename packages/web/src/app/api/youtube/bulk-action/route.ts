import {NextResponse} from 'next/server';
import {and, eq, inArray} from 'drizzle-orm';
import {db, youtubeItems} from '@forme/shared';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';

const MAX_BULK = 100;
type Action = 'mark_unread' | 'delete';
const VALID_ACTIONS: Action[] = ['mark_unread', 'delete'];

export const POST = withTracing('POST /api/youtube/bulk-action', async (request: Request) => {
  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  let body: {itemIds: string[]; action: Action};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({error: 'Invalid JSON'}, {status: 400});
  }

  const {itemIds, action} = body;

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return NextResponse.json({error: 'itemIds required'}, {status: 400});
  }
  if (itemIds.length > MAX_BULK) {
    return NextResponse.json({error: `최대 ${MAX_BULK}개까지 가능합니다`}, {status: 400});
  }
  if (itemIds.some((id) => !UUID_REGEX.test(id))) {
    return NextResponse.json({error: 'Invalid item ID'}, {status: 400});
  }
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({error: 'Invalid action'}, {status: 400});
  }

  const condition = and(
    eq(youtubeItems.userId, user.id),
    inArray(youtubeItems.id, itemIds),
  );

  if (action === 'mark_unread') {
    await db.update(youtubeItems)
      .set({isRead: false, readAt: null})
      .where(condition);
  } else if (action === 'delete') {
    await db.delete(youtubeItems).where(condition);
  }

  return NextResponse.json({ok: true});
});
