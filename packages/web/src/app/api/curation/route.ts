import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, curationItems, curationSources } from '@forme/shared';
import { eq, and, desc, sql } from 'drizzle-orm';
import { escapeIlike } from '@/lib/curation-utils';

// ── Constants ──

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SEARCH_LENGTH = 100;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

// ── Types ──

interface RawItem {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  description: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  category: string;
  tags: string[] | null;
  isRead: boolean;
  isBookmarked: boolean;
  collectedAt: Date;
  sourceName: string | null;
}

// ── Serializer ──

function serializeItem(item: RawItem) {
  return {
    id: item.id,
    sourceId: item.sourceId,
    title: item.title,
    url: item.url,
    description: item.description ?? null,
    thumbnailUrl: item.thumbnailUrl ?? null,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    category: item.category,
    tags: item.tags ?? null,
    isRead: item.isRead,
    isBookmarked: item.isBookmarked,
    collectedAt: item.collectedAt.toISOString(),
    sourceName: item.sourceName ?? null,
  };
}

/**
 * GET /api/curation
 *
 * Fetches curation items with cursor-based pagination for infinite scroll.
 *
 * Query params:
 *   category  - filter by category slug (omit or 'all' to skip)
 *   status    - 'unread' (is_read=false) | 'bookmarked' (is_bookmarked=true)
 *   search    - ILIKE search on title and description (max 100 chars)
 *   cursor    - composite keyset cursor: "<publishedAt ISO>|<uuid>"
 *   limit     - page size, default 12, max 50
 *
 * Response: { items, nextCursor, hasMore }
 */
export async function GET(request: NextRequest) {
  // ── Auth ──
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse query params ──
  const { searchParams } = new URL(request.url);

  const category = searchParams.get('category')?.trim() || '';
  const status = searchParams.get('status')?.trim() || '';
  const cursor = searchParams.get('cursor')?.trim() || '';
  const searchRaw = searchParams.get('search')?.trim() || '';
  const search = searchRaw.slice(0, MAX_SEARCH_LENGTH);

  const rawLimit = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
  const limit = isNaN(rawLimit)
    ? DEFAULT_LIMIT
    : Math.min(MAX_LIMIT, Math.max(1, rawLimit));

  // ── Validate status param ──
  if (status && status !== 'unread' && status !== 'bookmarked') {
    return NextResponse.json(
      { error: "status must be 'unread' or 'bookmarked'" },
      { status: 400 }
    );
  }

  // ── Build filter conditions ──
  // Ownership is enforced by joining on sources.user_id = user.id (belt-and-suspenders over RLS)
  const filterConditions = [eq(curationSources.userId, user.id)];

  if (category && category !== 'all') {
    filterConditions.push(eq(curationItems.category, category));
  }

  if (status === 'unread') {
    filterConditions.push(eq(curationItems.isRead, false));
  } else if (status === 'bookmarked') {
    filterConditions.push(eq(curationItems.isBookmarked, true));
  }

  if (search) {
    const escaped = escapeIlike(search);
    const pattern = `%${escaped}%`;
    filterConditions.push(
      sql`(${curationItems.title} ILIKE ${pattern} ESCAPE '\\' OR ${curationItems.description} ILIKE ${pattern} ESCAPE '\\')`
    );
  }

  // ── Parse and apply cursor ──
  if (cursor) {
    // Cursor format: "<publishedAt ISO>|<uuid>"
    // publishedAt part may be empty string when the item has no publishedAt
    const separatorIdx = cursor.lastIndexOf('|');

    if (separatorIdx < 0) {
      return NextResponse.json(
        { error: 'Invalid cursor format' },
        { status: 400 }
      );
    }

    const cursorDateStr = cursor.slice(0, separatorIdx);
    const cursorId = cursor.slice(separatorIdx + 1);

    if (!UUID_RE.test(cursorId)) {
      return NextResponse.json(
        { error: 'Invalid cursor format: id is not a valid UUID' },
        { status: 400 }
      );
    }

    if (cursorDateStr) {
      const cursorDate = new Date(cursorDateStr);
      if (isNaN(cursorDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid cursor format: date is not parseable' },
          { status: 400 }
        );
      }
      const cursorIso = cursorDate.toISOString();
      // Keyset: rows where (published_at, id) comes strictly after the cursor row
      // in DESC order, i.e. published_at < cursorDate OR (equal date AND id < cursorId)
      filterConditions.push(
        sql`(${curationItems.publishedAt} < ${cursorIso}::timestamptz OR (${curationItems.publishedAt} = ${cursorIso}::timestamptz AND ${curationItems.id} < ${cursorId}))`
      );
    } else {
      // Item had no publishedAt — all items without publishedAt after cursor position
      filterConditions.push(
        sql`(${curationItems.publishedAt} IS NULL AND ${curationItems.id} < ${cursorId})`
      );
    }
  }

  // ── Query ──
  try {
    const whereClause =
      filterConditions.length === 1
        ? filterConditions[0]
        : and(...filterConditions);

    const rows = await db
      .select({
        id: curationItems.id,
        sourceId: curationItems.sourceId,
        title: curationItems.title,
        url: curationItems.url,
        description: curationItems.description,
        thumbnailUrl: curationItems.thumbnailUrl,
        publishedAt: curationItems.publishedAt,
        category: curationItems.category,
        tags: curationItems.tags,
        isRead: curationItems.isRead,
        isBookmarked: curationItems.isBookmarked,
        collectedAt: curationItems.collectedAt,
        sourceName: curationSources.name,
      })
      .from(curationItems)
      .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
      .where(whereClause)
      .orderBy(
        sql`${curationItems.publishedAt} DESC NULLS LAST`,
        desc(curationItems.id)
      )
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? `${lastItem.publishedAt?.toISOString() ?? ''}|${lastItem.id}`
        : null;

    return NextResponse.json(
      {
        items: items.map(serializeItem),
        nextCursor,
        hasMore,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (err) {
    console.error('[GET /api/curation]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
