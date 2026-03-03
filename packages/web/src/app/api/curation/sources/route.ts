import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, curationSources } from '@forme/shared';
import { eq, desc } from 'drizzle-orm';
import { isSafeUrl } from '@/lib/url-safety';

async function detectRssUrl(url: string): Promise<string | null> {
  if (!isSafeUrl(url)) return null;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'FormeBot/1.0' },
      signal: AbortSignal.timeout(5000),
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

export async function GET() {
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
      .from(curationSources)
      .where(eq(curationSources.userId, user.id))
      .orderBy(desc(curationSources.createdAt));

    return NextResponse.json(sources, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[GET /api/curation/sources]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { name?: string; url?: string; category?: string; rssUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, url, category, rssUrl } = body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (name.trim().length > 200) {
    return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 });
  }

  if (!url || typeof url !== 'string' || url.trim() === '') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
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
      .insert(curationSources)
      .values({
        userId: user.id,
        name: name.trim(),
        url: url.trim(),
        rssUrl: resolvedRssUrl,
        category: category?.trim() ?? 'ai',
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[POST /api/curation/sources]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
