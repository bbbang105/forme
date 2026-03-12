import {and, eq, inArray} from 'drizzle-orm';
import {db, videoItems, videoSources} from '@forme/shared';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX, YOUTUBE_VIDEO_ID_REGEX} from '@/lib/validators';
import {isSafeUrl} from '@/lib/url-safety';
import {parseFeed} from 'feedsmith';
import {fetchVideoDurations} from '@/lib/youtube-api';

interface CollectBody {
  sourceIds: string[];
  period: '3d' | '7d' | '30d';
}

function getPeriodDate(period: '3d' | '7d' | '30d'): Date {
  const days = period === '3d' ? 3 : period === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const POST = withTracing('POST /api/video/collect', async (request: Request) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  let body: CollectBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { sourceIds, period } = body;
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
    return new Response(JSON.stringify({ error: 'sourceIds required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (sourceIds.length > 50) {
    return new Response(JSON.stringify({ error: 'Too many sources (max 50)' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (sourceIds.some((id) => !UUID_REGEX.test(id))) {
    return new Response(JSON.stringify({ error: 'Invalid source ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!['3d', '7d', '30d'].includes(period)) {
    return new Response(JSON.stringify({ error: 'Invalid period' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const since = getPeriodDate(period);

  const sources = await db.select().from(videoSources)
    .where(and(
      eq(videoSources.userId, user.id),
      eq(videoSources.isActive, true),
      inArray(videoSources.id, sourceIds),
    ));

  if (sources.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid sources' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const existingItems = await db.select({ videoId: videoItems.videoId })
    .from(videoItems)
    .where(and(
      eq(videoItems.userId, user.id),
      inArray(videoItems.sourceId, sourceIds),
    ));
  const existingVideoIds = new Set(existingItems.map((i) => i.videoId));

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const write = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseMessage(event, data)));
      };

      write('start', { totalSources: sources.length });

      let totalNewItems = 0;
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        write('processing', { index: i, sourceName: source.channelName });

        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${source.channelId}`;
        if (!isSafeUrl(rssUrl)) {
          failCount++;
          write('progress', {
            result: { sourceId: source.id, sourceName: source.channelName, success: false, newItemsAdded: 0, error: 'Unsafe URL' },
          });
          continue;
        }

        try {
          const res = await fetch(rssUrl, {
            headers: { 'User-Agent': 'forme-bot/1.0' },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) {
            failCount++;
            write('progress', {
              result: { sourceId: source.id, sourceName: source.channelName, success: false, newItemsAdded: 0, error: `HTTP ${res.status}` },
            });
            continue;
          }

          const xml = await res.text();
          const parsed = parseFeed(xml);
          const entries = (parsed.format === 'atom'
            ? (parsed.feed.entries ?? [])
            : (parsed.feed.items ?? [])) as Record<string, unknown>[];

          const newItems = entries
            .filter((entry) => {
              const id = String(entry.id ?? '');
              const videoId = id.replace('yt:video:', '');
              if (!YOUTUBE_VIDEO_ID_REGEX.test(videoId)) return false;
              // Shorts 제외: 제목에 #shorts 포함
              const title = String(entry.title ?? '');
              if (/#shorts/i.test(title)) return false;
              const pubDate = entry.published ? new Date(String(entry.published)) : null;
              return videoId && !existingVideoIds.has(videoId) && pubDate && pubDate >= since;
            })
            .map((entry) => {
              const id = String(entry.id ?? '');
              const videoId = id.replace('yt:video:', '');
              const published = entry.published ? String(entry.published) : null;
              const rawTitle = String(entry.title ?? 'Untitled');
              const rawDescription = entry.summary ? String(entry.summary) : null;
              return {
                userId: user.id,
                sourceId: source.id,
                videoId,
                title: rawTitle.slice(0, 500),
                description: rawDescription?.slice(0, 5000) ?? null,
                thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                channelName: source.channelName,
                publishedAt: published ? new Date(published) : null,
                status: 'collected' as const,
              };
            });

          let addedCount = 0;
          if (newItems.length > 0) {
            // YouTube Data API로 duration 조회 → 쇼츠/짧은 영상 필터 (2분 미만 제외)
            const videoIds = newItems.map((item) => item.videoId);
            const durations = await fetchVideoDurations(videoIds);

            const filteredItems = newItems
              .map((item) => ({ ...item, duration: durations.get(item.videoId) ?? null }))
              .filter((item) => {
                if (item.duration !== null && item.duration < 120) {
                  console.log(`[video/collect] Shorts filtered: ${item.title} (${item.duration}s)`);
                  return false;
                }
                return true;
              });

            if (filteredItems.length > 0) {
              await db.insert(videoItems).values(filteredItems).onConflictDoNothing();
              filteredItems.forEach((item) => existingVideoIds.add(item.videoId));
            }

            addedCount = filteredItems.length;
            totalNewItems += addedCount;
          }

          successCount++;
          write('progress', {
            result: { sourceId: source.id, sourceName: source.channelName, success: true, newItemsAdded: addedCount },
          });
        } catch {
          failCount++;
          write('progress', {
            result: { sourceId: source.id, sourceName: source.channelName, success: false, newItemsAdded: 0, error: '수집 실패' },
          });
        }
      }

      write('complete', {
        summary: { totalSources: sources.length, totalNewItems, successCount, failCount },
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
