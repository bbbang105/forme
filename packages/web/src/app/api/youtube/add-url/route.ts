import {NextResponse} from 'next/server';
import {eq, and} from 'drizzle-orm';
import {db, youtubeItems} from '@forme/shared';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';
import {YOUTUBE_VIDEO_ID_REGEX} from '@/lib/validators';
import {fetchTranscript} from '@/lib/youtube-transcript';
import {summarizeVideo} from '@/lib/gemini';
import {isSafeUrl} from '@/lib/url-safety';
import {createSseStream} from '@/lib/sse';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

/** YouTube URL에서 videoId 추출 */
function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    // youtu.be/VIDEO_ID
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id && YOUTUBE_VIDEO_ID_REGEX.test(id) ? id : null;
    }
    // youtube.com/watch?v=VIDEO_ID or youtube.com/shorts/VIDEO_ID
    if (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com' || u.hostname === 'm.youtube.com') {
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/')[2];
        return id && YOUTUBE_VIDEO_ID_REGEX.test(id) ? id : null;
      }
      const id = u.searchParams.get('v');
      return id && YOUTUBE_VIDEO_ID_REGEX.test(id) ? id : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** YouTube Data API v3에서 snippet + contentDetails 조회 */
async function fetchVideoMeta(videoId: string) {
  if (!YOUTUBE_API_KEY) return null;

  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
  if (!isSafeUrl(apiUrl)) return null;

  const res = await fetch(apiUrl, {signal: AbortSignal.timeout(10_000)});
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;

  const snippet = item.snippet;
  const durationMatch = (item.contentDetails?.duration ?? '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const duration = durationMatch
    ? parseInt(durationMatch[1] || '0', 10) * 3600 + parseInt(durationMatch[2] || '0', 10) * 60 + parseInt(durationMatch[3] || '0', 10)
    : null;

  return {
    title: snippet?.title ?? videoId,
    description: snippet?.description ?? null,
    channelName: snippet?.channelTitle ?? 'Unknown',
    thumbnailUrl: snippet?.thumbnails?.high?.url ?? snippet?.thumbnails?.default?.url ?? null,
    publishedAt: snippet?.publishedAt ? new Date(snippet.publishedAt) : null,
    duration,
  };
}

export const POST = withTracing('POST /api/youtube/add-url', async (request: Request) => {
  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  let body: {url: string};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({error: 'Invalid JSON'}, {status: 400});
  }

  const {url} = body;
  if (!url || typeof url !== 'string') {
    return NextResponse.json({error: 'URL이 필요합니다'}, {status: 400});
  }

  if (url.length > 2048) {
    return NextResponse.json({error: 'URL이 너무 깁니다'}, {status: 400});
  }

  const videoId = extractVideoId(url.trim());
  if (!videoId) {
    return NextResponse.json({error: '유효한 YouTube URL이 아닙니다'}, {status: 400});
  }

  let insertedItemId: string | null = null;

  return createSseStream(
    async (send, close) => {
      try {
        // Step 1: 메타데이터 수집
        send('progress', {step: 'meta', message: '영상 정보 가져오는 중...'});
        const meta = await fetchVideoMeta(videoId);
        if (!meta) {
          send('error', {message: '영상 정보를 가져올 수 없습니다'});
          close();
          return;
        }

        send('progress', {step: 'meta_done', title: meta.title, channelName: meta.channelName, thumbnailUrl: meta.thumbnailUrl});

        // Step 2: 기존 영상 삭제 + 새 영상 삽입을 트랜잭션으로 처리
        const [inserted] = await db.transaction(async (tx) => {
          await tx.delete(youtubeItems)
            .where(and(eq(youtubeItems.userId, user.id), eq(youtubeItems.videoId, videoId)));

          return tx.insert(youtubeItems).values({
            userId: user.id,
            sourceId: null,
            videoId,
            title: meta.title,
            description: meta.description,
            thumbnailUrl: meta.thumbnailUrl,
            channelName: meta.channelName,
            publishedAt: meta.publishedAt,
            duration: meta.duration,
            status: 'summarizing',
          }).returning({id: youtubeItems.id});
        });

        if (!inserted) {
          send('error', {message: 'DB 저장에 실패했습니다'});
          close();
          return;
        }

        const itemId = inserted.id;
        insertedItemId = itemId;

        // Step 3: 자막 추출
        send('progress', {step: 'transcript', message: '자막 추출 중...'});
        const transcript = await fetchTranscript(videoId, meta.description);

        // Step 4: Gemini 요약
        send('progress', {step: 'summarize', message: 'AI 요약 생성 중...'});
        const result = await summarizeVideo(transcript.content, transcript.source, meta.duration);

        // Step 5: DB 업데이트
        await db.update(youtubeItems)
          .set({
            status: 'summarized',
            summarySource: transcript.source,
            summary: result.summaryMarkdown,
            keywords: result.keywords,
            oneLiner: result.oneLiner,
            summarizedAt: new Date(),
          })
          .where(eq(youtubeItems.id, itemId));

        send('done', {
          itemId,
          title: meta.title,
          channelName: meta.channelName,
          summarySource: transcript.source,
        });
      } catch (e) {
        console.error('[youtube/add-url] Error:', e);
        send('error', {message: '요약에 실패했습니다'});
      }
    },
    {
      onCancel: async () => {
        // Clean up orphaned DB row if still in 'summarizing' status
        if (insertedItemId) {
          try {
            await db.delete(youtubeItems)
              .where(and(eq(youtubeItems.id, insertedItemId), eq(youtubeItems.status, 'summarizing')));
          } catch {
            // best-effort cleanup
          }
        }
      },
    },
  );
});
