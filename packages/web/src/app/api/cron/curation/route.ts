import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {crawlSource, type CrawlSourceResult, getActiveSourcesForUser} from '@/lib/crawl-feed';
import {sendPushToUser} from '@/lib/push';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';

export const maxDuration = 300;

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * GET /api/cron/curation
 * Vercel Cron job: runs daily to crawl all active RSS sources for the app user.
 * Requires Authorization: Bearer <CRON_SECRET> header (set by Vercel automatically).
 * Requires CRON_USER_ID env var to identify the single app user.
 */
export const GET = withTracing('GET /api/cron/curation', async (request) => {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !authHeader || !safeCompare(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.CRON_USER_ID?.trim();
  if (!userId || !UUID_REGEX.test(userId)) {
    console.error('[cron/curation] CRON_USER_ID env var is missing or not a valid UUID');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const startedAt = Date.now();
  const since = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
  const sources = await getActiveSourcesForUser(userId);

  if (sources.length === 0) {
    return NextResponse.json({
      ok: true,
      summary: { totalSources: 0, totalNewItems: 0, successCount: 0, failCount: 0 },
      durationMs: Date.now() - startedAt,
    });
  }

  const settled = await Promise.allSettled(
    sources.map((source) => crawlSource(source, { since })),
  );
  const results: CrawlSourceResult[] = settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          sourceId: sources[i]!.id,
          sourceName: sources[i]!.name,
          success: false,
          itemsFound: 0,
          newItemsAdded: 0,
          itemsFilteredOut: 0,
          error: r.reason instanceof Error ? r.reason.message : 'Unknown error',
        },
  );

  const totalNewItems = results.reduce((sum, r) => sum + r.newItemsAdded, 0);
  const summary = {
    totalSources: sources.length,
    totalNewItems,
    successCount: results.filter((r) => r.success).length,
    failCount: results.filter((r) => !r.success).length,
  };

  console.info('[cron/curation] complete', summary, JSON.stringify(results));

  // 새 아이템이 있으면 푸시 알림 발송
  if (totalNewItems > 0) {
    const greetings = [
      '좋은 아침이에요!',
      '오늘도 좋은 하루 되세요!',
      '새로운 소식이 도착했어요!',
      '오늘의 큐레이션이 준비됐어요!',
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)]!;

    try {
      await sendPushToUser(userId, {
        title: `${greeting} +${totalNewItems}개 새 글`,
        body: `${summary.totalSources}개 소스에서 새로운 글 ${totalNewItems}개를 찾았어요. 확인해보세요!`,
        tag: 'curation-crawl',
        url: '/curation',
      });
    } catch (err) {
      console.error('[cron/curation] push notification failed', err);
    }
  }

  return NextResponse.json({
    ok: true,
    summary,
    durationMs: Date.now() - startedAt,
  });
});
