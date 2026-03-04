import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {curationItems, curationSources, db, profiles} from '@forme/shared';
import {and, desc, eq, inArray, sql, type SQL} from 'drizzle-orm';
import {escapeIlike} from '@/lib/curation-utils';
import {withTracing} from '@/lib/logger';

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
export const GET = withTracing('GET /api/curation', async (request) => {
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
  const sourceId = searchParams.get('sourceId')?.trim() || '';

  const rawLimit = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
  const limit = isNaN(rawLimit)
    ? DEFAULT_LIMIT
    : Math.min(MAX_LIMIT, Math.max(1, rawLimit));

  // ── Validate params ──
  if (status && status !== 'unread' && status !== 'read' && status !== 'bookmarked') {
    return NextResponse.json(
      { error: "status must be 'unread', 'read', or 'bookmarked'" },
      { status: 400 }
    );
  }

  if (sort !== 'latest' && sort !== 'recommended') {
    return NextResponse.json(
      { error: "sort must be 'latest' or 'recommended'" },
      { status: 400 }
    );
  }

  if (sourceId && !UUID_RE.test(sourceId)) {
    return NextResponse.json(
      { error: 'sourceId must be a valid UUID' },
      { status: 400 }
    );
  }

  const filterTags = tagsParam
    ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  // ── Build filter conditions ──
  const filterConditions = [eq(curationSources.userId, user.id)];

  if (category && category !== 'all') {
    // 'dev' includes legacy categories that map to dev
    const DEV_ALIASES = ['dev', 'career', 'frontend', 'backend', 'devops', 'security', 'data'];
    if (category === 'dev') {
      filterConditions.push(inArray(curationItems.category, DEV_ALIASES));
    } else {
      filterConditions.push(eq(curationItems.category, category));
    }
  }

  if (sourceId) {
    filterConditions.push(eq(curationItems.sourceId, sourceId));
  }

  if (status === 'unread') {
    filterConditions.push(eq(curationItems.isRead, false));
  } else if (status === 'read') {
    filterConditions.push(eq(curationItems.isRead, true));
  } else if (status === 'bookmarked') {
    filterConditions.push(eq(curationItems.isBookmarked, true));
  }

  if (search) {
    const escaped = escapeIlike(search.replace(/\s+/g, ''));
    const pattern = `%${escaped}%`;
    filterConditions.push(
      sql`(REPLACE(${curationItems.title}, ' ', '') ILIKE ${pattern} ESCAPE '\\' OR REPLACE(COALESCE(${curationItems.description}, ''), ' ', '') ILIKE ${pattern} ESCAPE '\\' OR REPLACE(COALESCE(${curationSources.name}, ''), ' ', '') ILIKE ${pattern} ESCAPE '\\')`
    );
  }

  // Tags AND filter: items.tags @> ARRAY[...]::text[]
  if (filterTags.length > 0) {
    filterConditions.push(
      sql`${curationItems.tags} @> ${sqlTextArray(filterTags)}`
    );
  }

  // ── Recommended sort: fetch user interests & build score expression ──
  let userInterests: string[] = [];
  const isRecommended = sort === 'recommended';
  let scoreExpr: SQL | null = null;

  if (isRecommended) {
    const [profile] = await db
      .select({ interests: profiles.interests })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);
    userInterests = profile?.interests ?? [];

    // Composite score: profile interests + read tag frequency + read category frequency
    const interestOverlapExpr = userInterests.length > 0
      ? sql`COALESCE(array_length(ARRAY(SELECT unnest(${curationItems.tags}) INTERSECT SELECT unnest(${sqlTextArray(userInterests)})), 1), 0)`
      : sql`0`;

    const readTagScoreExpr = sql`COALESCE((
      SELECT SUM(LEAST(rtf.freq, 5))::int
      FROM (
        SELECT unnest(ri.tags) AS tag, COUNT(*)::int AS freq
        FROM curation_items ri
        JOIN curation_sources rs ON ri.source_id = rs.id
        WHERE rs.user_id = ${user.id} AND ri.is_read = true
        GROUP BY 1
      ) rtf
      WHERE rtf.tag = ANY(${curationItems.tags})
    ), 0)`;

    const readCatScoreExpr = sql`COALESCE((
      SELECT LEAST(rcf.freq, 10)
      FROM (
        SELECT ri.category, COUNT(*)::int AS freq
        FROM curation_items ri
        JOIN curation_sources rs ON ri.source_id = rs.id
        WHERE rs.user_id = ${user.id} AND ri.is_read = true
        GROUP BY 1
      ) rcf
      WHERE rcf.category = ${curationItems.category}
    ), 0)`;

    scoreExpr = sql`(3 * ${interestOverlapExpr} + ${readTagScoreExpr} + ${readCatScoreExpr})`;
  }

  // ── Sort date expression ──
  // Use COALESCE so items without publishedAt fall back to collectedAt.
  // collectedAt is NOT NULL, so sortDate is always non-null → no NULLS LAST needed.
  const sortDateExpr = sql`COALESCE(${curationItems.publishedAt}, ${curationItems.collectedAt})`;

  // ── Parse and apply cursor ──
  if (cursor) {
    if (isRecommended) {
      // Recommended cursor: "<score>|<sortDate ISO>|<uuid>"
      const parts = cursor.split('|');
      if (parts.length < 3) {
        return NextResponse.json({ error: 'Invalid cursor format' }, { status: 400 });
      }
      const cursorScore = parseInt(parts[0], 10);
      const cursorDateStr = parts.slice(1, -1).join('|');
      const cursorId = parts[parts.length - 1];

      if (isNaN(cursorScore) || !cursorDateStr || !UUID_RE.test(cursorId)) {
        return NextResponse.json({ error: 'Invalid cursor format' }, { status: 400 });
      }

      const cursorDate = new Date(cursorDateStr);
      if (isNaN(cursorDate.getTime())) {
        return NextResponse.json({ error: 'Invalid cursor format: date is not parseable' }, { status: 400 });
      }
      const cursorIso = cursorDate.toISOString();

      filterConditions.push(
        sql`(
          ${scoreExpr} < ${cursorScore}
          OR (
            ${scoreExpr} = ${cursorScore}
            AND (${sortDateExpr} < ${cursorIso}::timestamptz OR (${sortDateExpr} = ${cursorIso}::timestamptz AND ${curationItems.id} < ${cursorId}))
          )
        )`
      );
    } else {
      // Latest cursor: "<sortDate ISO>|<uuid>"
      const separatorIdx = cursor.lastIndexOf('|');

      if (separatorIdx < 1) {
        return NextResponse.json({ error: 'Invalid cursor format' }, { status: 400 });
      }

      const cursorDateStr = cursor.slice(0, separatorIdx);
      const cursorId = cursor.slice(separatorIdx + 1);

      if (!UUID_RE.test(cursorId)) {
        return NextResponse.json({ error: 'Invalid cursor format: id is not a valid UUID' }, { status: 400 });
      }

      const cursorDate = new Date(cursorDateStr);
      if (isNaN(cursorDate.getTime())) {
        return NextResponse.json({ error: 'Invalid cursor format: date is not parseable' }, { status: 400 });
      }
      const cursorIso = cursorDate.toISOString();

      filterConditions.push(
        sql`(${sortDateExpr} < ${cursorIso}::timestamptz OR (${sortDateExpr} = ${cursorIso}::timestamptz AND ${curationItems.id} < ${cursorId}))`
      );
    }
  }

  // ── Query ──
  try {
    const whereClause =
      filterConditions.length === 1
        ? filterConditions[0]
        : and(...filterConditions);

    if (isRecommended) {
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
          score: scoreExpr!.as('score'),
          sortDate: sortDateExpr.as('sort_date'),
        })
        .from(curationItems)
        .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
        .where(whereClause)
        .orderBy(
          sql`${scoreExpr} DESC`,
          sql`${sortDateExpr} DESC`,
          desc(curationItems.id)
        )
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;

      const lastItem = items[items.length - 1];
      const nextCursor =
        hasMore && lastItem
          ? `${lastItem.score}|${new Date(lastItem.sortDate as string | Date).toISOString()}|${lastItem.id}`
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
        sortDate: sortDateExpr.as('sort_date'),
      })
      .from(curationItems)
      .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
      .where(whereClause)
      .orderBy(
        sql`${sortDateExpr} DESC`,
        desc(curationItems.id)
      )
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? `${new Date(lastItem.sortDate as string | Date).toISOString()}|${lastItem.id}`
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
});
