import {NextResponse} from 'next/server';
import {and, eq, inArray} from 'drizzle-orm';
import {db, youtubeItems} from '@forme/shared';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';
import {YOUTUBE_SUMMARIZE_BATCH_MAX} from '@/lib/constants';
import {fetchTranscript} from '@/lib/youtube-transcript';
import {summarizeVideo} from '@/lib/gemini';

export const POST = withTracing('POST /api/youtube/summarize', async (request: Request) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { itemIds: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { itemIds } = body;
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return NextResponse.json({ error: 'itemIds required' }, { status: 400 });
  }
  if (itemIds.length > YOUTUBE_SUMMARIZE_BATCH_MAX) {
    return NextResponse.json({ error: `최대 ${YOUTUBE_SUMMARIZE_BATCH_MAX}개까지 선택 가능합니다` }, { status: 400 });
  }
  if (itemIds.some((id) => !UUID_REGEX.test(id))) {
    return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 });
  }

  // 소유권 확인
  const items = await db.select().from(youtubeItems)
    .where(and(
      eq(youtubeItems.userId, user.id),
      inArray(youtubeItems.id, itemIds),
    ));

  if (items.length === 0) {
    return NextResponse.json({ error: 'No valid items' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      send('start', { total: items.length });

      for (let i = 0; i < items.length; i++) {
        if (closed) break;
        const item = items[i]!;
        send('progress', { index: i, videoId: item.videoId, title: item.title, status: 'summarizing' });

        // status -> summarizing
        await db.update(youtubeItems)
          .set({ status: 'summarizing' })
          .where(eq(youtubeItems.id, item.id));

        try {
          const transcript = await fetchTranscript(item.videoId, item.description);
          const result = await summarizeVideo(transcript.content, transcript.source, item.duration);

          await db.update(youtubeItems)
            .set({
              status: 'summarized',
              summarySource: transcript.source,
              summary: result.summaryMarkdown,
              keywords: result.keywords,
              oneLiner: result.oneLiner,
              summarizedAt: new Date(),
            })
            .where(eq(youtubeItems.id, item.id));

          send('progress', {
            index: i,
            videoId: item.videoId,
            title: item.title,
            status: 'summarized',
            summarySource: transcript.source,
          });
        } catch (e) {
          console.error(`[video/summarize] Failed for ${item.videoId}:`, e);
          // 실패 시 collected로 복원 (새 영상 탭에서 다시 보이도록)
          await db.update(youtubeItems)
            .set({ status: 'collected' })
            .where(eq(youtubeItems.id, item.id));

          send('progress', {
            index: i,
            videoId: item.videoId,
            title: item.title,
            status: 'failed',
            error: e instanceof Error ? e.message : '요약에 실패했습니다',
          });
        }
      }

      send('done', { total: items.length });
      close();
    },
    cancel() {
      closed = true;
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
