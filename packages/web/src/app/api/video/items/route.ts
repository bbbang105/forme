import {NextResponse} from 'next/server';
import {and, desc, eq, inArray, lt, or} from 'drizzle-orm';
import {db, videoItems, videoSources} from '@forme/shared';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';
import {VIDEO_FEED_PAGE_SIZE, VIDEO_SUMMARIZING_TIMEOUT_MS} from '@/lib/constants';

type Tab = 'summary' | 'new' | 'bookmarked';
const VALID_TABS: Tab[] = ['summary', 'new', 'bookmarked'];

export const GET = withTracing('GET /api/video/items', async (request: Request) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const tab = (url.searchParams.get('tab') || 'summary') as Tab;
  if (!VALID_TABS.includes(tab)) {
    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 });
  }

  const sourceId = url.searchParams.get('sourceId');
  const tag = url.searchParams.get('tag');
  const collectionId = url.searchParams.get('collectionId');
  const cursor = url.searchParams.get('cursor');
  const limit = VIDEO_FEED_PAGE_SIZE;

  // summarizing 타임아웃 리커버리 (new 탭에서만 실행 — summarizing 아이템이 보이는 탭)
  if (tab === 'new') {
    await db.update(videoItems)
      .set({ status: 'collected' })
      .where(and(
        eq(videoItems.userId, user.id),
        eq(videoItems.status, 'summarizing'),
        lt(videoItems.collectedAt, new Date(Date.now() - VIDEO_SUMMARIZING_TIMEOUT_MS)),
      ));
  }

  // Build conditions
  const conditions = [eq(videoItems.userId, user.id)];

  // Tab filter
  if (tab === 'summary') {
    conditions.push(eq(videoItems.status, 'summarized'));
  } else if (tab === 'new') {
    conditions.push(
      or(
        eq(videoItems.status, 'collected'),
        eq(videoItems.status, 'summarizing'),
      )!,
    );
  } else if (tab === 'bookmarked') {
    conditions.push(eq(videoItems.isBookmarked, true));
  }

  // Source filter
  if (sourceId && UUID_REGEX.test(sourceId)) {
    conditions.push(eq(videoItems.sourceId, sourceId));
  }

  // Collection filter
  if (collectionId && UUID_REGEX.test(collectionId)) {
    conditions.push(eq(videoItems.collectionId, collectionId));
  }

  // Tag filter — find sourceIds with matching tag, then filter items
  if (tag && typeof tag === 'string') {
    const allSources = await db.select({ id: videoSources.id, tags: videoSources.tags })
      .from(videoSources)
      .where(eq(videoSources.userId, user.id));

    const filteredSourceIds = allSources
      .filter((s) => s.tags?.includes(tag))
      .map((s) => s.id);

    if (filteredSourceIds.length > 0) {
      conditions.push(inArray(videoItems.sourceId, filteredSourceIds));
    } else {
      return NextResponse.json({ items: [], nextCursor: null, hasMore: false }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  }

  // Cursor pagination
  if (cursor) {
    const [cursorDate, cursorId] = cursor.split('|');
    if (cursorDate && cursorId && !isNaN(Date.parse(cursorDate)) && UUID_REGEX.test(cursorId)) {
      conditions.push(
        or(
          lt(videoItems.publishedAt, new Date(cursorDate)),
          and(
            eq(videoItems.publishedAt, new Date(cursorDate)),
            lt(videoItems.id, cursorId),
          ),
        )!,
      );
    }
  }

  const rows = await db.select().from(videoItems)
    .where(and(...conditions))
    .orderBy(desc(videoItems.publishedAt), desc(videoItems.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0
    ? `${items[items.length - 1]!.publishedAt?.toISOString()}|${items[items.length - 1]!.id}`
    : null;

  return NextResponse.json({ items, nextCursor, hasMore }, {
    headers: { 'Cache-Control': 'no-store' },
  });
});
