import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {feedSources, db} from '@forme/shared';
import {asc, desc, eq} from 'drizzle-orm';
import {isSafeUrl} from '@/lib/url-safety';
import {safeFetch} from '@/lib/safe-fetch';
import {withTracing} from '@/lib/logger';

async function detectRssUrl(url: string): Promise<string | null> {
  if (!isSafeUrl(url)) return null;
  try {
    const response = await safeFetch(url, {
      headers: { 'User-Agent': 'FormeBot/1.0' },
      timeoutMs: 5000,
    });
    if (!response.ok) return null;
    const html = await response.text();
    const match = html.match(
      /<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i
    );
    if (!match?.[2]) return null;
    const resolved = new URL(match[2], url).toString();
    return isSafeUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

export const GET = withTracing('GET /api/feed/sources', async () => {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sources = await db
      .select()
      .from(feedSources)
      .where(eq(feedSources.userId, user.id))
      .orderBy(
        desc(feedSources.isFavorite),
        asc(feedSources.favoriteOrder),
        desc(feedSources.createdAt)
      );

    return NextResponse.json(sources, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[GET /api/feed/sources]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

export const POST = withTracing('POST /api/feed/sources', async (request) => {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { name?: string; url?: string; category?: string; rssUrl?: string; tags?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, url, category, rssUrl, tags } = body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (name.trim().length > 200) {
    return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 });
  }

  if (!url || typeof url !== 'string' || url.trim() === '') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  if (url.length > 2048) {
    return NextResponse.json({ error: 'url is too long' }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'url must be a valid URL' }, { status: 400 });
  }

  if (!isSafeUrl(url.trim())) {
    return NextResponse.json({ error: 'url must be a public URL' }, { status: 400 });
  }

  if (category && typeof category === 'string' && category.trim().length > 50) {
    return NextResponse.json({ error: 'category must be 50 characters or fewer' }, { status: 400 });
  }

  // Validate tags if provided
  if (tags !== undefined) {
    if (!Array.isArray(tags)) {
      return NextResponse.json({ error: 'tags must be an array' }, { status: 400 });
    }
    if (tags.length > 20) {
      return NextResponse.json({ error: 'tags must have at most 20 items' }, { status: 400 });
    }
    if (tags.some((t) => typeof t !== 'string' || t.length > 50)) {
      return NextResponse.json({ error: 'Each tag must be a string of 50 characters or fewer' }, { status: 400 });
    }
  }

  // Validate rssUrl if provided
  let resolvedRssUrl: string | null = null;
  if (rssUrl && typeof rssUrl === 'string' && rssUrl.trim() !== '') {
    try {
      new URL(rssUrl.trim());
    } catch {
      return NextResponse.json({ error: 'rssUrl must be a valid URL' }, { status: 400 });
    }
    if (!isSafeUrl(rssUrl.trim())) {
      return NextResponse.json({ error: 'rssUrl must be a public URL' }, { status: 400 });
    }
    resolvedRssUrl = rssUrl.trim();
  } else {
    resolvedRssUrl = await detectRssUrl(url.trim());
  }

  try {
    const [created] = await db
      .insert(feedSources)
      .values({
        userId: user.id,
        name: name.trim(),
        url: url.trim(),
        rssUrl: resolvedRssUrl,
        category: category?.trim() ?? 'ai',
        tags: tags && tags.length > 0 ? tags : null,
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[POST /api/feed/sources]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
