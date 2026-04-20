import {NextResponse} from 'next/server';
import {and, desc, eq, inArray, isNotNull, isNull, lt, or, sql} from 'drizzle-orm';
import {db, videoItems, videoSources} from '@forme/shared';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';
import {VIDEO_FEED_PAGE_SIZE, VIDEO_SUMMARIZING_TIMEOUT_MS} from '@/lib/constants';
import {escapeIlike} from '@/lib/feed-utils';

type Tab = 'feed' | 'create';
type Status = 'unread' | 'read' | 'bookmarked';
const VALID_TABS: Tab[] = ['feed', 'create'];
const VALID_STATUSES: Status[] = ['unread', 'read', 'bookmarked'];

export const GET = withTracing('GET /api/video/items', async (request: Request) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const tab = (url.searchParams.get('tab') || 'feed') as Tab;
  if (!VALID_TABS.includes(tab)) {
    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 });
  }

  const status = (url.searchParams.get('status') || 'unread') as Status;
  if (tab === 'feed' && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const sourceId = url.searchParams.get('sourceId');
  const tag = url.searchParams.get('tag');
  const cursor = url.searchParams.get('cursor');
  const limit = VIDEO_FEED_PAGE_SIZE;
  const isBookmarked = tab === 'feed' && status === 'bookmarked';

  // summarizing 타임아웃 리커버리 (create 탭에서만 실행)
  if (tab === 'create') {
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

  // Tab + status filter
  if (tab === 'feed') {
    // 피드 탭: 요약 완료된 영상만
    conditions.push(eq(videoItems.status, 'summarized'));

    if (status === 'unread') {
      conditions.push(eq(videoItems.isRead, false));
    } else if (status === 'read') {
      conditions.push(eq(videoItems.isRead, true));
    } else if (status === 'bookmarked') {
      conditions.push(eq(videoItems.isBookmarked, true));
      // Pinned items are returned separately in `pinnedItems` (first page only).
      conditions.push(isNull(videoItems.pinnedAt));
    }
  } else if (tab === 'create') {
    conditions.push(
      or(
        eq(videoItems.status, 'collected'),
        eq(videoItems.status, 'summarizing'),
      )!,
    );
  }

  // Search filter (escapeIlike + raw SQL ESCAPE for wildcard safety)
  const search = url.searchParams.get('search')?.trim();
  if (search && search.length >= 2 && search.length <= 100) {
    const pattern = `%${escapeIlike(search)}%`;
    conditions.push(
      sql`(${videoItems.title} ILIKE ${pattern} ESCAPE '\\' OR COALESCE(${videoItems.oneLiner}, '') ILIKE ${pattern} ESCAPE '\\')`,
    );
  }

  // Source filter
  if (sourceId && UUID_REGEX.test(sourceId)) {
    conditions.push(eq(videoItems.sourceId, sourceId));
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

  // 읽음 탭: readAt 기준, 그 외: publishedAt 기준
  const isReadTab = tab === 'feed' && status === 'read';
  const cursorColumn = isReadTab ? videoItems.readAt : videoItems.publishedAt;

  // Cursor pagination
  if (cursor) {
    const [cursorDate, cursorId] = cursor.split('|');
    if (cursorDate && cursorId && !isNaN(Date.parse(cursorDate)) && UUID_REGEX.test(cursorId)) {
      conditions.push(
        or(
          lt(cursorColumn, new Date(cursorDate)),
          and(
            eq(cursorColumn, new Date(cursorDate)),
            lt(videoItems.id, cursorId),
          ),
        )!,
      );
    }
  }

  const sortColumn = isReadTab ? videoItems.readAt : videoItems.publishedAt;

  // Pinned items — only on first page of Saved (bookmarked) view.
  let pinnedItems: typeof videoItems.$inferSelect[] = [];
  if (isBookmarked && !cursor) {
    pinnedItems = await db
      .select()
      .from(videoItems)
      .where(
        and(
          eq(videoItems.userId, user.id),
          eq(videoItems.status, 'summarized'),
          eq(videoItems.isBookmarked, true),
          isNotNull(videoItems.pinnedAt),
        )
      )
      .orderBy(desc(videoItems.pinnedAt), desc(videoItems.id))
      .limit(3);
  }

  const rows = await db.select().from(videoItems)
    .where(and(...conditions))
    .orderBy(desc(sortColumn), desc(videoItems.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const cursorDate = isReadTab ? lastItem?.readAt : lastItem?.publishedAt;
  const nextCursor = hasMore && lastItem && cursorDate
    ? `${cursorDate.toISOString()}|${lastItem.id}`
    : null;

  return NextResponse.json({ items, pinnedItems, nextCursor, hasMore }, {
    headers: { 'Cache-Control': 'no-store' },
  });
});
