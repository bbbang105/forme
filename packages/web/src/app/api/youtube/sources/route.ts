import {NextResponse} from 'next/server';
import {asc, desc, eq} from 'drizzle-orm';
import {db, youtubeSources} from '@forme/shared';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';
import {YOUTUBE_CHANNEL_ID_REGEX} from '@/lib/validators';
import {isSafeUrl} from '@/lib/url-safety';

export const GET = withTracing('GET /api/youtube/sources', async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sources = await db.select().from(youtubeSources)
    .where(eq(youtubeSources.userId, user.id))
    .orderBy(desc(youtubeSources.isFavorite), asc(youtubeSources.favoriteOrder), desc(youtubeSources.createdAt));

  return NextResponse.json(sources, {
    headers: { 'Cache-Control': 'no-store' },
  });
});

export const POST = withTracing('POST /api/youtube/sources', async (request: Request) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { channelUrl: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { channelUrl } = body;
  if (!channelUrl || typeof channelUrl !== 'string') {
    return NextResponse.json({ error: 'channelUrl is required' }, { status: 400 });
  }
  // Bound input size before running regex / decodeURIComponent to prevent
  // memory blow-up and event-loop stalls on hostile payloads.
  if (channelUrl.length > 500) {
    return NextResponse.json({ error: 'channelUrl is too long' }, { status: 400 });
  }

  let channelId: string | null = null;

  // 1) youtube.com/channel/UCxxxxxx 형식
  const channelMatch = channelUrl.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (channelMatch) {
    channelId = channelMatch[1]!;
  }

  // 2) youtube.com/@handle 형식 — 페이지에서 channelId 추출
  if (!channelId) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(channelUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid channel URL' }, { status: 400 });
    }
    const handleMatch = decoded.match(/youtube\.com\/@([^\/\s?#]+)/);
    if (handleMatch && handleMatch[1]!.length <= 100) {
      try {
        const pageUrl = `https://www.youtube.com/@${encodeURIComponent(handleMatch[1]!)}`;
        if (!isSafeUrl(pageUrl)) {
          return NextResponse.json({ error: 'Unsafe URL' }, { status: 400 });
        }
        const res = await fetch(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const html = await res.text();
          // YouTube returns channelId as "externalId" or "channelId" depending on page version
          const idMatch = html.match(/"(?:channelId|externalId)":"(UC[a-zA-Z0-9_-]{22})"/);
          if (idMatch) channelId = idMatch[1]!;
        }
      } catch {
        // 핸들 해석 실패
      }
    }
  }

  if (!channelId || !YOUTUBE_CHANNEL_ID_REGEX.test(channelId)) {
    return NextResponse.json({
      error: '채널을 찾을 수 없습니다. youtube.com/@handle 또는 youtube.com/channel/UC... 형식으로 입력해주세요',
    }, { status: 400 });
  }

  // Fetch channel name from RSS feed
  let channelName = channelId;
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    if (!isSafeUrl(rssUrl)) {
      return NextResponse.json({ error: 'Unsafe URL' }, { status: 400 });
    }
    const res = await fetch(rssUrl, {
      headers: { 'User-Agent': 'forme-bot/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const text = await res.text();
      const nameMatch = text.match(/<author>\s*<name>([^<]+)<\/name>/);
      if (nameMatch) channelName = nameMatch[1]!.trim().slice(0, 200);
    }
  } catch {
    // 채널 이름 못 가져와도 등록은 진행
  }

  try {
    const [created] = await db.insert(youtubeSources).values({
      userId: user.id,
      channelId: channelId!,
      channelName,
    }).returning();
    return NextResponse.json(created, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('unique')) {
      return NextResponse.json({ error: '이미 등록된 채널입니다' }, { status: 409 });
    }
    throw e;
  }
});
