import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {db, podcastEpisodes} from '@forme/shared';
import {and, desc, eq, lt, or, sql} from 'drizzle-orm';
import {extractR2Key} from '@/lib/r2';
import {withTracing} from '@/lib/logger';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serializeEpisode(ep: typeof podcastEpisodes.$inferSelect) {
  return {
    id: ep.id,
    title: ep.title,
    description: ep.description ?? null,
    audioUrl: ep.audioUrl,
    duration: ep.duration ?? null,
    fileSize: ep.fileSize ?? null,
    publishedAt: ep.publishedAt instanceof Date ? ep.publishedAt.toISOString() : String(ep.publishedAt),
    createdAt: ep.createdAt instanceof Date ? ep.createdAt.toISOString() : String(ep.createdAt),
  };
}

/**
 * GET /api/podcast/episodes
 * Cursor-based pagination sorted by publishedAt DESC.
 * Query params: cursor, limit
 */
export const GET = withTracing('GET /api/podcast/episodes', async (request) => {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor')?.trim() || '';
  const rawLimit = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
  const limit = isNaN(rawLimit) ? DEFAULT_LIMIT : Math.min(MAX_LIMIT, Math.max(1, rawLimit));

  try {
    const conditions = [eq(podcastEpisodes.userId, user.id)];

    if (cursor) {
      // cursor format: "<ISO date>|<uuid>"
      const sepIdx = cursor.lastIndexOf('|');
      if (sepIdx < 1) {
        return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
      }
      const cursorDateStr = cursor.slice(0, sepIdx);
      const cursorId = cursor.slice(sepIdx + 1);
      if (!UUID_RE.test(cursorId)) {
        return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
      }
      const cursorDate = new Date(cursorDateStr);
      if (isNaN(cursorDate.getTime())) {
        return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
      }
      const cursorIso = cursorDate.toISOString();

      conditions.push(
        or(
          lt(podcastEpisodes.publishedAt, sql`${cursorIso}::timestamptz`),
          and(
            sql`${podcastEpisodes.publishedAt} = ${cursorIso}::timestamptz`,
            lt(podcastEpisodes.id, cursorId)
          )
        )!
      );
    }

    const rows = await db
      .select()
      .from(podcastEpisodes)
      .where(and(...conditions))
      .orderBy(desc(podcastEpisodes.publishedAt), desc(podcastEpisodes.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const episodes = hasMore ? rows.slice(0, limit) : rows;
    const lastEp = episodes[episodes.length - 1];
    const nextCursor =
      hasMore && lastEp
        ? `${new Date(lastEp.publishedAt).toISOString()}|${lastEp.id}`
        : null;

    return NextResponse.json(
      { episodes: episodes.map(serializeEpisode), nextCursor, hasMore },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  } catch (err) {
    console.error('[GET /api/podcast/episodes]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * POST /api/podcast/episodes
 * Create a new episode record after file upload.
 * Body: { title, description?, audioUrl, duration?, fileSize? }
 */
export const POST = withTracing('POST /api/podcast/episodes', async (request) => {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    title?: string;
    description?: string;
    audioUrl?: string;
    duration?: number;
    fileSize?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = body.title?.trim();
  const audioUrl = body.audioUrl?.trim();

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (title.length > 500) {
    return NextResponse.json({ error: 'title must be 500 characters or fewer' }, { status: 400 });
  }
  if (!audioUrl) {
    return NextResponse.json({ error: 'audioUrl is required' }, { status: 400 });
  }
  if (!extractR2Key(audioUrl)) {
    return NextResponse.json({ error: 'audioUrl must be a valid R2 URL' }, { status: 400 });
  }

  try {
    const [episode] = await db
      .insert(podcastEpisodes)
      .values({
        userId: user.id,
        title,
        description: body.description?.trim() || null,
        audioUrl,
        duration: body.duration ?? null,
        fileSize: body.fileSize ?? null,
      })
      .returning();

    return NextResponse.json(serializeEpisode(episode!), { status: 201 });
  } catch (err) {
    console.error('[POST /api/podcast/episodes]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
