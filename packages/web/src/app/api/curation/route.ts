import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, curationItems, curationSources, profiles } from '@forme/shared';
import { eq, and, desc, sql } from 'drizzle-orm';
import { escapeIlike } from '@/lib/curation-utils';

// ── Helpers ──

/** Build a safe parameterized text[] SQL expression */
function sqlTextArray(arr: string[]) {
  // Use ARRAY[...] constructor with each element as a bound parameter
  if (arr.length === 0) return sql`'{}'::text[]`;
  const elements = arr.map((v, i) => (i === 0 ? sql`${v}` : sql`, ${v}`));
  return sql`ARRAY[${sql.join(elements, sql.raw(''))}]::text[]`;
}

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
 *   tags      - comma-separated tag names, AND filter (items must contain ALL)
 *   sort      - 'latest' (default) | 'recommended' (by user interest overlap)
 *   cursor    - composite keyset cursor
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
  const tagsParam = searchParams.get('tags')?.trim() || '';
  const sort = searchParams.get('sort')?.trim() || 'latest';

  const rawLimit = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
  const limit = isNaN(rawLimit)
    ? DEFAULT_LIMIT
    : Math.min(MAX_LIMIT, Math.max(1, rawLimit));

  // ── Validate params ──
  if (status && status !== 'unread' && status !== 'bookmarked') {
    return NextResponse.json(
      { error: "status must be 'unread' or 'bookmarked'" },
      { status: 400 }
    );
  }

  if (sort !== 'latest' && sort !== 'recommended') {
    return NextResponse.json(
      { error: "sort must be 'latest' or 'recommended'" },
      { status: 400 }
    );
  }

  const filterTags = tagsParam
    ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  // ── Build filter conditions ──
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

  // Tags AND filter: items.tags @> ARRAY[...]::text[]
  if (filterTags.length > 0) {
    filterConditions.push(
      sql`${curationItems.tags} @> ${sqlTextArray(filterTags)}`
    );
  }

  // ── Recommended sort: fetch user interests ──
  let userInterests: string[] = [];
  const isRecommended = sort === 'recommended';

  if (isRecommended) {
    const [profile] = await db
      .select({ interests: profiles.interests })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);
    userInterests = profile?.interests ?? [];
  }

  // ── Parse and apply cursor ──
  if (cursor) {
    if (isRecommended) {
      // Recommended cursor: "<overlap>|<publishedAt ISO>|<uuid>"
      const parts = cursor.split('|');
      if (parts.length < 3) {
        return NextResponse.json({ error: 'Invalid cursor format' }, { status: 400 });
      }
      const cursorOverlap = parseInt(parts[0], 10);
      const cursorDateStr = parts.slice(1, -1).join('|'); // ISO date may contain no extra |, but be safe
      const cursorId = parts[parts.length - 1];

      if (isNaN(cursorOverlap) || !UUID_RE.test(cursorId)) {
        return NextResponse.json({ error: 'Invalid cursor format' }, { status: 400 });
      }

      const safeInterests = sqlTextArray(userInterests);
      const overlapCursor = sql`COALESCE(array_length(ARRAY(SELECT unnest(${curationItems.tags}) INTERSECT SELECT unnest(${safeInterests})), 1), 0)`;

      if (cursorDateStr) {
        const cursorDate = new Date(cursorDateStr);
        if (isNaN(cursorDate.getTime())) {
          return NextResponse.json({ error: 'Invalid cursor format: date is not parseable' }, { status: 400 });
        }
        const cursorIso = cursorDate.toISOString();
        filterConditions.push(
          sql`(
            ${overlapCursor} < ${cursorOverlap}
            OR (
              ${overlapCursor} = ${cursorOverlap}
              AND (${curationItems.publishedAt} < ${cursorIso}::timestamptz OR (${curationItems.publishedAt} = ${cursorIso}::timestamptz AND ${curationItems.id} < ${cursorId}))
            )
          )`
        );
      } else {
        filterConditions.push(
          sql`(
            ${overlapCursor} < ${cursorOverlap}
            OR (
              ${overlapCursor} = ${cursorOverlap}
              AND ${curationItems.publishedAt} IS NULL AND ${curationItems.id} < ${cursorId}
            )
          )`
        );
      }
    } else {
      // Latest cursor: "<publishedAt ISO>|<uuid>"
      const separatorIdx = cursor.lastIndexOf('|');

      if (separatorIdx < 0) {
        return NextResponse.json({ error: 'Invalid cursor format' }, { status: 400 });
      }

      const cursorDateStr = cursor.slice(0, separatorIdx);
      const cursorId = cursor.slice(separatorIdx + 1);

      if (!UUID_RE.test(cursorId)) {
        return NextResponse.json({ error: 'Invalid cursor format: id is not a valid UUID' }, { status: 400 });
      }

      if (cursorDateStr) {
        const cursorDate = new Date(cursorDateStr);
        if (isNaN(cursorDate.getTime())) {
          return NextResponse.json({ error: 'Invalid cursor format: date is not parseable' }, { status: 400 });
        }
        const cursorIso = cursorDate.toISOString();
        filterConditions.push(
          sql`(${curationItems.publishedAt} < ${cursorIso}::timestamptz OR (${curationItems.publishedAt} = ${cursorIso}::timestamptz AND ${curationItems.id} < ${cursorId}))`
        );
      } else {
        filterConditions.push(
          sql`(${curationItems.publishedAt} IS NULL AND ${curationItems.id} < ${cursorId})`
        );
      }
    }
  }

  // ── Query ──
  try {
    const whereClause =
      filterConditions.length === 1
        ? filterConditions[0]
        : and(...filterConditions);

    if (isRecommended && userInterests.length > 0) {
      const safeInterestsQuery = sqlTextArray(userInterests);
      const overlapExpr = sql`COALESCE(array_length(ARRAY(SELECT unnest(${curationItems.tags}) INTERSECT SELECT unnest(${safeInterestsQuery})), 1), 0)`;

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
          overlap: overlapExpr.as('overlap'),
        })
        .from(curationItems)
        .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
        .where(whereClause)
        .orderBy(
          sql`${overlapExpr} DESC`,
          sql`${curationItems.publishedAt} DESC NULLS LAST`,
          desc(curationItems.id)
        )
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;

      const lastItem = items[items.length - 1];
      const nextCursor =
        hasMore && lastItem
          ? `${lastItem.overlap}|${lastItem.publishedAt?.toISOString() ?? ''}|${lastItem.id}`
          : null;

      return NextResponse.json(
        {
          items: items.map(serializeItem),
          nextCursor,
          hasMore,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Default: latest sort
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
